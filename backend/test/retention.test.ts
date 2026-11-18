import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, expect, test } from 'vitest';
import { runRetention } from '../src/jobs/retention';
import { createStorage } from '../src/photos/storage';
import { adminPool, appPool, insertUser, resetDatabase, testConfig } from './helpers';

const admin = adminPool();
const pool = appPool();
const storage = createStorage(testConfig());

beforeEach(() => resetDatabase(admin));
afterAll(async () => {
  await admin.end();
  await pool.end();
});

test('예식 30일 뒤 사진·하객만 지우고 연락처와 계좌는 설정이 켜지기 전에는 남긴다', async () => {
  const owner = randomUUID();
  const invitation = randomUUID();
  await insertUser(admin, owner, false, null);
  await admin.query(
    `insert into invitations (
       id, owner_id, slug, status, ceremony_date, groom_phone, bride_phone
     ) values ($1, $2, 'purgeinvite', 'published', '2020-01-01', '010-1111-2222', '010-3333-4444')`,
    [invitation, owner],
  );
  await admin.query(
    `insert into invitation_accounts (invitation_id, side, sort, holder, bank, account_number)
     values ($1, 'groom', 0, '김신랑', '국민', '12345678')`,
    [invitation],
  );
  await admin.query(
    `insert into invitation_photos (invitation_id, sort, status, width, height) values ($1, 0, 'ready', 800, 800)`,
    [invitation],
  );
  const recipient = randomUUID();
  await admin.query(
    `insert into recipients (id, invitation_id, name, token_hash) values ($1, $2, '김하객', $3)`,
    [recipient, invitation, Buffer.alloc(32, 7)],
  );
  await admin.query(
    `insert into rsvp_responses (invitation_id, recipient_id, channel, name, attending, companions)
     values ($1, $2, 'personal', '김하객', true, 1)`,
    [invitation, recipient],
  );

  const stats = await runRetention(pool, storage, '', new Date('2026-11-17T03:00:00.000Z'));
  expect(stats.purgedInvitationIds).toContain(invitation);
  expect(stats.noticed).toBe(1);

  const left = await admin.query<{ groom_phone: string; purged_at: Date | null }>('select groom_phone, purged_at from invitations where id = $1', [invitation]);
  expect(left.rows[0]?.groom_phone).toBe('010-1111-2222');
  expect(left.rows[0]?.purged_at).toBeTruthy();
  expect((await admin.query('select id from invitation_photos where invitation_id = $1', [invitation])).rowCount).toBe(0);
  expect((await admin.query('select id from recipients where invitation_id = $1', [invitation])).rowCount).toBe(0);
  expect((await admin.query('select id from rsvp_responses where invitation_id = $1', [invitation])).rowCount).toBe(0);
  expect((await admin.query('select id from invitation_accounts where invitation_id = $1', [invitation])).rowCount).toBe(1);
  const notice = await admin.query<{ message: string }>('select message from host_notices where invitation_id = $1', [invitation]);
  expect(notice.rows[0]?.message).toContain('자동으로 지워져요');
  const outbox = await admin.query<{ status: string }>('select status from private.notice_outbox where invitation_id = $1', [invitation]);
  expect(outbox.rows[0]?.status).toBe('skipped');

  await admin.query(`
    update private.app_settings
    set purge_include_host_contact = true, purge_include_accounts = true
    where id = 1
  `);
  await admin.query('update invitations set purged_at = null, purge_notice_sent_at = null where id = $1', [invitation]);
  await runRetention(pool, storage, '', new Date('2026-11-17T04:00:00.000Z'));
  const cleared = await admin.query<{ groom_phone: string }>('select groom_phone from invitations where id = $1', [invitation]);
  expect(cleared.rows[0]?.groom_phone).toBe('');
  expect((await admin.query('select id from invitation_accounts where invitation_id = $1', [invitation])).rowCount).toBe(0);
});
