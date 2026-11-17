import { randomUUID } from 'node:crypto';
import type { AuthClaims } from '../auth/jwt';
import type { Config } from '../config';
import type { Database, DatabaseClient } from '../db';
import { withService, withUser } from '../db';
import {
  accountNumberOk,
  codePoints,
  isCalendarDate,
  isTime,
  iso,
  phoneOk,
  sameInstant,
} from '../domain/text';
import { linkToken, randomToken, recipientMaterial, sharedMaterial, tokenHash, ipHash } from '../domain/tokens';
import {
  buildPublicInvitation,
  photoKey,
  type AccountRow,
  type ParentRow,
  type PhotoRow,
  type WorkingInvitation,
} from '../domain/public-invitation';
import { HttpError, isRecord } from '../http';
import { addUsage, assertSpendOpen, takeLimit } from '../limits';
import type { ObjectStorage } from '../photos/storage';
import { processImage, type NormalizedCrop, type PhotoFilter } from '../photos/process';

export type EditorDeps = {
  pool: Database;
  config: Config;
  storage: ObjectStorage;
  now: () => Date;
  schedule?: (task: () => Promise<void>) => void;
};

const THEMES = new Set(['ivory', 'sage', 'mist']);
const FILTERS = new Set(['original', 'warm', 'mono']);
const MAX_BYTES = 20 * 1024 * 1024;
const CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

type InvitationRow = WorkingInvitation & {
  status: string;
  photoFilter: PhotoFilter;
  deadlineOverride: Date | null;
  sharedLinkVersion: number;
  sharedHash: Buffer | null;
  publishedRevision: number | null;
  revision: number;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export async function session(deps: EditorDeps, claims: AuthClaims) {
  const flags = await readFlags(deps.pool, claims);
  const plan = 'free' as const;
  return {
    userId: claims.sub,
    isAnonymous: claims.isAnonymous,
    isAdmin: claims.admin,
    plan,
    adsEnabled: flags.adsEnabled,
    showAds: flags.adsEnabled && !claims.admin && plan === 'free',
  };
}

export async function listNotices(deps: EditorDeps, claims: AuthClaims) {
  return withUser(deps.pool, claims, async (client) => {
    const result = await client.query<{
      id: string;
      invitation_id: string;
      kind: string;
      purge_at: Date;
      message: string;
    }>('select id, invitation_id, kind, purge_at, message from host_notices order by created_at desc');
    return {
      notices: result.rows.map((row) => ({
        id: row.id,
        invitationId: row.invitation_id,
        kind: row.kind,
        purgeAt: iso(row.purge_at),
        message: row.message,
      })),
    };
  });
}

export async function createInvitation(deps: EditorDeps, claims: AuthClaims, body: unknown, ip: string) {
  const input = parseCreate(body);
  await takeLimit(deps.pool, `draft:user:${claims.sub}`, 3600, deps.config.limits.draftsPerHour);
  await takeLimit(deps.pool, `draft:ip:${ipHash(ip)}`, 3600, deps.config.limits.draftsPerIpHour);
  return withUser(deps.pool, claims, async (client) => {
    await assertSpendOpen(client);
    const inserted = await client.query<{ id: string }>(
      `insert into invitations (theme, groom_name, bride_name, ceremony_date, ceremony_time)
       values ($1, $2, $3, $4, $5) returning id`,
      [input.theme, input.groomName, input.brideName, input.ceremonyDate, input.ceremonyTime],
    );
    const id = inserted.rows[0]?.id;
    if (!id) throw new HttpError(503, 'unavailable');
    await addUsage(client, 1, 0, 0);
    return { invitation: await loadInvitation(client, deps, id) };
  });
}

export async function listInvitations(deps: EditorDeps, claims: AuthClaims) {
  return withUser(deps.pool, claims, async (client) => {
    const flags = await flagsOn(client);
    const result = await client.query<{
      id: string;
      slug: string;
      status: string;
      theme: 'ivory' | 'sage' | 'mist';
      groom_name: string;
      bride_name: string;
      ceremony_date: string | null;
      revision: number;
      published_revision: number | null;
      updated_at: Date;
      responses: number;
      attending_guests: number;
      declined: number;
      recipient_count: number;
      unanswered: number;
      cover_id: string | null;
    }>(`
      select i.id, i.slug, i.status, i.theme, i.groom_name, i.bride_name, i.ceremony_date,
             i.revision, i.published_revision, i.updated_at,
             (select count(*)::int from rsvp_responses r where r.invitation_id = i.id) as responses,
             (select coalesce(sum(1 + r.companions), 0)::int from rsvp_responses r where r.invitation_id = i.id and r.attending) as attending_guests,
             (select count(*)::int from rsvp_responses r where r.invitation_id = i.id and not r.attending) as declined,
             (select count(*)::int from recipients p where p.invitation_id = i.id and p.revoked_at is null) as recipient_count,
             (select count(*)::int from recipients p
               where p.invitation_id = i.id and p.revoked_at is null
                 and not exists (select 1 from rsvp_responses r where r.recipient_id = p.id)) as unanswered,
             (select ph.id from invitation_photos ph
               where ph.invitation_id = i.id and ph.status = 'ready'
               order by ph.sort limit 1) as cover_id
      from invitations i
      where i.status <> 'deleted'
      order by i.updated_at desc
    `);
    return {
      invitations: result.rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        status: row.status,
        theme: row.theme,
        groomName: row.groom_name,
        brideName: row.bride_name,
        ceremonyDate: row.ceremony_date,
        coverSrc: row.cover_id ? photoKey(row.id, row.cover_id, 'thumb.webp') : null,
        rsvp: {
          responses: row.responses,
          attendingGuests: row.attending_guests,
          declined: row.declined,
          unanswered: row.recipient_count > 0 ? row.unanswered : null,
        },
        hasUnpublishedChanges: row.status === 'published' && row.published_revision !== row.revision,
        purgeAt: purgeAt(row.ceremony_date, flags.purgeDelayDays),
        updatedAt: iso(row.updated_at),
        etag: iso(row.updated_at),
      })),
    };
  });
}

export async function getInvitation(deps: EditorDeps, claims: AuthClaims, id: string) {
  return withUser(deps.pool, claims, async (client) => ({ invitation: await loadInvitation(client, deps, id) }));
}

export async function autosave(deps: EditorDeps, claims: AuthClaims, id: string, body: unknown, ifMatch: string | undefined) {
  if (!ifMatch) throw new HttpError(400, 'validation', { field: 'if-match', reason: 'required' });
  const patch = parseAutosave(body);
  const jobs = await withUser(deps.pool, claims, async (client) => {
    const current = await loadRow(client, id);
    if (!sameInstant(etagValue(ifMatch), iso(current.updatedAt))) {
      throw new HttpError(409, 'conflict', { invitation: await present(client, deps, current) });
    }
    if (!patch) return [];
    return applyPatch(client, current, patch);
  });
  for (const job of jobs) scheduleRender(deps, claims, id, job.photoId, job.filter, job.crop, 'master.webp');
  return getInvitation(deps, claims, id);
}

export async function publish(deps: EditorDeps, claims: AuthClaims, id: string) {
  if (claims.isAnonymous) throw new HttpError(403, 'forbidden', { reason: 'login_required' });
  await withUser(deps.pool, claims, async (client) => {
    const row = await loadRow(client, id);
    assertReadyToPublish(row);
    const deadline = await deadlineOf(client, row);
    if (!deadline) throw new HttpError(400, 'validation', { field: 'ceremony.date', reason: 'required' });
    const document = buildPublicInvitation(toWorking(row), deadline);
    const hash = tokenHash(linkToken(deps.config.linkSecret, sharedMaterial(row.id, row.sharedLinkVersion)));
    await client.query('select public.publish_invitation($1, $2::jsonb, $3)', [id, JSON.stringify(document), hash]);
  });
  return getInvitation(deps, claims, id);
}

export async function applyChanges(deps: EditorDeps, claims: AuthClaims, id: string) {
  if (claims.isAnonymous) throw new HttpError(403, 'forbidden', { reason: 'login_required' });
  await withUser(deps.pool, claims, async (client) => {
    const row = await loadRow(client, id);
    assertReadyToPublish(row);
    const deadline = await deadlineOf(client, row);
    if (!deadline) throw new HttpError(400, 'validation', { field: 'ceremony.date', reason: 'required' });
    const document = buildPublicInvitation(toWorking(row), deadline);
    await client.query('select public.apply_invitation($1, $2::jsonb)', [id, JSON.stringify(document)]);
  });
  return getInvitation(deps, claims, id);
}

export async function unpublish(deps: EditorDeps, claims: AuthClaims, id: string) {
  await withUser(deps.pool, claims, async (client) => {
    await client.query('select public.unpublish_invitation($1)', [id]);
  });
  return getInvitation(deps, claims, id);
}

export async function removeInvitation(deps: EditorDeps, claims: AuthClaims, id: string, body: unknown) {
  await withUser(deps.pool, claims, async (client) => {
    const row = await loadRow(client, id);
    const confirm = isRecord(body) ? body.confirm : undefined;
    if (row.status !== 'draft' && confirm !== '삭제') {
      throw new HttpError(400, 'validation', { field: 'confirm', reason: 'required' });
    }
    await client.query('select public.soft_delete_invitation($1, $2)', [id, deps.now().toISOString()]);
  });
  return { ok: true };
}

export async function presignPhoto(deps: EditorDeps, claims: AuthClaims, invitationId: string, body: unknown) {
  if (!isRecord(body) || typeof body.contentType !== 'string' || !CONTENT_TYPES.has(body.contentType)) {
    throw new HttpError(400, 'validation', { field: 'contentType', reason: 'invalid' });
  }
  if (typeof body.byteSize !== 'number' || !Number.isInteger(body.byteSize) || body.byteSize < 1 || body.byteSize > MAX_BYTES) {
    throw new HttpError(400, 'validation', { field: 'byteSize', reason: 'out_of_range' });
  }
  const contentType = body.contentType;
  const byteSize = body.byteSize;
  const uploadToken = randomToken();
  const expires = new Date(deps.now().getTime() + 15 * 60 * 1000);
  await takeLimit(deps.pool, `photo:user:${claims.sub}`, 3600, deps.config.limits.presignPerHour);
  const photoId = await withUser(deps.pool, claims, async (client) => {
    await assertSpendOpen(client);
    const result = await client.query<{ prepare_photo: string }>(
      'select public.prepare_photo($1, $2, $3, $4, $5) as prepare_photo',
      [invitationId, contentType, byteSize, tokenHash(uploadToken), expires.toISOString()],
    );
    const id = result.rows[0]?.prepare_photo;
    if (!id) throw new HttpError(503, 'unavailable');
    await addUsage(client, 0, byteSize, 0);
    return id;
  });
  const objectKey = photoKey(invitationId, photoId, 'original');
  if (deps.storage.kind === 'r2' && deps.storage.presignPut) {
    const signed = await deps.storage.presignPut(objectKey, contentType);
    return { photoId, method: 'PUT' as const, uploadUrl: signed.url, headers: signed.headers, expiresAt: expires.toISOString() };
  }
  return {
    photoId,
    method: 'PUT' as const,
    uploadUrl: `${deps.config.publicBaseUrl}/v1/editor/uploads/${uploadToken}`,
    headers: { 'Content-Type': contentType },
    expiresAt: expires.toISOString(),
  };
}

export async function saveUpload(deps: EditorDeps, uploadToken: string, body: Buffer, contentType: string | undefined) {
  if (body.length < 1 || body.length > MAX_BYTES) {
    throw new HttpError(400, 'validation', { field: 'byteSize', reason: 'out_of_range' });
  }
  const target = await withService(deps.pool, async (client) => {
    const result = await client.query<{
      invitation_id: string;
      photo_id: string;
      content_type: string;
      byte_size: number;
      expires_at: Date;
      status: string;
    }>('select * from private.photo_upload_target($1)', [tokenHash(uploadToken)]);
    return result.rows[0] ?? null;
  });
  if (!target || target.status !== 'pending' || target.expires_at.getTime() < deps.now().getTime()) {
    throw new HttpError(404, 'not_found');
  }
  if (contentType && contentType !== target.content_type) {
    throw new HttpError(400, 'validation', { field: 'contentType', reason: 'invalid' });
  }
  if (body.length > target.byte_size) {
    throw new HttpError(400, 'validation', { field: 'byteSize', reason: 'out_of_range' });
  }
  await deps.storage.put(photoKey(target.invitation_id, target.photo_id, 'original'), body, target.content_type);
}

export async function completePhoto(deps: EditorDeps, claims: AuthClaims, invitationId: string, photoId: string) {
  const queued = await withUser(deps.pool, claims, async (client) => {
    const row = await loadRow(client, invitationId);
    const photo = row.photos.find((item) => item.id === photoId);
    if (!photo) throw new HttpError(404, 'not_found');
    if (photo.status === 'ready' || photo.status === 'processing') {
      return { photo: presentPhoto(invitationId, photo), etag: iso(row.updatedAt), start: false };
    }
    if (photo.status !== 'pending' && photo.status !== 'failed') {
      throw new HttpError(400, 'validation', { field: 'photo', reason: 'invalid' });
    }
    await client.query('select public.mark_photo_processing($1)', [photoId]);
    const next = await loadRow(client, invitationId);
    const marked = next.photos.find((item) => item.id === photoId);
    if (!marked) throw new HttpError(404, 'not_found');
    return {
      photo: presentPhoto(invitationId, marked),
      etag: iso(next.updatedAt),
      start: true,
      filter: marked.filter,
      crop: cropOf(marked),
    };
  });
  if (queued.start && queued.filter && queued.crop) {
    scheduleRender(deps, claims, invitationId, photoId, queued.filter, queued.crop, 'original');
  }
  return { photo: queued.photo, etag: queued.etag };
}

export async function listPhotos(deps: EditorDeps, claims: AuthClaims, invitationId: string) {
  return withUser(deps.pool, claims, async (client) => {
    const row = await loadRow(client, invitationId);
    return {
      etag: iso(row.updatedAt),
      photos: [...row.photos].sort((a, b) => a.sort - b.sort).map((photo) => presentPhoto(invitationId, photo)),
    };
  });
}

export async function getPhoto(deps: EditorDeps, claims: AuthClaims, invitationId: string, photoId: string) {
  return withUser(deps.pool, claims, async (client) => {
    const row = await loadRow(client, invitationId);
    const photo = row.photos.find((item) => item.id === photoId);
    if (!photo) throw new HttpError(404, 'not_found');
    return { etag: iso(row.updatedAt), photo: presentPhoto(invitationId, photo) };
  });
}

export async function deletePhoto(deps: EditorDeps, claims: AuthClaims, invitationId: string, photoId: string) {
  await withUser(deps.pool, claims, async (client) => {
    const removed = await client.query('delete from invitation_photos where id = $1 and invitation_id = $2', [photoId, invitationId]);
    if (removed.rowCount !== 1) throw new HttpError(404, 'not_found');
    await client.query('update invitations set revision = revision + 1 where id = $1', [invitationId]);
  });
  await deps.storage.deletePrefix(`inv/${invitationId}/${photoId}`);
}

export async function issueClaim(deps: EditorDeps, claims: AuthClaims, body: unknown) {
  if (!isRecord(body) || !Array.isArray(body.invitationIds) || body.invitationIds.length < 1) {
    throw new HttpError(400, 'validation', { field: 'invitationIds', reason: 'required' });
  }
  const ids = body.invitationIds.map((id) => {
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) {
      throw new HttpError(400, 'validation', { field: 'invitationIds', reason: 'invalid' });
    }
    return id;
  });
  const ticket = randomToken();
  await takeLimit(deps.pool, `claim:user:${claims.sub}`, 3600, deps.config.limits.claimsPerHour);
  const expires = await withUser(deps.pool, claims, async (client) => {
    const result = await client.query<{ issue_claim_ticket: Date }>(
      'select public.issue_claim_ticket($1::uuid[], $2) as issue_claim_ticket',
      [ids, tokenHash(ticket)],
    );
    const value = result.rows[0]?.issue_claim_ticket;
    if (!value) throw new HttpError(503, 'unavailable');
    return value;
  });
  return { ticket, expiresAt: iso(expires) };
}

export async function claimDrafts(deps: EditorDeps, claims: AuthClaims, body: unknown) {
  if (!isRecord(body) || typeof body.ticket !== 'string' || !body.ticket) {
    throw new HttpError(400, 'validation', { field: 'ticket', reason: 'required' });
  }
  return withUser(deps.pool, claims, async (client) => {
    const result = await client.query<{ claim_drafts: { invitations: { id: string; slug: string }[] } }>(
      'select public.claim_drafts($1) as claim_drafts',
      [tokenHash(body.ticket as string)],
    );
    return result.rows[0]?.claim_drafts ?? { invitations: [] };
  });
}

export async function addRecipients(deps: EditorDeps, claims: AuthClaims, invitationId: string, body: unknown) {
  if (!isRecord(body) || !Array.isArray(body.names) || body.names.length < 1 || body.names.length > 300) {
    throw new HttpError(400, 'validation', { field: 'names', reason: 'invalid' });
  }
  const names = body.names.map((name) => {
    if (typeof name !== 'string') throw new HttpError(400, 'validation', { field: 'name', reason: 'invalid' });
    const normalized = name.trim().normalize('NFC');
    const length = codePoints(normalized);
    if (length < 1) throw new HttpError(400, 'validation', { field: 'name', reason: 'required' });
    if (length > 20) throw new HttpError(400, 'validation', { field: 'name', reason: 'too_long' });
    return normalized;
  });
  const ids = names.map(() => randomUUID());
  const hashes = ids.map((id) => tokenHash(linkToken(deps.config.linkSecret, recipientMaterial(id, 1))).toString('hex'));
  await withUser(deps.pool, claims, async (client) => {
    await client.query('select public.add_recipients($1, $2::uuid[], $3::text[], $4::text[])', [
      invitationId,
      ids,
      names,
      hashes,
    ]);
  });
  return listRecipients(deps, claims, invitationId, ids);
}

export async function renameRecipient(deps: EditorDeps, claims: AuthClaims, invitationId: string, recipientId: string, body: unknown) {
  if (!isRecord(body) || typeof body.name !== 'string') {
    throw new HttpError(400, 'validation', { field: 'name', reason: 'required' });
  }
  const name = body.name.trim().normalize('NFC');
  const length = codePoints(name);
  if (length < 1) throw new HttpError(400, 'validation', { field: 'name', reason: 'required' });
  if (length > 20) throw new HttpError(400, 'validation', { field: 'name', reason: 'too_long' });
  await withUser(deps.pool, claims, async (client) => {
    await assertRecipient(client, invitationId, recipientId);
    await client.query('select public.rename_recipient($1, $2)', [recipientId, name]);
  });
  return listRecipients(deps, claims, invitationId, [recipientId]);
}

export async function revokeRecipient(deps: EditorDeps, claims: AuthClaims, invitationId: string, recipientId: string) {
  await withUser(deps.pool, claims, async (client) => {
    await assertRecipient(client, invitationId, recipientId);
    await client.query('select public.revoke_recipient($1)', [recipientId]);
  });
  return listRecipients(deps, claims, invitationId, [recipientId]);
}

export async function reissueRecipient(deps: EditorDeps, claims: AuthClaims, invitationId: string, recipientId: string) {
  const version = await withUser(deps.pool, claims, async (client) => {
    const current = await assertRecipient(client, invitationId, recipientId);
    return current.token_version + 1;
  });
  const hash = tokenHash(linkToken(deps.config.linkSecret, recipientMaterial(recipientId, version)));
  await withUser(deps.pool, claims, async (client) => {
    await client.query('select public.reissue_recipient($1, $2)', [recipientId, hash]);
  });
  return listRecipients(deps, claims, invitationId, [recipientId]);
}

export async function rsvpDashboard(deps: EditorDeps, claims: AuthClaims, invitationId: string) {
  return withUser(deps.pool, claims, async (client) => {
    const row = await loadRow(client, invitationId);
    const deadline = await deadlineOf(client, row);
    const closed = deadline ? deps.now().getTime() > new Date(deadline).getTime() : false;
    const recipients = await client.query<{
      id: string;
      name: string;
      token_version: number;
      revoked_at: Date | null;
      attending: boolean | null;
      companions: number | null;
      response_name: string | null;
      updated_at: Date | null;
    }>(
      `select p.id, p.name, p.token_version, p.revoked_at,
              r.attending, r.companions, r.name as response_name, r.updated_at
       from recipients p
       left join rsvp_responses r on r.recipient_id = p.id
       where p.invitation_id = $1
       order by p.created_at`,
      [invitationId],
    );
    const active = recipients.rows.filter((item) => !item.revoked_at);
    const publicRows = await client.query<{
      id: string;
      channel: 'invite' | 'rsvp_link';
      name: string;
      attending: boolean;
      companions: number;
      updated_at: Date;
    }>(
      `select id, channel, name, attending, companions, updated_at
       from rsvp_responses where invitation_id = $1 and channel <> 'personal' order by updated_at`,
      [invitationId],
    );
    const nameCounts = new Map<string, number>();
    for (const item of publicRows.rows) {
      const key = `${item.channel}:${item.name}`;
      nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
    }
    const toPublic = (channel: 'invite' | 'rsvp_link') =>
      publicRows.rows
        .filter((item) => item.channel === channel)
        .map((item) => ({
          id: item.id,
          name: item.name,
          attending: item.attending,
          companions: item.companions,
          updatedAt: iso(item.updated_at),
          duplicateName: (nameCounts.get(`${channel}:${item.name}`) ?? 0) > 1,
        }));
    const attending = publicRows.rows.filter((item) => item.attending);
    const personalAttending = active.filter((item) => item.attending === true);
    const allAttendingGuests =
      personalAttending.reduce((sum, item) => sum + 1 + (item.companions ?? 0), 0) +
      attending.reduce((sum, item) => sum + 1 + item.companions, 0);
    const declined =
      active.filter((item) => item.attending === false).length + publicRows.rows.filter((item) => !item.attending).length;
    return {
      deadline,
      closed,
      totals: {
        attendingResponses: personalAttending.length + attending.length,
        companionSum:
          personalAttending.reduce((sum, item) => sum + (item.companions ?? 0), 0) +
          attending.reduce((sum, item) => sum + item.companions, 0),
        attendingGuests: allAttendingGuests,
        declined,
        unanswered:
          active.length === 0 ? null : active.filter((item) => item.attending === null).length,
      },
      byRecipient: recipients.rows.map((item) => ({
        recipientId: item.id,
        listName: item.name,
        responseName: item.response_name,
        status: item.attending === null ? 'unanswered' : item.attending ? 'attending' : 'declined',
        companions: item.companions ?? 0,
        updatedAt: item.updated_at ? iso(item.updated_at) : null,
        path: item.revoked_at
          ? null
          : guestPath(row.slug, linkToken(deps.config.linkSecret, recipientMaterial(item.id, item.token_version))),
      })),
      byPublicLink: { invite: toPublic('invite'), rsvpLink: toPublic('rsvp_link') },
      etag: iso(row.updatedAt),
    };
  });
}

export async function listPublicSlugs(pool: Database) {
  return withService(pool, async (client) => {
    const result = await client.query<{ public_slugs: { slug: string }[] }>('select private.public_slugs() as public_slugs');
    return result.rows[0]?.public_slugs ?? [];
  });
}

export async function getPublicInvitation(pool: Database, slug: string) {
  return withService(pool, async (client) => {
    const result = await client.query<{ public_invitation: unknown }>('select private.public_invitation($1) as public_invitation', [slug]);
    const document = result.rows[0]?.public_invitation;
    if (!document) throw new HttpError(404, 'not_found');
    return document;
  });
}

function scheduleRender(
  deps: EditorDeps,
  claims: AuthClaims,
  invitationId: string,
  photoId: string,
  filter: PhotoFilter,
  crop: NormalizedCrop,
  sourceName: 'original' | 'master.webp',
) {
  const run = () => renderPhoto(deps, claims, invitationId, photoId, filter, crop, sourceName);
  const schedule = deps.schedule ?? ((task) => setImmediate(() => void task().catch(() => undefined)));
  schedule(run);
}

async function renderPhoto(
  deps: EditorDeps,
  claims: AuthClaims,
  invitationId: string,
  photoId: string,
  filter: PhotoFilter,
  crop: NormalizedCrop,
  sourceName: 'original' | 'master.webp',
) {
  const source = await deps.storage.get(photoKey(invitationId, photoId, sourceName));
  if (!source) {
    await withUser(deps.pool, claims, (client) =>
      client.query('select public.finish_photo($1, null, null, null, null, $2, $3)', [photoId, filter, 'failed']),
    );
    return;
  }
  let processed;
  try {
    processed = await processImage(source, filter, crop);
  } catch {
    await withUser(deps.pool, claims, (client) =>
      client.query('select public.finish_photo($1, null, null, null, null, $2, $3)', [photoId, filter, 'failed']),
    );
    return;
  }
  if (sourceName === 'original') {
    await deps.storage.put(photoKey(invitationId, photoId, 'master.webp'), processed.master, 'image/webp');
  }
  await deps.storage.put(photoKey(invitationId, photoId, 'w800.webp'), processed.w800, 'image/webp');
  await deps.storage.put(photoKey(invitationId, photoId, 'w1200.webp'), processed.w1200, 'image/webp');
  await deps.storage.put(photoKey(invitationId, photoId, 'w1600.webp'), processed.w1600, 'image/webp');
  await deps.storage.put(photoKey(invitationId, photoId, 'thumb.webp'), processed.thumb, 'image/webp');
  await withUser(deps.pool, claims, async (client) => {
    await client.query('select public.finish_photo($1, $2, $3, $4, $5, $6, $7)', [
      photoId,
      processed.width,
      processed.height,
      processed.lowQuality,
      processed.lqip,
      filter,
      'ready',
    ]);
    await client.query('update invitations set revision = revision + 1 where id = $1', [invitationId]);
  });
  if (sourceName === 'original') await deps.storage.delete(photoKey(invitationId, photoId, 'original'));
}

async function listRecipients(deps: EditorDeps, claims: AuthClaims, invitationId: string, only?: string[]) {
  return withUser(deps.pool, claims, async (client) => {
    const row = await loadRow(client, invitationId);
    const result = await client.query<{
      id: string;
      name: string;
      token_version: number;
      revoked_at: Date | null;
      response_id: string | null;
      attending: boolean | null;
      companions: number | null;
      response_name: string | null;
      updated_at: Date | null;
    }>(
      `select p.id, p.name, p.token_version, p.revoked_at,
              r.id as response_id, r.attending, r.companions, r.name as response_name, r.updated_at
       from recipients p
       left join rsvp_responses r on r.recipient_id = p.id
       where p.invitation_id = $1
       order by p.created_at`,
      [invitationId],
    );
    const recipients = result.rows
      .filter((item) => !only || only.includes(item.id))
      .map((item) => ({
        id: item.id,
        name: item.name,
        revoked: Boolean(item.revoked_at),
        path: item.revoked_at
          ? null
          : guestPath(row.slug, linkToken(deps.config.linkSecret, recipientMaterial(item.id, item.token_version))),
        response:
          item.response_id && item.attending !== null
            ? {
                attending: item.attending,
                companions: item.companions ?? 0,
                name: item.response_name,
                updatedAt: item.updated_at ? iso(item.updated_at) : null,
              }
            : null,
      }));
    return { recipients, etag: iso(row.updatedAt) };
  });
}

function guestPath(slug: string, token: string): string {
  return `/i/${slug}/g/${token}/`;
}

async function assertRecipient(client: DatabaseClient, invitationId: string, recipientId: string) {
  const result = await client.query<{ token_version: number }>(
    'select token_version from recipients where id = $1 and invitation_id = $2',
    [recipientId, invitationId],
  );
  const row = result.rows[0];
  if (!row) throw new HttpError(404, 'not_found');
  return row;
}

async function loadInvitation(client: DatabaseClient, deps: EditorDeps, id: string) {
  return present(client, deps, await loadRow(client, id));
}

async function present(client: DatabaseClient, deps: EditorDeps, row: InvitationRow) {
  const flags = await flagsOn(client);
  const deadline = await deadlineOf(client, row);
  const token =
    row.sharedHash && row.status === 'published'
      ? linkToken(deps.config.linkSecret, sharedMaterial(row.id, row.sharedLinkVersion))
      : null;
  return {
    id: row.id,
    slug: row.slug,
    status: row.status,
    theme: row.theme,
    photoFilter: row.photoFilter,
    groom: { name: row.groomName, givenName: row.groomGivenName, phone: row.groomPhone },
    bride: { name: row.brideName, givenName: row.brideGivenName, phone: row.bridePhone },
    ceremony: {
      date: row.ceremonyDate,
      time: row.ceremonyTime,
      venueName: row.venueName,
      hall: row.hall,
      address: row.address,
      addressDetail: row.addressDetail,
      lat: row.lat,
      lng: row.lng,
    },
    greeting: row.greeting,
    families: {
      groom: sideOf('groom', row),
      bride: sideOf('bride', row),
    },
    photos: [...row.photos].sort((a, b) => a.sort - b.sort).map((photo) => presentPhoto(row.id, photo)),
    transport: {
      parking: row.transportParking,
      subway: row.transportSubway,
      bus: row.transportBus,
      other: row.transportOther,
    },
    accountsNote: row.accountsNote,
    accounts: [...row.accounts]
      .sort((a, b) => a.sort - b.sort)
      .map((account) => ({
        id: account.id,
        side: account.side,
        relation: account.relation,
        holder: account.holder,
        bank: account.bank,
        number: account.number,
      })),
    rsvp: { deadline, deadlineOverride: row.deadlineOverride !== null },
    links: {
      invitePath: `/i/${row.slug}/`,
      rsvpLinkPath: token ? `/i/${row.slug}/s/${token}/` : null,
    },
    checklist: checklist(row),
    hasUnpublishedChanges: row.status === 'published' && row.publishedRevision !== row.revision,
    purgeAt: purgeAt(row.ceremonyDate, flags.purgeDelayDays),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    etag: iso(row.updatedAt),
    publishedAt: row.publishedAt ? iso(row.publishedAt) : null,
  };
}

function presentPhoto(invitationId: string, photo: PhotoRow) {
  const servable = Boolean(photo.width && photo.height && photo.lqip);
  return {
    id: photo.id,
    sort: photo.sort,
    status: photo.status,
    width: photo.width,
    height: photo.height,
    focal: { x: photo.focalX, y: photo.focalY },
    crop: { x: photo.cropX, y: photo.cropY, width: photo.cropW, height: photo.cropH },
    filter: photo.filter,
    lowQuality: Math.min(photo.width ?? 0, photo.height ?? 0) > 0 && Math.min(photo.width ?? 0, photo.height ?? 0) < 800,
    src: servable
      ? {
          w800: photoKey(invitationId, photo.id, 'w800.webp'),
          w1200: photoKey(invitationId, photo.id, 'w1200.webp'),
          w1600: photoKey(invitationId, photo.id, 'w1600.webp'),
          thumb: photoKey(invitationId, photo.id, 'thumb.webp'),
        }
      : null,
    lqip: photo.lqip,
  };
}

function sideOf(side: 'groom' | 'bride', row: InvitationRow) {
  const father = row.families.find((item) => item.side === side && item.role === 'father');
  const mother = row.families.find((item) => item.side === side && item.role === 'mother');
  return {
    relation: side === 'groom' ? row.groomRelation : row.brideRelation,
    father: parentOut(father),
    mother: parentOut(mother),
  };
}

function parentOut(row: ParentRow | undefined) {
  return {
    name: row?.name ?? '',
    phone: row?.phone ?? '',
    deceased: row?.deceased ?? false,
    deceasedStyle: row?.deceasedStyle ?? null,
  };
}

function checklist(row: InvitationRow) {
  const cover = [...row.photos].sort((a, b) => a.sort - b.sort)[0];
  return [
    { field: 'groom.name', ok: codePoints(row.groomName.trim()) >= 2 },
    { field: 'groom.givenName', ok: codePoints(row.groomGivenName.trim()) >= 1 },
    { field: 'bride.name', ok: codePoints(row.brideName.trim()) >= 2 },
    { field: 'bride.givenName', ok: codePoints(row.brideGivenName.trim()) >= 1 },
    { field: 'ceremony.date', ok: Boolean(row.ceremonyDate) },
    { field: 'ceremony.time', ok: Boolean(row.ceremonyTime) },
    { field: 'ceremony.venueName', ok: codePoints(row.venueName.trim()) >= 2 },
    { field: 'ceremony.address', ok: row.address.trim().length >= 1 },
    { field: 'photos.cover', ok: Boolean(cover && cover.status === 'ready') },
  ];
}

function toWorking(row: InvitationRow): WorkingInvitation {
  return row;
}

async function deadlineOf(client: DatabaseClient, row: InvitationRow): Promise<string | null> {
  const result = await client.query<{ deadline: Date | null }>(
    'select public.invitation_deadline($1::date, $2::time, $3::timestamptz) as deadline',
    [row.ceremonyDate, row.ceremonyTime, row.deadlineOverride],
  );
  const deadline = result.rows[0]?.deadline;
  return deadline ? iso(deadline) : null;
}

async function loadRow(client: DatabaseClient, id: string): Promise<InvitationRow> {
  const invitation = await client.query<{
    id: string;
    slug: string;
    status: string;
    theme: 'ivory' | 'sage' | 'mist';
    photo_filter: PhotoFilter;
    groom_name: string;
    groom_given_name: string;
    groom_phone: string;
    bride_name: string;
    bride_given_name: string;
    bride_phone: string;
    groom_relation: string;
    bride_relation: string;
    ceremony_date: string | null;
    ceremony_time: string | null;
    venue_name: string;
    hall: string;
    address: string;
    address_detail: string;
    lat: number | null;
    lng: number | null;
    greeting: string;
    transport_parking: string;
    transport_subway: string;
    transport_bus: string;
    transport_other: string;
    accounts_note: string;
    rsvp_deadline_override: Date | null;
    shared_link_version: number;
    shared_rsvp_token_hash: Buffer | null;
    published_revision: number | null;
    revision: number;
    published_at: Date | null;
    created_at: Date;
    updated_at: Date;
  }>('select * from invitations where id = $1 and status <> \'deleted\'', [id]);
  const row = invitation.rows[0];
  if (!row) throw new HttpError(404, 'not_found');
  const families = await client.query<ParentRow & { deceased_style: ParentRow['deceasedStyle'] }>(
    `select side, role, name, phone, deceased, deceased_style
     from invitation_families where invitation_id = $1`,
    [id],
  );
  const photos = await client.query<{
    id: string;
    sort: number;
    status: string;
    width: number | null;
    height: number | null;
    focal_x: number;
    focal_y: number;
    crop_x: number;
    crop_y: number;
    crop_w: number;
    crop_h: number;
    color_filter: PhotoFilter;
    lqip: string | null;
  }>(
    `select id, sort, status, width, height, focal_x, focal_y, crop_x, crop_y, crop_w, crop_h, color_filter, lqip
     from invitation_photos where invitation_id = $1`,
    [id],
  );
  const accounts = await client.query<{
    id: string;
    side: 'groom' | 'bride';
    sort: number;
    relation: string;
    holder: string;
    bank: string;
    account_number: string;
  }>('select id, side, sort, relation, holder, bank, account_number from invitation_accounts where invitation_id = $1', [id]);
  return {
    id: row.id,
    slug: row.slug,
    status: row.status,
    theme: row.theme,
    photoFilter: row.photo_filter,
    groomName: row.groom_name,
    groomGivenName: row.groom_given_name,
    groomPhone: row.groom_phone,
    brideName: row.bride_name,
    brideGivenName: row.bride_given_name,
    bridePhone: row.bride_phone,
    groomRelation: row.groom_relation,
    brideRelation: row.bride_relation,
    ceremonyDate: row.ceremony_date,
    ceremonyTime: row.ceremony_time,
    venueName: row.venue_name,
    hall: row.hall,
    address: row.address,
    addressDetail: row.address_detail,
    lat: row.lat,
    lng: row.lng,
    greeting: row.greeting,
    transportParking: row.transport_parking,
    transportSubway: row.transport_subway,
    transportBus: row.transport_bus,
    transportOther: row.transport_other,
    accountsNote: row.accounts_note,
    deadlineOverride: row.rsvp_deadline_override,
    sharedLinkVersion: row.shared_link_version,
    sharedHash: row.shared_rsvp_token_hash,
    publishedRevision: row.published_revision,
    revision: row.revision,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    families: families.rows.map((item) => ({
      side: item.side,
      role: item.role,
      name: item.name,
      phone: item.phone,
      deceased: item.deceased,
      deceasedStyle: item.deceased_style,
    })),
    photos: photos.rows.map((item) => ({
      id: item.id,
      sort: item.sort,
      status: item.status,
      width: item.width,
      height: item.height,
      focalX: item.focal_x,
      focalY: item.focal_y,
      cropX: item.crop_x,
      cropY: item.crop_y,
      cropW: item.crop_w,
      cropH: item.crop_h,
      filter: item.color_filter,
      lqip: item.lqip,
    })),
    accounts: accounts.rows.map((item) => ({
      id: item.id,
      side: item.side,
      sort: item.sort,
      relation: item.relation,
      holder: item.holder,
      bank: item.bank,
      number: item.account_number,
    })),
  };
}

type Patch = {
  theme?: 'ivory' | 'sage' | 'mist';
  photoFilter?: PhotoFilter;
  groom?: { name?: string; givenName?: string; phone?: string };
  bride?: { name?: string; givenName?: string; phone?: string };
  ceremony?: {
    date?: string | null;
    time?: string | null;
    venueName?: string;
    hall?: string;
    address?: string;
    addressDetail?: string;
    lat?: number | null;
    lng?: number | null;
  };
  greeting?: string;
  families?: { groom: FamilyInput; bride: FamilyInput };
  transport?: { parking?: string; subway?: string; bus?: string; other?: string };
  accountsNote?: string;
  accounts?: AccountInput[];
  photos?: {
    id: string;
    sort: number;
    focal?: { x: number; y: number };
    crop?: NormalizedCrop;
    filter?: PhotoFilter;
  }[];
  rsvp?: { deadline?: string | null };
};

type FamilyInput = { relation: string; father: ParentInput; mother: ParentInput };
type ParentInput = { name: string; phone: string; deceased: boolean; deceasedStyle: 'hanja' | 'hangul' | null };
type AccountInput = { id?: string; side: 'groom' | 'bride'; relation: string; holder: string; bank: string; number: string };

type RenderJob = { photoId: string; filter: PhotoFilter; crop: NormalizedCrop };

async function applyPatch(client: DatabaseClient, row: InvitationRow, patch: Patch): Promise<RenderJob[]> {
  const sets: string[] = [];
  const values: unknown[] = [];
  const set = (column: string, value: unknown) => {
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  };
  if (patch.theme) set('theme', patch.theme);
  if (patch.photoFilter) set('photo_filter', patch.photoFilter);
  if (patch.groom?.name !== undefined) set('groom_name', patch.groom.name);
  if (patch.groom?.givenName !== undefined) set('groom_given_name', patch.groom.givenName);
  if (patch.groom?.phone !== undefined) set('groom_phone', patch.groom.phone);
  if (patch.bride?.name !== undefined) set('bride_name', patch.bride.name);
  if (patch.bride?.givenName !== undefined) set('bride_given_name', patch.bride.givenName);
  if (patch.bride?.phone !== undefined) set('bride_phone', patch.bride.phone);
  if (patch.ceremony?.date !== undefined) set('ceremony_date', patch.ceremony.date);
  if (patch.ceremony?.time !== undefined) set('ceremony_time', patch.ceremony.time);
  if (patch.ceremony?.venueName !== undefined) set('venue_name', patch.ceremony.venueName);
  if (patch.ceremony?.hall !== undefined) set('hall', patch.ceremony.hall);
  if (patch.ceremony?.address !== undefined) set('address', patch.ceremony.address);
  if (patch.ceremony?.addressDetail !== undefined) set('address_detail', patch.ceremony.addressDetail);
  if (patch.ceremony?.lat !== undefined) set('lat', patch.ceremony.lat);
  if (patch.ceremony?.lng !== undefined) set('lng', patch.ceremony.lng);
  if (patch.greeting !== undefined) set('greeting', patch.greeting);
  if (patch.transport?.parking !== undefined) set('transport_parking', patch.transport.parking);
  if (patch.transport?.subway !== undefined) set('transport_subway', patch.transport.subway);
  if (patch.transport?.bus !== undefined) set('transport_bus', patch.transport.bus);
  if (patch.transport?.other !== undefined) set('transport_other', patch.transport.other);
  if (patch.accountsNote !== undefined) set('accounts_note', patch.accountsNote);
  if (patch.rsvp && 'deadline' in patch.rsvp) set('rsvp_deadline_override', patch.rsvp.deadline);
  if (patch.families) {
    set('groom_relation', patch.families.groom.relation);
    set('bride_relation', patch.families.bride.relation);
  }
  if (sets.length) {
    values.push(row.id);
    await client.query(`update invitations set ${sets.join(', ')}, revision = revision + 1 where id = $${values.length}`, values);
  } else if (patch.families || patch.accounts || patch.photos) {
    await client.query('update invitations set revision = revision + 1 where id = $1', [row.id]);
  }
  if (patch.families) {
    await client.query('delete from invitation_families where invitation_id = $1', [row.id]);
    for (const side of ['groom', 'bride'] as const) {
      for (const role of ['father', 'mother'] as const) {
        const parent = patch.families[side][role];
        await client.query(
          `insert into invitation_families (invitation_id, side, role, name, phone, deceased, deceased_style)
           values ($1, $2, $3, $4, $5, $6, $7)`,
          [row.id, side, role, parent.name, parent.deceased ? '' : parent.phone, parent.deceased, parent.deceased ? parent.deceasedStyle : null],
        );
      }
    }
  }
  if (patch.accounts) {
    await client.query('delete from invitation_accounts where invitation_id = $1', [row.id]);
    const counts = { groom: 0, bride: 0 };
    for (const account of patch.accounts) {
      const sort = counts[account.side];
      counts[account.side] += 1;
      await client.query(
        `insert into invitation_accounts (id, invitation_id, side, sort, relation, holder, bank, account_number)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [account.id ?? randomUUID(), row.id, account.side, sort, account.relation, account.holder, account.bank, account.number],
      );
    }
  }
  const jobs = new Map<string, RenderJob>();
  if (patch.photoFilter && patch.photoFilter !== row.photoFilter) {
    await client.query('update invitation_photos set color_filter = $1 where invitation_id = $2', [patch.photoFilter, row.id]);
    for (const photo of row.photos) {
      if (!canReprocess(photo)) continue;
      jobs.set(photo.id, { photoId: photo.id, filter: patch.photoFilter, crop: cropOf(photo) });
    }
  }
  if (patch.photos) {
    for (const photo of patch.photos) {
      const previous = row.photos.find((item) => item.id === photo.id);
      const updated = await client.query(
        `update invitation_photos set
           sort = $1,
           focal_x = coalesce($2, focal_x),
           focal_y = coalesce($3, focal_y),
           crop_x = coalesce($4, crop_x),
           crop_y = coalesce($5, crop_y),
           crop_w = coalesce($6, crop_w),
           crop_h = coalesce($7, crop_h),
           color_filter = coalesce($8, color_filter)
         where id = $9 and invitation_id = $10`,
        [
          photo.sort,
          photo.focal?.x ?? null,
          photo.focal?.y ?? null,
          photo.crop?.x ?? null,
          photo.crop?.y ?? null,
          photo.crop?.width ?? null,
          photo.crop?.height ?? null,
          photo.filter ?? null,
          photo.id,
          row.id,
        ],
      );
      if (updated.rowCount !== 1) throw new HttpError(400, 'validation', { field: 'photos', reason: 'invalid' });
      if (!previous || !canReprocess(previous)) continue;
      const nextFilter = photo.filter ?? patch.photoFilter ?? previous.filter;
      const nextCrop = photo.crop ?? cropOf(previous);
      const changed =
        (photo.filter !== undefined && photo.filter !== previous.filter) ||
        (photo.crop !== undefined && !sameCrop(photo.crop, cropOf(previous))) ||
        (patch.photoFilter !== undefined && patch.photoFilter !== previous.filter);
      if (!changed) {
        jobs.delete(photo.id);
        continue;
      }
      jobs.set(photo.id, { photoId: photo.id, filter: nextFilter, crop: nextCrop });
    }
  }
  for (const job of jobs.values()) {
    await client.query('select public.mark_photo_processing($1)', [job.photoId]);
  }
  const nextDate = patch.ceremony?.date !== undefined ? patch.ceremony.date : row.ceremonyDate;
  const nextTime = patch.ceremony?.time !== undefined ? patch.ceremony.time : row.ceremonyTime;
  const nextDeadline = patch.rsvp && 'deadline' in patch.rsvp ? patch.rsvp.deadline : row.deadlineOverride?.toISOString() ?? null;
  if (nextDeadline && nextDate) {
    const start = await client.query<{ ceremony_start: Date }>(
      'select public.ceremony_start($1::date, $2::time) as ceremony_start',
      [nextDate, nextTime],
    );
    const startAt = start.rows[0]?.ceremony_start;
    if (startAt && new Date(nextDeadline).getTime() > startAt.getTime()) {
      throw new HttpError(400, 'validation', { field: 'rsvp.deadline', reason: 'deadline_after_ceremony' });
    }
  }
  return [...jobs.values()];
}

function assertAccountsComplete(accounts: AccountRow[]) {
  for (const account of accounts) {
    const any = account.relation.trim() || account.holder.trim() || account.bank.trim() || account.number.trim();
    if (!any) continue;
    if (account.number.trim() && !accountNumberOk(account.number)) {
      throw new HttpError(400, 'validation', { field: 'accounts.number', reason: 'invalid' });
    }
    if (codePoints(account.holder.trim()) < 2 || !account.bank.trim() || !accountNumberOk(account.number)) {
      throw new HttpError(400, 'validation', { field: 'accounts', reason: 'incomplete' });
    }
  }
}

function assertReadyToPublish(row: InvitationRow) {
  if (!row.groomGivenName.trim()) throw new HttpError(400, 'validation', { field: 'groom.givenName', reason: 'required' });
  if (!row.brideGivenName.trim()) throw new HttpError(400, 'validation', { field: 'bride.givenName', reason: 'required' });
  if (row.groomPhone && !phoneOk(row.groomPhone)) throw new HttpError(400, 'validation', { field: 'groom.phone', reason: 'invalid' });
  if (row.bridePhone && !phoneOk(row.bridePhone)) throw new HttpError(400, 'validation', { field: 'bride.phone', reason: 'invalid' });
  for (const parent of row.families) {
    if (parent.phone && !phoneOk(parent.phone)) {
      throw new HttpError(400, 'validation', { field: `families.${parent.side}.${parent.role}.phone`, reason: 'invalid' });
    }
  }
  assertAccountsComplete(row.accounts);
}

function canReprocess(photo: PhotoRow): boolean {
  return photo.status === 'ready' || photo.status === 'failed' || photo.status === 'processing';
}

function cropOf(photo: PhotoRow): NormalizedCrop {
  return { x: photo.cropX, y: photo.cropY, width: photo.cropW, height: photo.cropH };
}

function sameCrop(left: NormalizedCrop, right: NormalizedCrop): boolean {
  return left.x === right.x && left.y === right.y && left.width === right.width && left.height === right.height;
}

function etagValue(header: string): string {
  const trimmed = header.trim();
  const weak = trimmed.startsWith('W/') ? trimmed.slice(2).trim() : trimmed;
  if (weak.startsWith('"') && weak.endsWith('"') && weak.length >= 2) return weak.slice(1, -1);
  return weak;
}

function parseCreate(body: unknown) {
  const record = isRecord(body) ? body : {};
  const theme = record.theme === undefined ? 'ivory' : record.theme;
  if (typeof theme !== 'string' || !THEMES.has(theme)) {
    throw new HttpError(400, 'validation', { field: 'theme', reason: 'invalid' });
  }
  return {
    theme,
    groomName: record.groomName === undefined ? '' : bounded(record.groomName, 'groomName', 10),
    brideName: record.brideName === undefined ? '' : bounded(record.brideName, 'brideName', 10),
    ceremonyDate: record.ceremonyDate === undefined ? null : requiredDate(record.ceremonyDate, 'ceremonyDate'),
    ceremonyTime: record.ceremonyTime === undefined ? null : requiredTime(record.ceremonyTime, 'ceremonyTime'),
  };
}

function parseAutosave(body: unknown): Patch | null {
  if (!isRecord(body)) throw new HttpError(400, 'validation');
  const patch: Patch = {};
  if (body.theme !== undefined) {
    if (typeof body.theme !== 'string' || !THEMES.has(body.theme)) throw new HttpError(400, 'validation', { field: 'theme', reason: 'invalid' });
    patch.theme = body.theme as Patch['theme'];
  }
  if (body.photoFilter !== undefined) {
    if (typeof body.photoFilter !== 'string' || !FILTERS.has(body.photoFilter)) {
      throw new HttpError(400, 'validation', { field: 'photoFilter', reason: 'invalid' });
    }
    patch.photoFilter = body.photoFilter as PhotoFilter;
  }
  if (body.groom !== undefined) patch.groom = personPatch(body.groom, 'groom');
  if (body.bride !== undefined) patch.bride = personPatch(body.bride, 'bride');
  if (body.ceremony !== undefined) patch.ceremony = ceremonyPatch(body.ceremony);
  if (body.greeting !== undefined) patch.greeting = bounded(body.greeting, 'greeting', 300);
  if (body.families !== undefined) patch.families = familiesPatch(body.families);
  if (body.transport !== undefined) patch.transport = transportPatch(body.transport);
  if (body.accountsNote !== undefined) patch.accountsNote = bounded(body.accountsNote, 'accountsNote', 80);
  if (body.accounts !== undefined) patch.accounts = accountsPatch(body.accounts);
  if (body.photos !== undefined) patch.photos = photosPatch(body.photos);
  if (body.rsvp !== undefined) patch.rsvp = rsvpPatch(body.rsvp);
  return Object.keys(patch).length ? patch : null;
}

function personPatch(value: unknown, field: string) {
  if (!isRecord(value)) throw new HttpError(400, 'validation', { field, reason: 'invalid' });
  const patch: { name?: string; givenName?: string; phone?: string } = {};
  if (value.name !== undefined) patch.name = bounded(value.name, `${field}.name`, 10);
  if (value.givenName !== undefined) patch.givenName = bounded(value.givenName, `${field}.givenName`, 10);
  if (value.phone !== undefined) patch.phone = bounded(value.phone, `${field}.phone`, 20);
  return patch;
}

function ceremonyPatch(value: unknown): NonNullable<Patch['ceremony']> {
  if (!isRecord(value)) throw new HttpError(400, 'validation', { field: 'ceremony', reason: 'invalid' });
  const patch: NonNullable<Patch['ceremony']> = {};
  if (value.date !== undefined) patch.date = value.date === null ? null : requiredDate(value.date, 'ceremony.date');
  if (value.time !== undefined) patch.time = value.time === null ? null : requiredTime(value.time, 'ceremony.time');
  if (value.venueName !== undefined) patch.venueName = bounded(value.venueName, 'ceremony.venueName', 30);
  if (value.hall !== undefined) patch.hall = bounded(value.hall, 'ceremony.hall', 20);
  if (value.address !== undefined) patch.address = bounded(value.address, 'ceremony.address', 120);
  if (value.addressDetail !== undefined) patch.addressDetail = bounded(value.addressDetail, 'ceremony.addressDetail', 40);
  if (value.lat !== undefined) patch.lat = coord(value.lat, 'ceremony.lat', -90, 90);
  if (value.lng !== undefined) patch.lng = coord(value.lng, 'ceremony.lng', -180, 180);
  return patch;
}

function familiesPatch(value: unknown): NonNullable<Patch['families']> {
  if (!isRecord(value)) throw new HttpError(400, 'validation', { field: 'families', reason: 'invalid' });
  return { groom: familyPatch(value.groom, 'families.groom'), bride: familyPatch(value.bride, 'families.bride') };
}

function familyPatch(value: unknown, field: string): FamilyInput {
  if (!isRecord(value)) throw new HttpError(400, 'validation', { field, reason: 'invalid' });
  return {
    relation: bounded(value.relation ?? '', `${field}.relation`, 6),
    father: parentPatch(value.father, `${field}.father`),
    mother: parentPatch(value.mother, `${field}.mother`),
  };
}

function parentPatch(value: unknown, field: string): ParentInput {
  if (!isRecord(value)) throw new HttpError(400, 'validation', { field, reason: 'invalid' });
  const deceased = value.deceased === true;
  let deceasedStyle: ParentInput['deceasedStyle'] = null;
  if (value.deceasedStyle !== undefined && value.deceasedStyle !== null) {
    if (value.deceasedStyle !== 'hanja' && value.deceasedStyle !== 'hangul') {
      throw new HttpError(400, 'validation', { field: `${field}.deceasedStyle`, reason: 'invalid' });
    }
    deceasedStyle = value.deceasedStyle;
  }
  const phone = bounded(typeof value.phone === 'string' ? value.phone : '', `${field}.phone`, 20);
  return { name: bounded(typeof value.name === 'string' ? value.name : '', `${field}.name`, 10), phone, deceased, deceasedStyle };
}

function transportPatch(value: unknown): NonNullable<Patch['transport']> {
  if (!isRecord(value)) throw new HttpError(400, 'validation', { field: 'transport', reason: 'invalid' });
  const patch: NonNullable<Patch['transport']> = {};
  if (value.parking !== undefined) patch.parking = bounded(value.parking, 'transport.parking', 100);
  if (value.subway !== undefined) patch.subway = bounded(value.subway, 'transport.subway', 100);
  if (value.bus !== undefined) patch.bus = bounded(value.bus, 'transport.bus', 100);
  if (value.other !== undefined) patch.other = bounded(value.other, 'transport.other', 100);
  return patch;
}

function accountsPatch(value: unknown): AccountInput[] {
  if (!Array.isArray(value)) throw new HttpError(400, 'validation', { field: 'accounts', reason: 'invalid' });
  const counts = { groom: 0, bride: 0 };
  return value.map((item) => {
    if (!isRecord(item) || (item.side !== 'groom' && item.side !== 'bride')) {
      throw new HttpError(400, 'validation', { field: 'accounts.side', reason: 'invalid' });
    }
    counts[item.side] += 1;
    if (counts[item.side] > 3) throw new HttpError(400, 'validation', { field: 'accounts', reason: 'too_many' });
    const number = bounded(typeof item.number === 'string' ? item.number : '', 'accounts.number', 24);
    const id = item.id === undefined ? undefined : item.id;
    if (id !== undefined && (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id))) {
      throw new HttpError(400, 'validation', { field: 'accounts.id', reason: 'invalid' });
    }
    return {
      id,
      side: item.side,
      relation: bounded(typeof item.relation === 'string' ? item.relation : '', 'accounts.relation', 20),
      holder: bounded(typeof item.holder === 'string' ? item.holder : '', 'accounts.holder', 20),
      bank: bounded(typeof item.bank === 'string' ? item.bank : '', 'accounts.bank', 30),
      number,
    };
  });
}

function photosPatch(value: unknown): NonNullable<Patch['photos']> {
  if (!Array.isArray(value) || value.length > 10) throw new HttpError(400, 'validation', { field: 'photos', reason: 'invalid' });
  return value.map((item) => {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.sort !== 'number' || !Number.isInteger(item.sort) || item.sort < 0 || item.sort > 9) {
      throw new HttpError(400, 'validation', { field: 'photos', reason: 'invalid' });
    }
    let focal: { x: number; y: number } | undefined;
    if (item.focal !== undefined) {
      if (!isRecord(item.focal) || typeof item.focal.x !== 'number' || typeof item.focal.y !== 'number') {
        throw new HttpError(400, 'validation', { field: 'photos.focal', reason: 'invalid' });
      }
      if (item.focal.x < 0 || item.focal.x > 1 || item.focal.y < 0 || item.focal.y > 1) {
        throw new HttpError(400, 'validation', { field: 'photos.focal', reason: 'out_of_range' });
      }
      focal = { x: item.focal.x, y: item.focal.y };
    }
    let crop: NormalizedCrop | undefined;
    if (item.crop !== undefined) crop = cropPatch(item.crop);
    let filter: PhotoFilter | undefined;
    if (item.filter !== undefined) {
      if (typeof item.filter !== 'string' || !FILTERS.has(item.filter)) {
        throw new HttpError(400, 'validation', { field: 'photos.filter', reason: 'invalid' });
      }
      filter = item.filter as PhotoFilter;
    }
    return { id: item.id, sort: item.sort, focal, crop, filter };
  });
}

function cropPatch(value: unknown): NormalizedCrop {
  if (!isRecord(value) || typeof value.x !== 'number' || typeof value.y !== 'number' || typeof value.width !== 'number' || typeof value.height !== 'number') {
    throw new HttpError(400, 'validation', { field: 'photos.crop', reason: 'invalid' });
  }
  const crop = { x: value.x, y: value.y, width: value.width, height: value.height };
  if (
    crop.x < 0 || crop.y < 0 || crop.width <= 0 || crop.height <= 0 ||
    crop.x > 1 || crop.y > 1 || crop.width > 1 || crop.height > 1 ||
    crop.x + crop.width > 1.001 || crop.y + crop.height > 1.001
  ) {
    throw new HttpError(400, 'validation', { field: 'photos.crop', reason: 'out_of_range' });
  }
  return crop;
}

function rsvpPatch(value: unknown): NonNullable<Patch['rsvp']> {
  if (!isRecord(value)) throw new HttpError(400, 'validation', { field: 'rsvp', reason: 'invalid' });
  if (!('deadline' in value)) return {};
  if (value.deadline === null) return { deadline: null };
  if (typeof value.deadline !== 'string' || Number.isNaN(new Date(value.deadline).getTime())) {
    throw new HttpError(400, 'validation', { field: 'rsvp.deadline', reason: 'invalid' });
  }
  return { deadline: new Date(value.deadline).toISOString() };
}

function bounded(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string') throw new HttpError(400, 'validation', { field, reason: 'invalid' });
  const normalized = value.trim().normalize('NFC');
  if (codePoints(normalized) > max) throw new HttpError(400, 'validation', { field, reason: 'too_long' });
  return normalized;
}

function requiredDate(value: unknown, field: string): string {
  if (typeof value !== 'string' || !isCalendarDate(value)) throw new HttpError(400, 'validation', { field, reason: 'invalid' });
  return value;
}

function requiredTime(value: unknown, field: string): string {
  if (typeof value !== 'string' || !isTime(value)) throw new HttpError(400, 'validation', { field, reason: 'invalid' });
  return value;
}

function coord(value: unknown, field: string, min: number, max: number): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || value < min || value > max) throw new HttpError(400, 'validation', { field, reason: 'out_of_range' });
  return value;
}

function purgeAt(date: string | null, delayDays: number): string | null {
  if (!date) return null;
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day + delayDays, -9, 0, 0, 0)).toISOString();
}

async function flagsOn(client: DatabaseClient) {
  const result = await client.query<{ flags: { adsEnabled?: boolean; purgeDelayDays?: number } }>('select private.app_flags() as flags');
  return {
    adsEnabled: Boolean(result.rows[0]?.flags?.adsEnabled),
    purgeDelayDays: result.rows[0]?.flags?.purgeDelayDays ?? 30,
  };
}

async function readFlags(pool: Database, claims: AuthClaims) {
  return withUser(pool, claims, flagsOn);
}
