import type { Database, DatabaseClient } from './db.js';
import { HttpError } from './http.js';

// 본 작업이 롤백돼도 횟수는 남긴다. 같은 트랜잭션에 넣으면 거절과 함께 한도가 사라진다.
export async function takeLimit(
  pool: Database,
  bucket: string,
  windowSeconds: number,
  limit: number,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await client.query<{ allowed: boolean; retry_after: number }>(
      'select allowed, retry_after from private.rate_limit_take($1, $2, $3)',
      [bucket, windowSeconds, limit],
    );
    await client.query('commit');
    const row = result.rows[0];
    if (!row?.allowed) {
      throw new HttpError(429, 'rate_limited', { retryAfter: row?.retry_after ?? windowSeconds });
    }
  } catch (error) {
    try {
      await client.query('rollback');
    } catch {
      /* 이미 커밋됐거나 끊긴 연결 */
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function assertSpendOpen(client: DatabaseClient): Promise<void> {
  const result = await client.query<{ blocked: boolean }>('select (private.usage_status() ->> \'blocked\')::boolean as blocked');
  if (result.rows[0]?.blocked) throw new HttpError(503, 'spend_cap');
}

export async function addUsage(client: DatabaseClient, drafts: number, photoBytes: number, rsvps: number): Promise<void> {
  await client.query('select private.add_usage($1, $2, $3)', [drafts, photoBytes, rsvps]);
}
