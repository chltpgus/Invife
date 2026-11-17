import type { Database } from '../db';
import { withService } from '../db';
import type { ObjectStorage } from '../photos/storage';

type RetentionStats = {
  noticed: number;
  purgedInvitationIds: string[];
  hardDeletedInvitationIds: string[];
  expiredDraftInvitationIds: string[];
};

export async function runRetention(pool: Database, storage: ObjectStorage, webhook: string, now = new Date()): Promise<RetentionStats> {
  const stats = await withService(pool, async (client) => {
    const result = await client.query<{ stats: RetentionStats }>('select public.run_retention($1) as stats', [now.toISOString()]);
    return (
      result.rows[0]?.stats ?? {
        noticed: 0,
        purgedInvitationIds: [],
        hardDeletedInvitationIds: [],
        expiredDraftInvitationIds: [],
      }
    );
  });
  const ids = new Set([
    ...stats.purgedInvitationIds,
    ...stats.hardDeletedInvitationIds,
    ...stats.expiredDraftInvitationIds,
  ]);
  for (const id of ids) await storage.deletePrefix(`inv/${id}`);
  await dispatchOutbox(pool, webhook);
  return stats;
}

export async function dispatchOutbox(pool: Database, webhook: string): Promise<void> {
  const rows = await withService(pool, async (client) => {
    const result = await client.query<{ id: string; to_address: string | null; body: string; channel: string }>(
      'select * from private.pull_notice_outbox(50)',
    );
    return result.rows;
  });
  for (const row of rows) {
    let status: 'sent' | 'skipped' | 'failed' = 'skipped';
    if (webhook && row.to_address) {
      try {
        const response = await fetch(webhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel: row.channel, to: row.to_address, body: row.body }),
        });
        status = response.ok ? 'sent' : 'failed';
      } catch {
        status = 'failed';
      }
    }
    await withService(pool, (client) => client.query('select private.mark_notice_outbox($1, $2)', [row.id, status]));
  }
}
