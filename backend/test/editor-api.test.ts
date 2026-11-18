import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, expect, test } from 'vitest';
import { createApp } from '../src/app';
import { createStorage } from '../src/photos/storage';
import { accessToken, adminPool, appPool, insertUser, nestClient, readJson, resetDatabase, testConfig } from './helpers';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const admin = adminPool();
const pool = appPool();
const config = testConfig();
const storage = createStorage(config);
const queued: Array<() => Promise<void>> = [];
const nestApp = await createApp({
  pool,
  config,
  storage,
  now: () => new Date('2026-11-17T03:00:00.000Z'),
  schedule: (task) => queued.push(task),
});
const app = nestClient(nestApp);

beforeEach(async () => {
  queued.length = 0;
  await resetDatabase(admin);
});
afterAll(async () => {
  await nestApp.close();
  await admin.end();
  await pool.end();
});

test('초안, 자동저장 충돌, 사진, 발행, 같은 슬러그 재발행, 삭제', async () => {
  const host = randomUUID();
  await insertUser(admin, host, false);
  const token = await accessToken(host);

  const unauthorized = await readJson(await app.request('/v1/editor/session'));
  expect(unauthorized.status).toBe(401);
  expect(unauthorized.body).toEqual({ error: { code: 'unauthorized' } });
  const invalidBearer = await readJson(
    await app.request('/v1/editor/session', { headers: { authorization: 'Bearer invalid' } }),
  );
  expect(invalidBearer.status).toBe(401);
  expect(invalidBearer.body).toEqual({ error: { code: 'unauthorized' } });

  const session = await readJson(await app.request('/v1/editor/session', { headers: auth(token) }));
  expect(session.body).toMatchObject({ userId: host, isAnonymous: false, showAds: false, plan: 'free' });

  const created = await readJson(await app.request('/v1/editor/invitations', { method: 'POST', headers: auth(token), body: '{}' }));
  expect(created.status).toBe(201);
  const invitation = created.body.invitation as { id: string; slug: string; updatedAt: string; etag: string };
  expect(created.etag).toBe(`"${invitation.etag}"`);
  const missingMatch = await readJson(
    await app.request(`/v1/editor/invitations/${invitation.id}`, { method: 'PATCH', headers: auth(token), body: '{}' }),
  );
  expect(missingMatch.body).toEqual({ error: { code: 'validation', field: 'if-match', reason: 'required' } });
  const saved = await readJson(
    await app.request(`/v1/editor/invitations/${invitation.id}`, {
      method: 'PATCH',
      headers: { ...auth(token), 'if-match': invitation.etag },
      body: JSON.stringify({
        groom: { name: '김신랑', givenName: '신랑', phone: '010' },
        bride: { name: '이신부', givenName: '신부' },
        ceremony: { date: '2027-06-01', time: '14:00', venueName: '식물관', address: '서울시 종로' },
        greeting: '인사말',
      }),
    }),
  );
  expect((saved.body.invitation as { groom: { phone: string; givenName: string } }).groom).toMatchObject({ phone: '010', givenName: '신랑' });
  expect(saved.status).toBe(200);
  const conflict = await readJson(
    await app.request(`/v1/editor/invitations/${invitation.id}`, {
      method: 'PATCH',
      headers: { ...auth(token), 'if-match': invitation.etag },
      body: JSON.stringify({ greeting: '다시' }),
    }),
  );
  expect(conflict.status).toBe(409);
  expect(conflict.body.error).toMatchObject({ code: 'conflict' });
  expect(conflict.etag).toBe(`"${(conflict.body.invitation as { etag: string }).etag}"`);
  expect(conflict.body.etag).toBe((conflict.body.invitation as { etag: string }).etag);

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
  expect(completed.status).toBe(202);
  expect(completed.body.photo).toMatchObject({ status: 'processing' });
  expect(queued).toHaveLength(1);
  await queued.shift()?.();
  const ready = await readJson(await app.request(`/v1/editor/invitations/${invitation.id}/photos/${photoId}`, { headers: auth(token) }));
  expect(ready.body.photo).toMatchObject({ status: 'ready', lowQuality: true, filter: 'original' });
  expect(ready.body.etag).toBe(completed.body.etag);
  expect((ready.body.photo as { src: { w800: string } }).src.w800).toContain('w800.webp');
  const currentAfterPhoto = ready.body.etag as string;
  const recropped = await readJson(
    await app.request(`/v1/editor/invitations/${invitation.id}`, {
      method: 'PATCH',
      headers: { ...auth(token), 'if-match': currentAfterPhoto },
      body: JSON.stringify({
        photos: [{ id: photoId, sort: 0, filter: 'mono', crop: { x: 0, y: 0, width: 1, height: 1 } }],
      }),
    }),
  );
  const recroppedPhoto = (recropped.body.invitation as { photos: Array<{ status: string; src: { w800: string } | null; filter: string }> }).photos[0];
  expect(recroppedPhoto).toMatchObject({ status: 'processing', filter: 'mono' });
  expect(recroppedPhoto?.src?.w800).toContain('w800.webp');
  expect(queued).toHaveLength(1);
  await queued.shift()?.();
  expect(await storage.get(`inv/${invitation.id}/${photoId}/w800.webp`)).toBeTruthy();
  expect(await storage.get(`inv/${invitation.id}/${photoId}/w1600.webp`)).toBeTruthy();
  expect(await storage.get(`inv/${invitation.id}/${photoId}/original`)).toBeNull();

  const afterPhoto = await readJson(await app.request(`/v1/editor/invitations/${invitation.id}`, { headers: auth(token) }));
  const phoneFixed = await readJson(
    await app.request(`/v1/editor/invitations/${invitation.id}`, {
      method: 'PATCH',
      headers: { ...auth(token), 'if-match': (afterPhoto.body.invitation as { etag: string }).etag },
      body: JSON.stringify({ groom: { phone: '010-1234-5678' } }),
    }),
  );
  expect(phoneFixed.status).toBe(200);

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
  const publishedInvitation = published.body.invitation as { slug: string; groom: { givenName: string; phone: string } };
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

test('빈 서명용 이름과 작성 중인 전화는 발행에서만 거절한다', async () => {
  const host = randomUUID();
  await insertUser(admin, host, false);
  const token = await accessToken(host);
  const created = await readJson(await app.request('/v1/editor/invitations', { method: 'POST', headers: auth(token), body: '{}' }));
  const invitation = created.body.invitation as { id: string; etag: string };
  const draft = await readJson(
    await app.request(`/v1/editor/invitations/${invitation.id}`, {
      method: 'PATCH',
      headers: { ...auth(token), 'if-match': invitation.etag },
      body: JSON.stringify({
        groom: { name: '남궁민', phone: '010' },
        bride: { name: '이신부', givenName: '신부' },
        ceremony: { date: '2027-06-01', time: '14:00', venueName: '식물관', address: '서울' },
        accounts: [{ side: 'groom', holder: '남', bank: '국민', number: '12' }],
      }),
    }),
  );
  expect(draft.status).toBe(200);
  expect((draft.body.invitation as { groom: { givenName: string; phone: string } }).groom).toMatchObject({ givenName: '', phone: '010' });
  const rejected = await readJson(await app.request(`/v1/editor/invitations/${invitation.id}/publish`, { method: 'POST', headers: auth(token) }));
  expect(rejected.status).toBe(400);
  expect(rejected.body).toEqual({ error: { code: 'validation', field: 'groom.givenName', reason: 'required' } });
  const named = await readJson(
    await app.request(`/v1/editor/invitations/${invitation.id}`, {
      method: 'PATCH',
      headers: { ...auth(token), 'if-match': (draft.body.invitation as { etag: string }).etag },
      body: JSON.stringify({ groom: { givenName: '민' } }),
    }),
  );
  expect(named.status).toBe(200);
  const phoneRejected = await readJson(await app.request(`/v1/editor/invitations/${invitation.id}/publish`, { method: 'POST', headers: auth(token) }));
  expect(phoneRejected.body).toEqual({ error: { code: 'validation', field: 'groom.phone', reason: 'invalid' } });
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

test('사진 변환이 끝나도 etag 는 그대로이고, 그 값으로 자동 저장된다', async () => {
  const host = randomUUID();
  await insertUser(admin, host, false);
  const token = await accessToken(host);
  const created = await readJson(await app.request('/v1/editor/invitations', { method: 'POST', headers: auth(token), body: '{}' }));
  const invitation = created.body.invitation as { id: string; etag: string };
  const presign = await readJson(
    await app.request(`/v1/editor/invitations/${invitation.id}/photos/presign`, {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({ contentType: 'image/png', byteSize: PNG.length }),
    }),
  );
  expect(presign.status).toBe(201);
  const uploadPath = new URL(presign.body.uploadUrl as string).pathname;
  expect((await app.request(uploadPath, { method: 'PUT', body: PNG, headers: { 'content-type': 'image/png' } })).status).toBe(204);
  const completed = await readJson(
    await app.request(`/v1/editor/invitations/${invitation.id}/photos/${presign.body.photoId}/complete`, {
      method: 'POST',
      headers: auth(token),
    }),
  );
  expect(completed.status).toBe(202);
  const etag = completed.body.etag as string;
  expect(queued).toHaveLength(1);
  await queued.shift()?.();
  const photo = await readJson(
    await app.request(`/v1/editor/invitations/${invitation.id}/photos/${presign.body.photoId}`, { headers: auth(token) }),
  );
  const photos = await readJson(await app.request(`/v1/editor/invitations/${invitation.id}/photos`, { headers: auth(token) }));
  expect(photo.body.photo).toMatchObject({ status: 'ready' });
  expect(photo.body.etag).toBe(etag);
  expect(photos.body.etag).toBe(etag);
  const saved = await readJson(
    await app.request(`/v1/editor/invitations/${invitation.id}`, {
      method: 'PATCH',
      headers: { ...auth(token), 'if-match': etag },
      body: JSON.stringify({ greeting: '변환 뒤에도 저장' }),
    }),
  );
  expect(saved.status).toBe(200);
  expect((saved.body.invitation as { greeting: string; etag: string }).greeting).toBe('변환 뒤에도 저장');
  expect((saved.body.invitation as { etag: string }).etag).not.toBe(etag);
});

test('전체 프레임 크롭과 같은 필터는 다시 변환하지 않고, 크롭을 빼면 전체로 저장한다', async () => {
  const host = randomUUID();
  await insertUser(admin, host, false);
  const token = await accessToken(host);
  const created = await readJson(await app.request('/v1/editor/invitations', { method: 'POST', headers: auth(token), body: '{}' }));
  const invitation = created.body.invitation as { id: string; etag: string };
  const presign = await readJson(
    await app.request(`/v1/editor/invitations/${invitation.id}/photos/presign`, {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({ contentType: 'image/png', byteSize: PNG.length }),
    }),
  );
  const uploadPath = new URL(presign.body.uploadUrl as string).pathname;
  expect((await app.request(uploadPath, { method: 'PUT', body: PNG, headers: { 'content-type': 'image/png' } })).status).toBe(204);
  const photoId = presign.body.photoId as string;
  const completed = await readJson(
    await app.request(`/v1/editor/invitations/${invitation.id}/photos/${photoId}/complete`, { method: 'POST', headers: auth(token) }),
  );
  await queued.shift()?.();
  const ready = await readJson(await app.request(`/v1/editor/invitations/${invitation.id}`, { headers: auth(token) }));
  const same = await readJson(
    await app.request(`/v1/editor/invitations/${invitation.id}`, {
      method: 'PATCH',
      headers: { ...auth(token), 'if-match': (ready.body.invitation as { etag: string }).etag },
      body: JSON.stringify({
        photos: [{ id: photoId, sort: 0, focal: { x: 0.2, y: 0.3 }, filter: 'original', crop: { x: 0, y: 0, width: 1, height: 1 } }],
      }),
    }),
  );
  expect(completed.status).toBe(202);
  expect(same.status).toBe(200);
  expect(queued).toHaveLength(0);
  const kept = (same.body.invitation as { photos: Array<{ status: string; filter: string; crop: { x: number; y: number; width: number; height: number } }> }).photos[0];
  expect(kept).toMatchObject({ status: 'ready', filter: 'original', crop: { x: 0, y: 0, width: 1, height: 1 } });
  const omitted = await readJson(
    await app.request(`/v1/editor/invitations/${invitation.id}`, {
      method: 'PATCH',
      headers: { ...auth(token), 'if-match': (same.body.invitation as { etag: string }).etag },
      body: JSON.stringify({ photos: [{ id: photoId, sort: 0, focal: { x: 0.6, y: 0.4 } }] }),
    }),
  );
  expect(omitted.status).toBe(200);
  expect(queued).toHaveLength(0);
  expect((omitted.body.invitation as { photos: Array<{ status: string; crop: { width: number } }> }).photos[0]).toMatchObject({
    status: 'ready',
    crop: { x: 0, y: 0, width: 1, height: 1 },
  });
  const narrowed = await readJson(
    await app.request(`/v1/editor/invitations/${invitation.id}`, {
      method: 'PATCH',
      headers: { ...auth(token), 'if-match': (omitted.body.invitation as { etag: string }).etag },
      body: JSON.stringify({ photos: [{ id: photoId, sort: 0, crop: { x: 0, y: 0, width: 0.5, height: 1 } }] }),
    }),
  );
  expect((narrowed.body.invitation as { photos: Array<{ status: string }> }).photos[0]?.status).toBe('processing');
  expect(queued).toHaveLength(1);
  const reset = await readJson(
    await app.request(`/v1/editor/invitations/${invitation.id}`, {
      method: 'PATCH',
      headers: { ...auth(token), 'if-match': (narrowed.body.invitation as { etag: string }).etag },
      body: JSON.stringify({ photos: [{ id: photoId, sort: 0 }] }),
    }),
  );
  expect((reset.body.invitation as { photos: Array<{ crop: { width: number } }> }).photos[0]?.crop).toEqual({
    x: 0,
    y: 0,
    width: 1,
    height: 1,
  });
  expect(queued.length).toBeGreaterThan(0);
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
