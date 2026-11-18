import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { adminPool, appPool, insertUser, resetDatabase } from './helpers';

const admin = adminPool();
const app = appPool();

beforeAll(async () => {
  await admin.query('grant anon to invife_app');
});

beforeEach(() => resetDatabase(admin));
afterAll(async () => {
  await admin.end();
  await app.end();
});

test('소유자만 초안을 만들고 상태 컬럼은 직접 바꾸지 못한다', async () => {
  const owner = randomUUID();
  await insertUser(admin, owner, true);
  const client = await app.connect();
  try {
    await client.query('begin');
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: owner, role: 'authenticated', is_anonymous: true, app_metadata: {} }),
    ]);
    await client.query('set local role authenticated');
    const inserted = await client.query<{ owner_id: string; status: string; slug: string }>(
      `insert into invitations (theme, groom_name) values ('sage', '김신랑') returning owner_id, status, slug`,
    );
    expect(inserted.rows[0]?.owner_id).toBe(owner);
    expect(inserted.rows[0]?.status).toBe('draft');
    expect(inserted.rows[0]?.slug).toMatch(/^[A-Za-z0-9_-]{10,16}$/);
    await expect(client.query(`update invitations set status = 'published'`)).rejects.toMatchObject({ code: '42501' });
    await client.query('rollback');
  } finally {
    client.release();
  }
});

test('다른 사용자 행은 안 보이고 user_metadata 의 admin 은 무시한다', async () => {
  const owner = randomUUID();
  const other = randomUUID();
  await insertUser(admin, owner);
  await insertUser(admin, other);
  const invitation = randomUUID();
  await admin.query(
    `insert into invitations (id, owner_id, slug, groom_name) values ($1, $2, 'ownerslug1', '김신랑')`,
    [invitation, owner],
  );

  const hidden = await asUser(other, { user_metadata: { role: 'admin' }, app_metadata: {} }, (client) =>
    client.query('select id from invitations'),
  );
  expect(hidden.rows).toHaveLength(0);

  const visible = await asUser(other, { app_metadata: { role: 'admin' } }, async (client) => client.query('select id from invitations'));
  expect(visible.rows.map((row) => row.id)).toEqual([invitation]);
});

test('익명 사용자는 명단을 보지 못하고 하객 응답은 직접 넣지 못한다', async () => {
  const owner = randomUUID();
  await insertUser(admin, owner, true);
  const invitation = randomUUID();
  await admin.query(
    `insert into invitations (id, owner_id, slug, status) values ($1, $2, 'anonslug01', 'published')`,
    [invitation, owner],
  );
  await admin.query(
    `insert into recipients (invitation_id, name, token_hash) values ($1, '홍길동', $2)`,
    [invitation, Buffer.alloc(32, 1)],
  );

  const names = await asUser(owner, { is_anonymous: true }, (client) => client.query('select name from recipients'));
  expect(names.rows).toHaveLength(0);

  const permanent = randomUUID();
  await insertUser(admin, permanent, false);
  await admin.query('update invitations set owner_id = $1 where id = $2', [permanent, invitation]);
  const seen = await asUser(permanent, { is_anonymous: false }, (client) => client.query('select name from recipients'));
  expect(seen.rows.map((row) => row.name)).toEqual(['홍길동']);

  await expect(
    asUser(permanent, { is_anonymous: false }, (client) =>
      client.query(
        `insert into rsvp_responses (invitation_id, channel, name, attending, companions, edit_key_hash)
         values ($1, 'invite', '하객', true, 0, $2)`,
        [invitation, Buffer.alloc(32, 2)],
      ),
    ),
  ).rejects.toMatchObject({ code: '42501' });
});

test('정적 재생성 큐는 소유자와 app_metadata 어드민만 본다', async () => {
  const owner = randomUUID();
  const other = randomUUID();
  await insertUser(admin, owner);
  await insertUser(admin, other);
  const invitation = randomUUID();
  await admin.query(
    `insert into invitations (id, owner_id, slug, groom_name) values ($1, $2, 'rebuildslug', '김신랑')`,
    [invitation, owner],
  );
  await admin.query(
    `insert into static_rebuilds (invitation_id, owner_id, slug, action, revision, page_path, document_path)
     values ($1, $2, 'rebuildslug', 'publish', 1, '/i/rebuildslug/', '/v1/invitations/rebuildslug')`,
    [invitation, owner],
  );

  const own = await asUser(owner, { app_metadata: {} }, (client) => client.query('select slug from static_rebuilds'));
  expect(own.rows.map((row) => row.slug)).toEqual(['rebuildslug']);

  const hidden = await asUser(other, { user_metadata: { role: 'admin' }, app_metadata: {} }, (client) =>
    client.query('select slug from static_rebuilds'),
  );
  expect(hidden.rows).toHaveLength(0);

  const adminView = await asUser(other, { app_metadata: { role: 'admin' } }, (client) =>
    client.query('select slug from static_rebuilds'),
  );
  expect(adminView.rows.map((row) => row.slug)).toEqual(['rebuildslug']);

  await expect(
    asUser(owner, { app_metadata: {} }, (client) =>
      client.query(
        `insert into static_rebuilds (invitation_id, owner_id, slug, action, revision, page_path, document_path)
         values ($1, $2, 'rebuildslug', 'apply', 2, '/i/rebuildslug/', '/v1/invitations/rebuildslug')`,
        [invitation, owner],
      ),
    ),
  ).rejects.toMatchObject({ code: '42501' });
});

test('anon 역할에는 테이블 권한이 없다', async () => {
  const client = await app.connect();
  try {
    await client.query('begin');
    await client.query('set local role anon');
    await expect(client.query('select id from invitations')).rejects.toMatchObject({ code: '42501' });
    await client.query('rollback');
  } finally {
    client.release();
  }
});

async function asUser(
  sub: string,
  extra: Record<string, unknown>,
  fn: (client: import('pg').PoolClient) => Promise<import('pg').QueryResult>,
) {
  const client = await app.connect();
  try {
    await client.query('begin');
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub, role: 'authenticated', is_anonymous: false, ...extra }),
    ]);
    await client.query('set local role authenticated');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (error) {
    try {
      await client.query('rollback');
    } catch {
      /* already aborted */
    }
    throw error;
  } finally {
    client.release();
  }
}
