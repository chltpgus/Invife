import type { Config } from '../config';
import type { Database } from '../db';
import { withService } from '../db';
import { codePoints, iso, normalizeName } from '../domain/text';
import { ipHash, randomToken, tokenHash } from '../domain/tokens';
import { HttpError, isRecord } from '../http';
import { addUsage, takeLimit } from '../limits';

export type GuestDeps = {
  pool: Database;
  config: Config;
  now: () => Date;
  verifyTurnstile: (token: string, ip: string) => Promise<'ok' | 'failed' | 'unavailable'>;
};

type Channel = 'personal' | 'invite' | 'rsvp_link';

type SubmitInput = {
  slug: string;
  channel: Channel;
  token?: string;
  name: string;
  attending: boolean;
  companions: number;
  responseId?: string;
  editKey?: string;
  turnstileToken?: string;
};

type ContextPayload = {
  ok: boolean;
  code?: string;
  context?: {
    status: 'open' | 'closed';
    deadline: string;
    link: Channel;
    revoked?: boolean;
    prefillName?: string;
    response?: ResponsePayload | null;
  };
};

type ResponsePayload = {
  id: string;
  attending: boolean;
  companions: number;
  name: string;
  updatedAt: string;
};

type ApplyPayload = {
  ok: boolean;
  code?: string;
  field?: string;
  reason?: string;
  edited?: boolean;
  response?: ResponsePayload;
};

export async function rsvpContext(deps: GuestDeps, body: unknown, ip: string) {
  const slug = readSlug(body);
  const token = readOptionalToken(isRecord(body) ? body.token : undefined);
  await takeLimit(deps.pool, `ctx:${ipHash(ip)}`, 60, deps.config.limits.contextPerMinute);
  return withService(deps.pool, async (client) => {
    const result = await client.query<{ rsvp_context: ContextPayload }>(
      'select private.rsvp_context($1, $2, $3) as rsvp_context',
      [slug, token ? tokenHash(token) : null, deps.now().toISOString()],
    );
    return mapContext(result.rows[0]?.rsvp_context);
  });
}

export async function submitRsvp(deps: GuestDeps, body: unknown, ip: string) {
  const input = parseSubmit(body);
  const editing = input.channel !== 'personal' && Boolean(input.responseId);
  await assertTurnstile(deps, input, ip, editing);
  await limitSubmit(deps, input, ip);
  return withService(deps.pool, async (client) => {
    const editKey = !editing && input.channel !== 'personal' ? randomToken() : undefined;
    const result = await client.query<{ apply_rsvp: ApplyPayload }>(
      'select private.apply_rsvp($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) as apply_rsvp',
      [
        input.slug,
        input.channel,
        input.token ? tokenHash(input.token) : null,
        input.name,
        input.attending,
        input.companions,
        input.responseId ?? null,
        input.editKey ? tokenHash(input.editKey) : null,
        editKey ? tokenHash(editKey) : null,
        deps.now().toISOString(),
      ],
    );
    const payload = result.rows[0]?.apply_rsvp;
    if (!payload) throw new HttpError(503, 'unavailable');
    if (!payload.ok || !payload.response) throw payloadError(payload);
    await addUsage(client, 0, 0, 1);
    return {
      response: normalizeResponse(payload.response),
      edited: Boolean(payload.edited),
      ...(editKey ? { editKey } : {}),
    };
  });
}

async function limitSubmit(deps: GuestDeps, input: SubmitInput, ip: string) {
  if (input.channel === 'personal') {
    await takeLimit(
      deps.pool,
      `rsvp:tok:${tokenHash(input.token ?? '').toString('hex').slice(0, 32)}`,
      3600,
      deps.config.limits.personalPerHour,
    );
    return;
  }
  await takeLimit(deps.pool, `rsvp:ip:${ipHash(ip)}:${input.slug}`, 600, deps.config.limits.publicPer10Min);
  await takeLimit(deps.pool, `rsvp:slug:${input.slug}`, 3600, deps.config.limits.publicPerHour);
}

async function assertTurnstile(deps: GuestDeps, input: SubmitInput, ip: string, editing: boolean) {
  if (!deps.config.turnstileSecret || input.channel === 'personal') return;
  if (editing && !input.turnstileToken) return;
  if (!input.turnstileToken) throw new HttpError(403, 'turnstile_failed');
  const verdict = await deps.verifyTurnstile(input.turnstileToken, ip);
  if (verdict === 'unavailable') throw new HttpError(503, 'unavailable');
  if (verdict !== 'ok') throw new HttpError(403, 'turnstile_failed');
}

function mapContext(payload: ContextPayload | undefined) {
  if (!payload?.ok || !payload.context) throw payloadError(payload ?? { ok: false, code: 'unavailable' });
  const context = {
    ...payload.context,
    deadline: iso(payload.context.deadline),
  };
  if (context.response) context.response = normalizeResponse(context.response);
  return context;
}

function normalizeResponse(response: ResponsePayload) {
  return {
    id: response.id,
    attending: response.attending,
    companions: response.companions,
    name: response.name,
    updatedAt: iso(response.updatedAt),
  };
}

function payloadError(payload: { code?: string; field?: string; reason?: string }): HttpError {
  const code = payload.code ?? 'unavailable';
  const status =
    code === 'validation' ? 400
    : code === 'turnstile_failed' || code === 'edit_forbidden' ? 403
    : code === 'not_found' ? 404
    : code === 'closed' ? 409
    : code === 'revoked' ? 410
    : code === 'rate_limited' ? 429
    : 503;
  return new HttpError(status, code === 'unavailable' && !payload.code ? 'unavailable' : code, {
    field: payload.field,
    reason: payload.reason,
  });
}

function readSlug(body: unknown): string {
  if (!isRecord(body) || typeof body.slug !== 'string' || !body.slug.trim()) {
    throw new HttpError(400, 'validation', { field: 'slug', reason: 'required' });
  }
  return body.slug.trim();
}

function readOptionalToken(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || value.length > 200) {
    throw new HttpError(400, 'validation', { field: 'token', reason: 'invalid' });
  }
  return value;
}

function parseSubmit(body: unknown): SubmitInput {
  if (!isRecord(body)) throw new HttpError(400, 'validation');
  const slug = readSlug(body);
  const channel = body.channel;
  if (channel !== 'personal' && channel !== 'invite' && channel !== 'rsvp_link') {
    throw new HttpError(400, 'validation', { field: 'channel', reason: 'invalid' });
  }
  const token = readOptionalToken(body.token);
  if (channel === 'personal' && !token) throw new HttpError(400, 'validation', { field: 'token', reason: 'required' });
  if (channel === 'rsvp_link' && !token) throw new HttpError(400, 'validation', { field: 'token', reason: 'required' });
  if (typeof body.attending !== 'boolean') {
    throw new HttpError(400, 'validation', { field: 'attending', reason: 'invalid' });
  }
  if (typeof body.companions !== 'number' || !Number.isInteger(body.companions)) {
    throw new HttpError(400, 'validation', { field: 'companions', reason: 'out_of_range' });
  }
  if (body.companions < 0 || body.companions > 10) {
    throw new HttpError(400, 'validation', { field: 'companions', reason: 'out_of_range' });
  }
  if (!body.attending && body.companions !== 0) {
    throw new HttpError(400, 'validation', { field: 'companions', reason: 'companions_when_absent' });
  }
  const name = typeof body.name === 'string' ? normalizeName(body.name) : '';
  const length = codePoints(name);
  if (length < 1) throw new HttpError(400, 'validation', { field: 'name', reason: 'required' });
  if (length > 20) throw new HttpError(400, 'validation', { field: 'name', reason: 'too_long' });
  const responseId = channel === 'personal' ? undefined : optionalUuid(body.responseId, 'responseId');
  const editKey = channel === 'personal' ? undefined : optionalSecret(body.editKey, 'editKey');
  if (channel !== 'personal' && ((responseId && !editKey) || (!responseId && editKey))) {
    throw new HttpError(403, 'edit_forbidden');
  }
  const turnstileToken = typeof body.turnstileToken === 'string' ? body.turnstileToken : undefined;
  return { slug, channel, token, name, attending: body.attending, companions: body.companions, responseId, editKey, turnstileToken };
}

function optionalUuid(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !/^[0-9a-f-]{36}$/i.test(value)) {
    throw new HttpError(400, 'validation', { field, reason: 'invalid' });
  }
  return value;
}

function optionalSecret(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || value.length > 200) {
    throw new HttpError(400, 'validation', { field, reason: 'invalid' });
  }
  return value;
}
