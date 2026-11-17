import pg from 'pg';
import type { AuthClaims } from './auth/jwt';

const { Pool, types } = pg;

types.setTypeParser(1082, (value) => value);
types.setTypeParser(1083, (value) => value.slice(0, 5));

export type Database = pg.Pool;
export type DatabaseClient = pg.PoolClient;

export function createPool(connectionString: string): Database {
  return new Pool({ connectionString, max: 10, connectionTimeoutMillis: 5_000 });
}

export async function withUser<T>(
  pool: Database,
  claims: AuthClaims,
  fn: (client: DatabaseClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({
        sub: claims.sub,
        role: 'authenticated',
        is_anonymous: claims.isAnonymous,
        app_metadata: { role: claims.admin ? 'admin' : undefined },
      }),
    ]);
    await client.query('set local role authenticated');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (error) {
    try {
      await client.query('rollback');
    } catch {
      /* 이미 끊긴 연결 */
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function withService<T>(pool: Database, fn: (client: DatabaseClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (error) {
    try {
      await client.query('rollback');
    } catch {
      /* 이미 끊긴 연결 */
    }
    throw error;
  } finally {
    client.release();
  }
}
