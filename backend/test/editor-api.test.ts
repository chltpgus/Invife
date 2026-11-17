import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, expect, test } from 'vitest';
import { createApp } from '../src/app';
import { createStorage } from '../src/photos/storage';
import { accessToken, adminPool, appPool, insertUser, readJson, resetDatabase, testConfig } from './helpers';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const admin = adminPool();
const pool = appPool();
const config = testConfig();
const storage = createStorage(config);
const app = createApp({ pool, config, storage, now: () => new Date('2026-11-17T03:00:00.000Z') });

beforeEach(() => resetDatabase(admin));
afterAll(async () => {
  await admin.end();
  await pool.end();
});

test('초안, 자동저장 충돌, 사진, 발행, 같은 슬러그 재발행, 삭제', async () => {
  const host = randomUUID();
  await insertUser(admin, host, false);
  const token = await accessToken(host);

  const session = await readJson(await app.request('/v1/editor/session', { headers: auth(token) }));
  expect(session.body).toMatchObject({ userId: host, isAnonymous: false, showAds: false, plan: 'free' });

  const created = await readJson(await app.request('/v1/editor/invitations', { method: 'POST', headers: auth(token), body: '{}' }));
  expect(created.status).toBe(201);
  const invitation = created.body.invitation as { id: string; slug: string; updatedAt: string };
  const saved = await readJson(
    await app.request(`/v1/editor/invitations/${invitation.id}`, {
      method: 'PATCH',
      headers: { ...auth(token), 'if-match': invitation.updatedAt },
      body: JSON.stringify({
        groom: { name: '김신랑' },
        bride: { name: '이신부' },
        ceremony: { date: '2027-06-01', time: '14:00', venueName: '식물관', address: '서울시 종로' },
        greeting: '인사말',
      }),
    }),
  );
  expect(saved.status).toBe(200);
  const conflict = await readJson(
    await app.request(`/v1/editor/invitations/${invitation.id}`, {
      method: 'PATCH',
      headers: { ...auth(token), 'if-match': invitation.updatedAt },
      body: JSON.stringify({ greeting: '다시' }),
    }),
  );
  expect(conflict.status).toBe(409);
  expect(conflict.body.error).toMatchObject({ code: 'conflict' });
  expect(conflict.body.invitation).toBeTruthy();

  const current = conflict.body.invitation as { updatedAt: string };
  const presign = await readJson(
    await app.request(`/v1/editor/invitations/${invitation.id}/photos/presign`, {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({ contentType: 'image/png', byteSize: PNG.length }),
    }),
  );
  expect(presign.status).toBe(201);
  const uploadPath = new URL(presign.body.uploadUrl as string).pathname;
  const uploaded = await app.request(uploadPath, { method: 'PUT', body: PNG, headers: { 'content-type': 'image/png' } });
  expect(uploaded.status).toBe(204);
  const photoId = presign.body.photoId as string;
  const completed = await readJson(
    await app.request(`/v1/editor/invitations/${invitation.id}/photos/${photoId}/complete`, { method: 'POST', headers: auth(token) }),
  );
  expect(completed.status).toBe(200);
  expect(completed.body.photo).toMatchObject({ status: 'ready', lowQuality: true });
  expect(await storage.get(`inv/${invitation.id}/${photoId}/w800.webp`)).toBeTruthy();
  expect(await storage.get(`inv/${invitation.id}/${photoId}/w1600.webp`)).toBeTruthy();
  expect(await storage.get(`inv/${invitation.id}/${photoId}/original`)).toBeNull();

  const people = await readJson(
    await app.request(`/v1/editor/invitations/${invitation.id}/recipients`, {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({ names: ['독고하객'] }),
    }),
  );
  expect(people.status).toBe(201);
  expect(JSON.stringify(people.body)).toContain('독고하객');

  const published = await readJson(await app.request(`/v1/editor/invitations/${invitation.id}/publish`, { method: 'POST', headers: auth(token) }));
  expect(published.status).toBe(200);
  const publishedInvitation = published.body.invitation as { slug: string; groom: { givenName: string } };
  expect(publishedInvitation.groom.givenName).toBe('신랑');

  const publicBody = await readJson(await app.request(`/v1/invitations/${publishedInvitation.slug}`));
  expect(publicBody.status).toBe(200);
  const serialized = JSON.stringify(publicBody.body);
  expect(serialized).not.toContain('독고하객');
  expect(serialized).not.toContain('thumb.webp');
  expect(serialized).toContain('w800.webp');
  const list = await readJson(await app.request('/v1/invitations'));
  expect(list.body).toEqual([{ slug: publishedInvitation.slug }]);

  const hidden = await readJson(await app.request(`/v1/editor/invitations/${invitation.id}/unpublish`, { method: 'POST', headers: auth(token) }));
  expect(hidden.status).toBe(200);
  expect((await readJson(await app.request(`/v1/invitations/${publishedInvitation.slug}`))).status).toBe(404);

  const again = await readJson(await app.request(`/v1/editor/invitations/${invitation.id}/publish`, { method: 'POST', headers: auth(token) }));
  expect(again.status).toBe(200);
  expect((again.body.invitation as { slug: string }).slug).toBe(publishedInvitation.slug);

  const needsConfirm = await readJson(await app.request(`/v1/editor/invitations/${invitation.id}`, { method: 'DELETE', headers: auth(token), body: '{}' }));
  expect(needsConfirm.status).toBe(400);
  const removed = await readJson(
    await app.request(`/v1/editor/invitations/${invitation.id}`, {
      method: 'DELETE',
      headers: auth(token),
      body: JSON.stringify({ confirm: '삭제' }),
    }),
  );
  expect(removed.body).toEqual({ ok: true });
  expect((await readJson(await app.request(`/v1/invitations/${publishedInvitation.slug}`))).status).toBe(404);
  expect(current.updatedAt).toBeTruthy();
});

test('익명 발행은 막히고, 클레임 티켓으로 기존 계정에 초안을 옮긴다', async () => {
  const anon = randomUUID();
  const host = randomUUID();
  await insertUser(admin, anon, true);
  await insertUser(admin, host, false);
  const anonToken = await accessToken(anon, { anonymous: true });
  const hostToken = await accessToken(host);

  const created = await readJson(await app.request('/v1/editor/invitations', { method: 'POST', headers: auth(anonToken), body: '{}' }));
  const id = (created.body.invitation as { id: string }).id;
  const denied = await readJson(await app.request(`/v1/editor/invitations/${id}/publish`, { method: 'POST', headers: auth(anonToken) }));
  expect(denied.status).toBe(403);
  expect(denied.body).toMatchObject({ error: { code: 'forbidden', reason: 'login_required' } });

  const ticket = await readJson(
    await app.request('/v1/editor/claim-tickets', {
      method: 'POST',
      headers: auth(anonToken),
      body: JSON.stringify({ invitationIds: [id] }),
    }),
  );
  expect(ticket.status).toBe(201);
  const claimed = await readJson(
    await app.request('/v1/editor/drafts/claim', {
      method: 'POST',
      headers: auth(hostToken),
      body: JSON.stringify({ ticket: ticket.body.ticket }),
    }),
  );
  expect(claimed.status).toBe(200);
  expect(claimed.body.invitations).toEqual([expect.objectContaining({ id })]);
  expect((await readJson(await app.request(`/v1/editor/invitations/${id}`, { headers: auth(anonToken) }))).status).toBe(404);
  expect((await readJson(await app.request(`/v1/editor/invitations/${id}`, { headers: auth(hostToken) }))).status).toBe(200);
});

test('지출 상한에 닿으면 초안 생성이 멈춘다', async () => {
  const host = randomUUID();
  await insertUser(admin, host);
  await admin.query('update private.app_settings set spend_cap_cents = 0 where id = 1');
  const result = await readJson(
    await app.request('/v1/editor/invitations', { method: 'POST', headers: auth(await accessToken(host)), body: '{}' }),
  );
  expect(result.status).toBe(503);
  expect(result.body).toEqual({ error: { code: 'spend_cap' } });
});

function auth(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
}
