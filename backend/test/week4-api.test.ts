import { createHash, randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import { afterAll, beforeEach, expect, test } from 'vitest';
import { createApp } from '../src/app';
import { createStorage } from '../src/photos/storage';
import {
  JWT_SECRET,
  accessToken,
  adminPool,
  appPool,
  insertUser,
  nestClient,
  readJson,
  resetDatabase,
  testConfig,
} from './helpers';

const admin = adminPool();
const pool = appPool();
const config = testConfig({ rebuildToken: 'rebuild-test-token' });
const nestApp = await createApp({
  pool,
  config,
  storage: createStorage(config),
  now: () => new Date('2026-11-17T03:00:00.000Z'),
});
const app = nestClient(nestApp);

beforeEach(() => resetDatabase(admin));
afterAll(async () => {
  await nestApp.close();
  await admin.end();
  await pool.end();
});

test('클레임 티켓은 해시만 저장되고, 재사용과 만료는 claim_invalid 다', async () => {
  const anon = randomUUID();
  const host = randomUUID();
  await insertUser(admin, anon, true);
  await insertUser(admin, host, false);
  const anonToken = await accessToken(anon, { anonymous: true });
  const hostToken = await accessToken(host);

  const created = await readJson(await app.request('/v1/editor/invitations', {
    method: 'POST',
    headers: auth(anonToken),
    body: '{}',
  }));
  const id = (created.body.invitation as { id: string }).id;
  const permanent = await readJson(await app.request('/v1/editor/claim-tickets', {
    method: 'POST',
    headers: auth(hostToken),
    body: JSON.stringify({ invitationIds: [id] }),
  }));
  expect(permanent.status).toBe(403);
  expect(permanent.body).toEqual({ error: { code: 'forbidden', reason: 'not_anonymous' } });

  const issued = await readJson(await app.request('/v1/editor/claim-tickets', {
    method: 'POST',
    headers: auth(anonToken),
    body: JSON.stringify({ invitationIds: [id] }),
  }));
  expect(issued.status).toBe(201);
  const ticket = issued.body.ticket as string;
  const stored = await admin.query<{ hash: string }>(
    `select encode(ticket_hash, 'hex') as hash from private.claim_tickets`,
  );
  expect(stored.rows[0]?.hash).toBe(createHash('sha256').update(ticket).digest('hex'));
  expect(JSON.stringify(stored.rows)).not.toContain(ticket);

  const claimed = await readJson(await app.request('/v1/editor/drafts/claim', {
    method: 'POST',
    headers: auth(hostToken),
    body: JSON.stringify({ ticket }),
  }));
  expect(claimed.status).toBe(200);
  const reused = await readJson(await app.request('/v1/editor/drafts/claim', {
    method: 'POST',
    headers: auth(hostToken),
    body: JSON.stringify({ ticket }),
  }));
  expect(reused.status).toBe(403);
  expect(reused.body).toEqual({ error: { code: 'claim_invalid' } });

  const anonAgain = randomUUID();
  await insertUser(admin, anonAgain, true);
  const anonToken2 = await accessToken(anonAgain, { anonymous: true });
  const second = await readJson(await app.request('/v1/editor/invitations', {
    method: 'POST',
    headers: auth(anonToken2),
    body: '{}',
  }));
  const secondId = (second.body.invitation as { id: string }).id;
  const expiring = await readJson(await app.request('/v1/editor/claim-tickets', {
    method: 'POST',
    headers: auth(anonToken2),
    body: JSON.stringify({ invitationIds: [secondId] }),
  }));
  await admin.query(`update private.claim_tickets set expires_at = now() - interval '1 minute' where used_at is null`);
  const expired = await readJson(await app.request('/v1/editor/drafts/claim', {
    method: 'POST',
    headers: auth(hostToken),
    body: JSON.stringify({ ticket: expiring.body.ticket }),
  }));
  expect(expired.status).toBe(403);
  expect(expired.body).toEqual({ error: { code: 'claim_invalid' } });
  const stillAnon = await readJson(await app.request('/v1/editor/drafts/claim', {
    method: 'POST',
    headers: auth(anonToken2),
    body: JSON.stringify({ ticket: expiring.body.ticket }),
  }));
  expect(stillAnon.body).toEqual({ error: { code: 'forbidden', reason: 'login_required' } });
});

test('발행은 givenName, 전화, 계좌번호, 고인 표기를 필드 오류로 거절한다', async () => {
  const host = randomUUID();
  await insertUser(admin, host, false);
  const token = await accessToken(host);
  const created = await readJson(await app.request('/v1/editor/invitations', {
    method: 'POST',
    headers: auth(token),
    body: '{}',
  }));
  const invitation = created.body.invitation as { id: string; etag: string };
  const draft = await readJson(await app.request(`/v1/editor/invitations/${invitation.id}`, {
    method: 'PATCH',
    headers: { ...auth(token), 'if-match': invitation.etag },
    body: JSON.stringify({
      groom: { name: '김신랑', phone: '010' },
      bride: { name: '이신부', givenName: '신부', phone: '010-0000-0000' },
      ceremony: { date: '2027-06-01', time: '14:00', venueName: '식물관', address: '서울시 종로' },
      accounts: [{ side: 'groom', relation: '신랑', holder: '김신랑', bank: '국민', number: '12' }],
      families: families({ deceasedStyle: null }),
    }),
  }));
  expect(draft.status).toBe(200);
  const etag = () => (draft.body.invitation as { etag: string }).etag;

  const missingName = await publish(token, invitation.id);
  expect(missingName.body).toEqual({ error: { code: 'validation', field: 'groom.givenName', reason: 'required' } });

  const named = await patch(token, invitation.id, etag(), { groom: { givenName: '신랑' } });
  const badPhone = await publish(token, invitation.id);
  expect(badPhone.body).toEqual({ error: { code: 'validation', field: 'groom.phone', reason: 'invalid' } });

  await patch(token, invitation.id, (named.body.invitation as { etag: string }).etag, { groom: { phone: '010-1234-5678' } });
  const badAccount = await publish(token, invitation.id);
  expect(badAccount.body).toEqual({ error: { code: 'validation', field: 'accounts.number', reason: 'invalid' } });

  const current = await readJson(await app.request(`/v1/editor/invitations/${invitation.id}`, { headers: auth(token) }));
  await patch(token, invitation.id, (current.body.invitation as { etag: string }).etag, {
    accounts: [{ side: 'groom', relation: '신랑', holder: '김신랑', bank: '국민', number: '110-123-456789' }],
  });
  const missingPhoto = await publish(token, invitation.id);
  expect(missingPhoto.body).toEqual({ error: { code: 'validation', field: 'photos.cover', reason: 'required' } });

  await admin.query(
    `insert into invitation_photos (invitation_id, sort, status, width, height, lqip)
     values ($1, 0, 'ready', 1200, 1600, 'data:image/webp;base64,QQ==')`,
    [invitation.id],
  );
  const missingStyle = await publish(token, invitation.id);
  expect(missingStyle.body).toEqual({ error: { code: 'validation', reason: 'deceased_style' } });

  const styled = await readJson(await app.request(`/v1/editor/invitations/${invitation.id}`, { headers: auth(token) }));
  await patch(token, invitation.id, (styled.body.invitation as { etag: string }).etag, {
    families: families({ deceasedStyle: 'hanja' }),
  });
  const published = await publish(token, invitation.id);
  expect(published.status).toBe(200);
  expect(published.body.staticRebuild).toMatchObject({
    action: 'publish',
    slug: (published.body.invitation as { slug: string }).slug,
    pagePath: `/i/${(published.body.invitation as { slug: string }).slug}/`,
  });
});

test('명단 토큰, 회수, 채널 집계, 설정, 같은 링크 수정, 정적 재생성', async () => {
  const host = randomUUID();
  const stranger = randomUUID();
  await insertUser(admin, host, false);
  await insertUser(admin, stranger, false);
  const token = await accessToken(host);
  const strangerToken = await accessToken(stranger);
  const created = await readJson(await app.request('/v1/editor/invitations', {
    method: 'POST',
    headers: auth(token),
    body: '{}',
  }));
  const invitation = created.body.invitation as { id: string; etag: string };
  await patch(token, invitation.id, invitation.etag, {
    groom: { name: '김신랑', givenName: '신랑', phone: '010-1234-5678' },
    bride: { name: '이신부', givenName: '신부', phone: '010-9876-5432' },
    ceremony: { date: '2027-06-01', time: '14:00', venueName: '식물관', address: '서울시 종로' },
    accounts: [{ side: 'bride', relation: '신부', holder: '이신부', bank: '신한', number: '110-222-333444' }],
  });
  await admin.query(
    `insert into invitation_photos (invitation_id, sort, status, width, height, lqip)
     values ($1, 0, 'ready', 1200, 1600, 'data:image/webp;base64,QQ==')`,
    [invitation.id],
  );
  const published = await publish(token, invitation.id);
  expect(published.status).toBe(200);
  const slug = (published.body.invitation as { slug: string; links: { rsvpLinkPath: string } }).slug;
  const sharedPath = (published.body.invitation as { links: { rsvpLinkPath: string } }).links.rsvpLinkPath;
  const sharedToken = sharedPath.split('/').filter(Boolean).at(-1) ?? '';

  const anonToken = await accessToken(randomUUID(), { anonymous: true });
  const anonSettings = await readJson(await app.request(`/v1/editor/invitations/${invitation.id}/settings`, { headers: auth(anonToken) }));
  expect(anonSettings.status).toBe(403);
  expect(anonSettings.body).toEqual({ error: { code: 'forbidden', reason: 'login_required' } });

  const added = await readJson(await app.request(`/v1/editor/invitations/${invitation.id}/recipients`, {
    method: 'POST',
    headers: auth(token),
    body: JSON.stringify({ names: ['김하객', '김하객', '박하객', '최하객'] }),
  }));
  expect(added.status).toBe(201);
  const recipients = added.body.recipients as Array<{ id: string; name: string; path: string }>;
  expect(recipients).toHaveLength(4);
  expect(recipients.filter((item) => item.name === '김하객')).toHaveLength(2);
  const first = recipients[0];
  if (!first?.path) throw new Error('path missing');
  const personalToken = first.path.split('/').filter(Boolean).at(-1) ?? '';
  const hashes = await admin.query<{ hash: string }>(
    `select encode(token_hash, 'hex') as hash from recipients where id = $1`,
    [first.id],
  );
  expect(hashes.rows[0]?.hash).toBe(createHash('sha256').update(personalToken).digest('hex'));
  expect(JSON.stringify(hashes.rows)).not.toContain(personalToken);

  const publicBody = await readJson(await app.request(`/v1/invitations/${slug}`));
  const serialized = JSON.stringify(publicBody.body);
  expect(serialized).not.toContain('김하객');
  expect(serialized).not.toContain(personalToken);
  expect(serialized).not.toContain(sharedToken);
  expect(publicBody.body).toMatchObject({ ceremony: { venueName: '식물관', time: '14:00' } });

  const context = await readJson(await app.request('/functions/v1/rsvp-context', {
    method: 'POST',
    headers: json(),
    body: JSON.stringify({ slug, token: personalToken }),
  }));
  expect(context.body).toMatchObject({ link: 'personal', prefillName: '김하객' });

  await submit({ slug, channel: 'personal', token: personalToken, name: '김하객', attending: true, companions: 2 });
  await submit({ slug, channel: 'invite', name: '공용', attending: true, companions: 1 });
  await submit({ slug, channel: 'invite', name: '공용', attending: false, companions: 0 });
  await submit({ slug, channel: 'rsvp_link', token: sharedToken, name: '링크손님', attending: true, companions: 0 });

  const revokedTarget = recipients.find((item) => item.name === '최하객');
  const revoked = await readJson(await app.request(
    `/v1/editor/invitations/${invitation.id}/recipients/${revokedTarget?.id}/revoke`,
    { method: 'POST', headers: auth(token) },
  ));
  expect(revoked.status).toBe(200);
  expect((revoked.body.recipients as Array<{ revoked: boolean; path: string | null }>)[0]).toMatchObject({ revoked: true, path: null });
  const revokedToken = revokedTarget?.path.split('/').filter(Boolean).at(-1);
  const revokedContext = await readJson(await app.request('/functions/v1/rsvp-context', {
    method: 'POST',
    headers: json(),
    body: JSON.stringify({ slug, token: revokedToken }),
  }));
  expect(revokedContext.body).toMatchObject({ link: 'personal', revoked: true });
  expect(revokedContext.body.prefillName).toBeUndefined();
  const revokedSubmit = await submit({ slug, channel: 'personal', token: revokedToken, name: '최하객', attending: true, companions: 0 });
  expect(revokedSubmit.status).toBe(410);
  expect(revokedSubmit.body).toEqual({ error: { code: 'revoked' } });

  const dashboard = await readJson(await app.request(`/v1/editor/invitations/${invitation.id}/rsvp`, { headers: auth(token) }));
  expect(dashboard.body.byChannel).toEqual({
    personal: { attendingResponses: 1, companionSum: 2, attendingGuests: 3, declined: 0, unanswered: 2 },
    invite: { attendingResponses: 1, companionSum: 1, attendingGuests: 2, declined: 1, unanswered: null },
    rsvp_link: { attendingResponses: 1, companionSum: 0, attendingGuests: 1, declined: 0, unanswered: null },
  });
  expect(dashboard.body.totals).toEqual({
    attendingResponses: 3,
    companionSum: 3,
    attendingGuests: 6,
    declined: 1,
    unanswered: 2,
  });
  const rows = dashboard.body.byRecipient as Array<{ listName: string; revoked: boolean; channel: string; status: string }>;
  expect(rows.filter((item) => item.revoked)).toEqual([
    expect.objectContaining({ listName: '최하객', channel: 'personal', status: 'unanswered' }),
  ]);
  expect((dashboard.body.byPublicLink as { invite: Array<{ duplicateName: boolean; channel: string }> }).invite.every((item) => item.duplicateName && item.channel === 'invite')).toBe(true);

  const settings = await readJson(await app.request(`/v1/editor/invitations/${invitation.id}/settings`, { headers: auth(token) }));
  expect(settings.status).toBe(200);
  expect(settings.etag).toBe(`"${settings.body.etag}"`);
  expect(settings.body.settings).toMatchObject({
    slug,
    slugEditable: false,
    status: 'published',
    rsvp: { enabled: true, publicLinkEnabled: true, deadlineOverride: false },
    links: { invitePath: `/i/${slug}/`, rsvpLinkPath: sharedPath },
  });
  const hiddenSettings = await readJson(await app.request(`/v1/editor/invitations/${invitation.id}/settings`, { headers: auth(strangerToken) }));
  expect(hiddenSettings.status).toBe(404);

  const rejectedOff = await readJson(await app.request(`/v1/editor/invitations/${invitation.id}/settings`, {
    method: 'PATCH',
    headers: { ...auth(token), 'if-match': settings.body.etag as string },
    body: JSON.stringify({ rsvp: { enabled: false, deadline: '2027-05-20T14:59:59.999Z' } }),
  }));
  expect(rejectedOff.body).toEqual({ error: { code: 'validation', field: 'rsvp.enabled', reason: 'not_supported' } });
  const rejectedSlug = await readJson(await app.request(`/v1/editor/invitations/${invitation.id}/settings`, {
    method: 'PATCH',
    headers: { ...auth(token), 'if-match': settings.body.etag as string },
    body: JSON.stringify({ slug: 'pretty-name', rsvp: { deadline: '2027-05-20T14:59:59.999Z' } }),
  }));
  expect(rejectedSlug.body).toEqual({ error: { code: 'validation', field: 'slug', reason: 'not_supported' } });
  const rejectedLink = await readJson(await app.request(`/v1/editor/invitations/${invitation.id}/settings`, {
    method: 'PATCH',
    headers: { ...auth(token), 'if-match': settings.body.etag as string },
    body: JSON.stringify({ rsvp: { deadline: '2027-05-20T14:59:59.999Z', publicLinkEnabled: false } }),
  }));
  expect(rejectedLink.body).toEqual({ error: { code: 'validation', field: 'rsvp.publicLinkEnabled', reason: 'not_supported' } });

  const changed = await readJson(await app.request(`/v1/editor/invitations/${invitation.id}/settings`, {
    method: 'PATCH',
    headers: { ...auth(token), 'if-match': settings.body.etag as string },
    body: JSON.stringify({ rsvp: { deadline: '2027-05-20T14:59:59.999Z', enabled: true } }),
  }));
  expect(changed.status).toBe(200);
  expect(changed.body.settings).toMatchObject({ rsvp: { deadlineOverride: true, deadline: '2027-05-20T14:59:59.999Z' } });
  const beforeApply = await readJson(await app.request(`/v1/invitations/${slug}`));
  expect((beforeApply.body as { rsvp: { deadline: string }; ceremony: { venueName: string } }).rsvp.deadline).toBe('2027-05-31T14:59:59.999Z');

  const editing = await readJson(await app.request(`/v1/editor/invitations/${invitation.id}`, { headers: auth(token) }));
  const moved = await patch(token, invitation.id, (editing.body.invitation as { etag: string }).etag, {
    ceremony: { time: '15:30', venueName: '다른홀', address: '부산시 해운대' },
    accounts: [{ side: 'bride', relation: '신부', holder: '이신부', bank: '신한', number: '110-222-333455' }],
  });
  expect((moved.body.invitation as { hasUnpublishedChanges: boolean }).hasUnpublishedChanges).toBe(true);
  const applied = await readJson(await app.request(`/v1/editor/invitations/${invitation.id}/apply`, {
    method: 'POST',
    headers: auth(token),
  }));
  expect(applied.status).toBe(200);
  expect((applied.body.invitation as { slug: string }).slug).toBe(slug);
  expect(applied.body.staticRebuild).toMatchObject({ action: 'apply', slug, pagePath: `/i/${slug}/` });
  const after = await readJson(await app.request(`/v1/invitations/${slug}`));
  expect(after.body).toMatchObject({
    ceremony: { time: '15:30', venueName: '다른홀', address: '부산시 해운대' },
    accounts: [expect.objectContaining({ number: '110-222-333455' })],
    rsvp: { deadline: '2027-05-20T14:59:59.999Z' },
  });
  expect(JSON.stringify(after.body)).not.toContain('김하객');

  const queued = await readJson(await app.request('/v1/rebuilds', { headers: { authorization: 'Bearer rebuild-test-token' } }));
  expect(queued.status).toBe(200);
  const jobs = queued.body.rebuilds as Array<{ id: string; action: string; slug: string; pagePath: string }>;
  expect(jobs.map((item) => item.action)).toEqual(['publish', 'apply']);
  expect(jobs.every((item) => item.slug === slug && item.pagePath === `/i/${slug}/`)).toBe(true);
  const missingToken = await readJson(await app.request('/v1/rebuilds'));
  expect(missingToken.status).toBe(401);
  const acked = await readJson(await app.request('/v1/rebuilds/ack', {
    method: 'POST',
    headers: { authorization: 'Bearer rebuild-test-token', 'content-type': 'application/json' },
    body: JSON.stringify({ ids: jobs.map((item) => item.id) }),
  }));
  expect(acked.body).toEqual({ acked: 2 });
  const empty = await readJson(await app.request('/v1/rebuilds', { headers: { authorization: 'Bearer rebuild-test-token' } }));
  expect(empty.body).toEqual({ rebuilds: [] });

  const hidden = await readJson(await app.request(`/v1/editor/invitations/${invitation.id}/unpublish`, { method: 'POST', headers: auth(token) }));
  expect(hidden.body.staticRebuild).toMatchObject({ action: 'unpublish', slug });
  expect((await readJson(await app.request(`/v1/invitations/${slug}`))).status).toBe(404);
  const again = await publish(token, invitation.id);
  expect((again.body.invitation as { slug: string }).slug).toBe(slug);
});

test('광고 스위치는 app_metadata 어드민만 바꾸고 showAds 식은 유지한다', async () => {
  const adminId = randomUUID();
  const host = randomUUID();
  await insertUser(admin, adminId, false);
  await insertUser(admin, host, false);
  const adminToken = await accessToken(adminId, { admin: true });
  const hostToken = await accessToken(host);
  const pretend = await new SignJWT({
    role: 'authenticated',
    is_anonymous: false,
    app_metadata: {},
    user_metadata: { role: 'admin' },
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(host)
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(new TextEncoder().encode(JWT_SECRET));

  const denied = await readJson(await app.request('/v1/editor/settings', {
    method: 'PATCH',
    headers: auth(hostToken),
    body: JSON.stringify({ adsEnabled: true }),
  }));
  expect(denied.body).toEqual({ error: { code: 'forbidden', reason: 'admin_required' } });
  const metadata = await readJson(await app.request('/v1/editor/settings', {
    method: 'PATCH',
    headers: auth(pretend),
    body: JSON.stringify({ adsEnabled: true }),
  }));
  expect(metadata.body).toEqual({ error: { code: 'forbidden', reason: 'admin_required' } });

  const enabled = await readJson(await app.request('/v1/editor/settings', {
    method: 'PATCH',
    headers: auth(adminToken),
    body: JSON.stringify({ adsEnabled: true }),
  }));
  expect(enabled.body).toEqual({ adsEnabled: true, plan: 'free', showAds: false, canEditAds: true });
  const hostView = await readJson(await app.request('/v1/editor/session', { headers: auth(hostToken) }));
  expect(hostView.body).toMatchObject({ isAdmin: false, plan: 'free', adsEnabled: true, showAds: true });
  const adminView = await readJson(await app.request('/v1/editor/session', { headers: auth(adminToken) }));
  expect(adminView.body).toMatchObject({ isAdmin: true, showAds: false, adsEnabled: true });
});

function auth(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
}

function json(): Record<string, string> {
  return { 'content-type': 'application/json' };
}

async function publish(token: string, id: string) {
  return readJson(await app.request(`/v1/editor/invitations/${id}/publish`, { method: 'POST', headers: auth(token) }));
}

async function patch(token: string, id: string, etag: string, body: unknown) {
  return readJson(await app.request(`/v1/editor/invitations/${id}`, {
    method: 'PATCH',
    headers: { ...auth(token), 'if-match': etag },
    body: JSON.stringify(body),
  }));
}

async function submit(body: unknown) {
  return readJson(await app.request('/functions/v1/rsvp', {
    method: 'POST',
    headers: json(),
    body: JSON.stringify(body),
  }));
}

function families(input: { deceasedStyle: 'hanja' | null }) {
  const parent = { name: '', phone: '', deceased: false, deceasedStyle: null };
  return {
    groom: {
      relation: '아들',
      father: { name: '김부', phone: '', deceased: true, deceasedStyle: input.deceasedStyle },
      mother: parent,
    },
    bride: { relation: '딸', father: parent, mother: parent },
  };
}
