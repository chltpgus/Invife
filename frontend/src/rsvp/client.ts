import { invitations } from '@/data/fixtures';
import { isDeadlineClosed } from '@/domain/dates';
import { editStorageKey, normalizeGuestName, readStoredEdit, validateGuestName } from '@/domain/rsvp';
import type {
  RsvpContext,
  RsvpContextResult,
  RsvpResponse,
  RsvpSubmitBody,
  RsvpSubmitResult,
  StoredEdit,
} from '@/domain/types';
import { sampleDirectory } from '@/rsvp/fixture-directory';

export interface RsvpClient {
  context(input: { slug: string; token?: string }): Promise<RsvpContextResult>;
  submit(body: RsvpSubmitBody): Promise<RsvpSubmitResult>;
}

export type MemoryStore = {
  get(key: string): string | null;
  set(key: string, value: string): void;
};

export function browserStore(): MemoryStore {
  return {
    get(key) {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch {
        /* 사생활 모드 등 */
      }
    },
  };
}

const personalEdits = new Map<string, RsvpResponse>();

function deadlineFor(slug: string): string | null {
  return invitations.find((invitation) => invitation.slug === slug)?.rsvp.deadline ?? null;
}

function contextFor(slug: string, token: string | undefined, now: Date): RsvpContextResult {
  const sample = sampleDirectory.find((item) => item.slug === slug);
  const deadline = deadlineFor(slug);
  if (!sample || !deadline) return { ok: false, code: 'not_found' };
  if (sample.unavailable) return { ok: false, code: 'unavailable' };
  const closed = isDeadlineClosed(now, deadline);
  const status = closed ? 'closed' : 'open';
  if (!token) return { ok: true, context: { status, deadline, link: 'invite' } };
  if (token === sample.rsvpToken) return { ok: true, context: { status, deadline, link: 'rsvp_link' } };
  const recipient = sample.recipients.find((item) => item.token === token);
  if (!recipient) return { ok: false, code: 'not_found' };
  if (recipient.revoked) {
    return { ok: true, context: { status, deadline, link: 'personal', revoked: true } };
  }
  const response = personalEdits.get(`${slug}:${token}`) ?? recipient.response;
  const context: RsvpContext = {
    status,
    deadline,
    link: 'personal',
    prefillName: recipient.name,
    response,
  };
  return { ok: true, context };
}

function writeEdit(store: MemoryStore, key: string, edit: StoredEdit) {
  store.set(key, JSON.stringify(edit));
}

export function createFixtureRsvpClient(store: MemoryStore, now = () => new Date()): RsvpClient {
  return {
    async context(input) {
      return contextFor(input.slug, input.token, now());
    },
    async submit(body) {
      const sample = sampleDirectory.find((item) => item.slug === body.slug);
      if (!sample) return { ok: false, code: 'not_found' };
      if (sample.unavailable) return { ok: false, code: 'unavailable' };
      const deadline = deadlineFor(body.slug);
      if (deadline && isDeadlineClosed(now(), deadline)) return { ok: false, code: 'closed' };
      if (body.channel === 'personal') {
        const recipient = sample.recipients.find((item) => item.token === body.token);
        if (!recipient || !body.token) return { ok: false, code: 'not_found' };
        if (recipient.revoked) return { ok: false, code: 'revoked' };
      } else if (body.channel === 'rsvp_link' && body.token !== sample.rsvpToken) {
        return { ok: false, code: 'not_found' };
      }
      if (!body.attending && body.companions !== 0) {
        return { ok: false, code: 'validation', field: 'companions', reason: 'not_zero' };
      }
      const name = normalizeGuestName(body.name ?? '');
      const nameError = validateGuestName(name);
      if (nameError) {
        return { ok: false, code: 'validation', field: 'name', reason: [...name].length > 20 ? 'too_long' : 'required' };
      }
      const updatedAt = now().toISOString();
      if (body.channel === 'personal' && body.token) {
        const previous = personalEdits.get(`${body.slug}:${body.token}`) ?? sample.recipients.find((item) => item.token === body.token)?.response;
        const response: RsvpResponse = {
          id: previous?.id ?? `local-${body.slug}-${body.token}`,
          attending: body.attending,
          companions: body.companions,
          name,
          updatedAt,
        };
        personalEdits.set(`${body.slug}:${body.token}`, response);
        return { ok: true, response, edited: Boolean(previous) };
      }
      const channel = body.channel === 'rsvp_link' ? 'rsvp_link' : 'invite';
      const key = editStorageKey(body.slug, channel, body.token);
      if (body.responseId) {
        const saved = readStoredEdit(store.get(key));
        if (!saved || saved.editKey !== body.editKey || saved.responseId !== body.responseId) {
          return { ok: false, code: 'edit_forbidden' };
        }
        const response: RsvpResponse = { ...saved.response, attending: body.attending, companions: body.companions, name, updatedAt };
        writeEdit(store, key, { responseId: response.id, editKey: saved.editKey, response });
        return { ok: true, response, edited: true };
      }
      const response: RsvpResponse = {
        id: `local-${body.slug}-${body.channel}`,
        attending: body.attending,
        companions: body.companions,
        name,
        updatedAt,
      };
      const editKey = `edit-${body.slug}-${body.channel}`;
      writeEdit(store, key, { responseId: response.id, editKey, response });
      return { ok: true, response, edited: false, editKey };
    },
  };
}

export function createApiRsvpClient(baseUrl: string): RsvpClient {
  return {
    context(input) {
      return postJson<RsvpContextResult>(`${baseUrl}/functions/v1/rsvp-context`, input, (response, payload) => {
        if (response.ok && isRecord(payload) && 'status' in payload) return { ok: true, context: payload as RsvpContext };
        if (response.status === 404) return { ok: false, code: 'not_found' };
        if (response.status === 503) return { ok: false, code: 'unavailable' };
        return { ok: false, code: 'network' };
      });
    },
    submit(body) {
      return postJson<RsvpSubmitResult>(`${baseUrl}/functions/v1/rsvp`, body, (response, payload) => {
        if (response.ok && isRecord(payload) && 'response' in payload) {
          const bodyPayload = payload as { response: RsvpResponse; edited?: boolean; editKey?: string };
          return {
            ok: true,
            response: bodyPayload.response,
            edited: Boolean(bodyPayload.edited),
            editKey: bodyPayload.editKey,
          };
        }
        return readSubmitError(response, payload);
      });
    },
  };
}

async function postJson<T>(url: string, body: unknown, map: (response: Response, payload: unknown) => T): Promise<T> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    return map(response, payload);
  } catch {
    return { ok: false, code: 'network' } as T;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readSubmitError(response: Response, payload: unknown): RsvpSubmitResult {
  const error = (payload as { error?: { code?: string; field?: string; reason?: string } } | null)?.error;
  const code = error?.code;
  const retryAfter = Number(response.headers.get('Retry-After'));
  if (response.status === 400 && code === 'validation') {
    return { ok: false, code: 'validation', field: error?.field, reason: error?.reason };
  }
  if (response.status === 400) return { ok: false, code: 'validation' };
  if (response.status === 403 && code === 'turnstile_failed') return { ok: false, code: 'turnstile_failed' };
  if (response.status === 403 && code === 'edit_forbidden') return { ok: false, code: 'edit_forbidden' };
  if (response.status === 404) return { ok: false, code: 'not_found' };
  if (response.status === 409) return { ok: false, code: 'closed' };
  if (response.status === 410) return { ok: false, code: 'revoked' };
  if (response.status === 429) {
    return { ok: false, code: 'rate_limited', retryAfter: Number.isFinite(retryAfter) ? retryAfter : undefined };
  }
  if (response.status === 503) return { ok: false, code: 'unavailable' };
  return { ok: false, code: 'network' };
}
