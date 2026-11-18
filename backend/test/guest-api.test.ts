import { randomUUID } from 'node:crypto';
import pg from 'pg';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeEach, expect, test } from 'vitest';
import { createApp } from '../src/app';
import { linkToken, recipientMaterial, sharedMaterial, tokenHash } from '../src/domain/tokens';
import { createStorage } from '../src/photos/storage';
import { adminPool, appPool, insertUser, LINK_SECRET, nestClient, readJson, resetDatabase, testConfig } from './helpers';

const admin = adminPool();
const pool = appPool();
const now = new Date('2026-11-17T03:00:00.000Z');
const storage = createStorage(testConfig());
const nestApps: INestApplication[] = [];

beforeEach(() => resetDatabase(admin));
afterAll(async () => {
  await Promise.all(nestApps.map((app) => app.close()));
  await admin.end();
  await pool.end();
});

async function guestApp(options: { turnstile?: boolean; contextLimit?: number; verify?: (token: string) => 'ok' | 'failed' | 'unavailable' } = {}) {
  const config = testConfig({
    turnstileSecret: options.turnstile ? 'secret' : '',
    limits: options.contextLimit ? { ...testConfig().limits, contextPerMinute: options.contextLimit } : undefined,
  });
  const app = await createApp({
    pool,
    config,
    storage,
    now: () => now,
    verifyTurnstile: async (token) => options.verify?.(token) ?? 'ok',
  });
  nestApps.push(app);
  return nestClient(app);
}

test('없는 슬러그, 마감, 검증, 개인 링크 upsert, 공용 editKey, 회수', async () => {
  const app = await guestApp();
  const open = await seedInvitation(admin, { slug: 'openinvite1', date: '2027-06-01' });
  const closed = await seedInvitation(admin, { slug: 'closedinv01', date: '2026-11-01' });

  const missing = await readJson(await app.request('/functions/v1/rsvp-context', { method: 'POST', body: JSON.stringify({ slug: 'missing0001' }), headers: jsonHeaders() }));
  expect(missing.status).toBe(404);
  expect(missing.body).toEqual({ error: { code: 'not_found' } });

  const openContext = await readJson(await app.request('/functions/v1/rsvp-context', { method: 'POST', body: JSON.stringify({ slug: open.slug }), headers: jsonHeaders() }));
  expect(openContext.status).toBe(200);
  expect(openContext.body).toMatchObject({ status: 'open', link: 'invite', deadline: '2027-05-31T14:59:59.999Z' });

  const closedContext = await readJson(await app.request('/functions/v1/rsvp-context', { method: 'POST', body: JSON.stringify({ slug: closed.slug }), headers: jsonHeaders() }));
  expect(closedContext.body).toMatchObject({ status: 'closed', link: 'invite' });
  const closedSubmit = await readJson(await app.request('/functions/v1/rsvp', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ slug: closed.slug, channel: 'invite', name: '하객', attending: true, companions: 0 }),
  }));
  expect(closedSubmit.status).toBe(409);
  expect(closedSubmit.body).toEqual({ error: { code: 'closed' } });

  const badName = await readJson(await app.request('/functions/v1/rsvp', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ slug: open.slug, channel: 'invite', name: '  ', attending: true, companions: 0 }),
  }));
  expect(badName).toMatchObject({ status: 400, body: { error: { code: 'validation', field: 'name', reason: 'required' } } });

  const longName = '가'.repeat(21);
  const tooLong = await readJson(await app.request('/functions/v1/rsvp', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ slug: open.slug, channel: 'invite', name: longName, attending: true, companions: 0 }),
  }));
  expect(tooLong.body).toEqual({ error: { code: 'validation', field: 'name', reason: 'too_long' } });

  const companions = await readJson(await app.request('/functions/v1/rsvp', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ slug: open.slug, channel: 'invite', name: '하객', attending: false, companions: 2 }),
  }));
  expect(companions.body).toEqual({ error: { code: 'validation', field: 'companions', reason: 'companions_when_absent' } });

  const range = await readJson(await app.request('/functions/v1/rsvp', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ slug: open.slug, channel: 'invite', name: '하객', attending: true, companions: 11 }),
  }));
  expect(range.body).toEqual({ error: { code: 'validation', field: 'companions', reason: 'out_of_range' } });

  const malformed = await readJson(await app.request('/functions/v1/rsvp', { method: 'POST', headers: jsonHeaders(), body: '{' }));
  expect(malformed.status).toBe(400);
  expect(malformed.body).toEqual({ error: { code: 'validation' } });

  const first = await readJson(await app.request('/functions/v1/rsvp', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ slug: open.slug, channel: 'invite', name: ' 홍길동 ', attending: true, companions: 2 }),
  }));
  expect(first.status).toBe(200);
  const created = first.body.response as { id: string; name: string };
  expect(created.name).toBe('홍길동');
  expect(typeof first.body.editKey).toBe('string');
  expect(first.body.edited).toBe(false);

  const edited = await readJson(await app.request('/functions/v1/rsvp', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({
      slug: open.slug,
      channel: 'invite',
      name: '홍길순',
      attending: true,
      companions: 1,
      responseId: created.id,
      editKey: first.body.editKey,
    }),
  }));
  expect(edited.status).toBe(200);
  expect(edited.body.edited).toBe(true);
  expect(edited.body.editKey).toBeUndefined();

  const forbidden = await readJson(await app.request('/functions/v1/rsvp', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({
      slug: open.slug,
      channel: 'invite',
      name: '남',
      attending: true,
      companions: 0,
      responseId: created.id,
      editKey: 'wrong-key',
    }),
  }));
  expect(forbidden.status).toBe(403);
  expect(forbidden.body).toEqual({ error: { code: 'edit_forbidden' } });

  const half = await readJson(await app.request('/functions/v1/rsvp', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ slug: open.slug, channel: 'invite', name: '남', attending: true, companions: 0, responseId: created.id }),
  }));
  expect(half.status).toBe(403);

  const personal = await readJson(await app.request('/functions/v1/rsvp', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({
      slug: open.slug,
      channel: 'personal',
      token: open.token,
      name: '초대손님',
      attending: true,
      companions: 0,
      responseId: randomUUID(),
    }),
  }));
  expect(personal.status).toBe(200);
  expect(personal.body.editKey).toBeUndefined();
  const again = await readJson(await app.request('/functions/v1/rsvp', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ slug: open.slug, channel: 'personal', token: open.token, name: '이름변경', attending: false, companions: 0 }),
  }));
  expect(again.body.edited).toBe(true);
  expect((again.body.response as { id: string; name: string }).id).toBe((personal.body.response as { id: string }).id);
  expect((again.body.response as { name: string }).name).toBe('이름변경');

  const personalContext = await readJson(await app.request('/functions/v1/rsvp-context', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ slug: open.slug, token: open.token }),
  }));
  expect(personalContext.body).toMatchObject({ link: 'personal', prefillName: '김하객', response: { name: '이름변경' } });

  await admin.query('update recipients set revoked_at = now() where id = $1', [open.recipientId]);
  const revokedContext = await readJson(await app.request('/functions/v1/rsvp-context', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ slug: open.slug, token: open.token }),
  }));
  expect(revokedContext.status).toBe(200);
  expect(revokedContext.body).toMatchObject({ link: 'personal', revoked: true });
  expect(revokedContext.body.prefillName).toBeUndefined();
  expect(JSON.stringify(revokedContext.body)).not.toContain('김하객');

  const revokedSubmit = await readJson(await app.request('/functions/v1/rsvp', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ slug: open.slug, channel: 'personal', token: open.token, name: '김하객', attending: true, companions: 0 }),
  }));
  expect(revokedSubmit.status).toBe(410);
  expect(revokedSubmit.body).toEqual({ error: { code: 'revoked' } });

  const unknown = await readJson(await app.request('/functions/v1/rsvp-context', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ slug: open.slug, token: 'not-a-real-token' }),
  }));
  expect(unknown.status).toBe(404);

  const shared = await readJson(await app.request('/functions/v1/rsvp', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ slug: open.slug, channel: 'rsvp_link', token: open.shared, name: '공용', attending: true, companions: 0 }),
  }));
  expect(shared.status).toBe(200);
  expect(typeof shared.body.editKey).toBe('string');
});

test('Turnstile 은 공용 첫 제출만 검사하고 수정 토큰은 무시한다', async () => {
  const open = await seedInvitation(admin, { slug: 'turnstile1', date: '2027-06-01' });
  const app = await guestApp({ turnstile: true, verify: (token) => (token === 'good' ? 'ok' : 'failed') });
  const missing = await readJson(await app.request('/functions/v1/rsvp', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ slug: open.slug, channel: 'invite', name: '하객', attending: true, companions: 0 }),
  }));
  expect(missing.status).toBe(403);
  expect(missing.body).toEqual({ error: { code: 'turnstile_failed' } });

  const bad = await readJson(await app.request('/functions/v1/rsvp', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ slug: open.slug, channel: 'invite', name: '하객', attending: true, companions: 0, turnstileToken: 'bad' }),
  }));
  expect(bad.body).toEqual({ error: { code: 'turnstile_failed' } });

  const created = await readJson(await app.request('/functions/v1/rsvp', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ slug: open.slug, channel: 'invite', name: '하객', attending: true, companions: 0, turnstileToken: 'good' }),
  }));
  expect(created.status).toBe(200);
  const updated = await readJson(await app.request('/functions/v1/rsvp', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({
      slug: open.slug,
      channel: 'invite',
      name: '수정',
      attending: true,
      companions: 0,
      responseId: (created.body.response as { id: string }).id,
      editKey: created.body.editKey,
      turnstileToken: 'expired-widget',
    }),
  }));
  expect(updated.status).toBe(200);

  const personal = await readJson(await app.request('/functions/v1/rsvp', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ slug: open.slug, channel: 'personal', token: open.token, name: '개인', attending: true, companions: 0, turnstileToken: 'bad' }),
  }));
  expect(personal.status).toBe(200);

  const down = await guestApp({ turnstile: true, verify: () => 'unavailable' });
  const unavailable = await readJson(await down.request('/functions/v1/rsvp', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ slug: open.slug, channel: 'rsvp_link', token: open.shared, name: '공용', attending: true, companions: 0, turnstileToken: 'good' }),
  }));
  expect(unavailable.status).toBe(503);
  expect(unavailable.body).toEqual({ error: { code: 'unavailable' } });
});

test('횟수 제한은 Retry-After 를 남기고 데이터베이스가 죽으면 unavailable', async () => {
  const open = await seedInvitation(admin, { slug: 'ratelimit1', date: '2027-06-01' });
  const app = await guestApp({ contextLimit: 2 });
  const body = JSON.stringify({ slug: open.slug });
  expect((await readJson(await app.request('/functions/v1/rsvp-context', { method: 'POST', headers: jsonHeaders(), body }))).status).toBe(200);
  expect((await readJson(await app.request('/functions/v1/rsvp-context', { method: 'POST', headers: jsonHeaders(), body }))).status).toBe(200);
  const limited = await readJson(await app.request('/functions/v1/rsvp-context', { method: 'POST', headers: jsonHeaders(), body }));
  expect(limited.status).toBe(429);
  expect(limited.body).toMatchObject({ error: { code: 'rate_limited' } });
  expect(Number(limited.retryAfter)).toBeGreaterThan(0);

  const dead = new pg.Pool({ connectionString: 'postgres://invife_app:invife_app@127.0.0.1:1/invife_test', connectionTimeoutMillis: 400, max: 1 });
  const downApp = await createApp({ pool: dead, config: testConfig(), storage, now: () => now });
  nestApps.push(downApp);
  const down = nestClient(downApp);
  const result = await readJson(await down.request('/functions/v1/rsvp-context', { method: 'POST', headers: jsonHeaders(), body }));
  expect(result.status).toBe(503);
  expect(result.body).toEqual({ error: { code: 'unavailable' } });
  await dead.end();
});

function jsonHeaders(): Record<string, string> {
  return { 'content-type': 'application/json' };
}

async function seedInvitation(db: pg.Pool, input: { slug: string; date: string }) {
  const owner = randomUUID();
  const invitationId = randomUUID();
  const recipientId = randomUUID();
  await insertUser(db, owner);
  const token = linkToken(LINK_SECRET, recipientMaterial(recipientId, 1));
  const shared = linkToken(LINK_SECRET, sharedMaterial(invitationId, 1));
  await db.query(
    `insert into invitations (
       id, owner_id, slug, status, groom_name, bride_name, ceremony_date, ceremony_time,
       venue_name, address, shared_link_version, shared_rsvp_token_hash, published_document
     ) values ($1, $2, $3, 'published', '김신랑', '이신부', $4, '14:00', '식물관', '서울', 1, $5, $6::jsonb)`,
    [invitationId, owner, input.slug, input.date, tokenHash(shared), JSON.stringify({ slug: input.slug, groom: { name: '김신랑' } })],
  );
  await db.query(
    `insert into recipients (id, invitation_id, name, token_hash) values ($1, $2, '김하객', $3)`,
    [recipientId, invitationId, tokenHash(token)],
  );
  return { slug: input.slug, token, shared, recipientId, invitationId };
}
