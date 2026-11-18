import type { AxiosInstance } from 'axios';
import { clientInstance } from '@/api/clientInstance';
import type { ApiResult } from '@/api/instance/types';
import type { RsvpContext, RsvpContextResult, RsvpResponse, RsvpSubmitBody, RsvpSubmitResult } from '@/domain/types';
import type { RsvpDomain } from '@/domain/rsvp/api.type';

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

export function createApiRsvpClient(baseUrl: string, http?: AxiosInstance): RsvpClient {
  return {
    context(input) {
      return postJson<RsvpDomain.Context.Res, RsvpContextResult>(http, baseUrl, '/functions/v1/rsvp-context', input, (reply) => {
        if (reply.status < 400 && isRecord(reply.data) && 'status' in reply.data) return { ok: true, context: reply.data as RsvpContext };
        if (reply.status === 404) return { ok: false, code: 'not_found' };
        if (reply.status === 503) return { ok: false, code: 'unavailable' };
        return { ok: false, code: 'network' };
      });
    },
    submit(body) {
      return postJson<RsvpDomain.Submit.Res, RsvpSubmitResult>(http, baseUrl, '/functions/v1/rsvp', body, (reply) => {
        if (reply.status < 400 && isRecord(reply.data) && 'response' in reply.data) {
          const bodyPayload = reply.data as { response: RsvpResponse; edited?: boolean; editKey?: string };
          return {
            ok: true,
            response: bodyPayload.response,
            edited: Boolean(bodyPayload.edited),
            editKey: bodyPayload.editKey,
          };
        }
        return readSubmitError(reply);
      });
    },
  };
}

type Reply<T> = ApiResult<T>;

async function postJson<T, R>(http: AxiosInstance | undefined, baseUrl: string, path: string, body: unknown, map: (reply: Reply<T>) => R): Promise<R> {
  try {
    if (http) {
      const response = await http.post<T>(`${baseUrl}${path}`, body);
      return map({
        status: response.status,
        data: response.data,
        retryAfter: response.status === 429 ? Number(response.headers['retry-after']) : undefined,
        header(name) {
          const value = response.headers[name.toLowerCase()];
          if (Array.isArray(value)) return value[0];
          return typeof value === 'string' ? value : undefined;
        },
      });
    }
    return map(await clientInstance.post<T>(path, { body }));
  } catch {
    return { ok: false, code: 'network' } as R;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readSubmitError(reply: Reply<unknown>): RsvpSubmitResult {
  const error = (reply.data as { error?: { code?: string; field?: string; reason?: string } } | null)?.error;
  const code = error?.code;
  const retryAfter = reply.retryAfter ?? Number(reply.header('retry-after'));
  if (reply.status === 400 && code === 'validation') {
    return { ok: false, code: 'validation', field: error?.field, reason: error?.reason };
  }
  if (reply.status === 400) return { ok: false, code: 'validation' };
  if (reply.status === 403 && code === 'turnstile_failed') return { ok: false, code: 'turnstile_failed' };
  if (reply.status === 403 && code === 'edit_forbidden') return { ok: false, code: 'edit_forbidden' };
  if (reply.status === 404) return { ok: false, code: 'not_found' };
  if (reply.status === 409) return { ok: false, code: 'closed' };
  if (reply.status === 410) return { ok: false, code: 'revoked' };
  if (reply.status === 429) {
    return { ok: false, code: 'rate_limited', retryAfter: Number.isFinite(retryAfter) ? retryAfter : undefined };
  }
  if (reply.status === 503) return { ok: false, code: 'unavailable' };
  return { ok: false, code: 'network' };
}
