import type { AxiosInstance } from 'axios';
import { apiClient } from '@/api/createInstance';
import type { RsvpContext, RsvpContextResult, RsvpResponse, RsvpSubmitBody, RsvpSubmitResult } from '@/domain/types';

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

export const apiHttp = apiClient;

export function createApiRsvpClient(baseUrl: string, http: AxiosInstance = apiHttp): RsvpClient {
  return {
    context(input) {
      return postJson<RsvpContextResult>(http, `${baseUrl}/functions/v1/rsvp-context`, input, (reply) => {
        if (reply.status < 400 && isRecord(reply.data) && 'status' in reply.data) return { ok: true, context: reply.data as RsvpContext };
        if (reply.status === 404) return { ok: false, code: 'not_found' };
        if (reply.status === 503) return { ok: false, code: 'unavailable' };
        return { ok: false, code: 'network' };
      });
    },
    submit(body) {
      return postJson<RsvpSubmitResult>(http, `${baseUrl}/functions/v1/rsvp`, body, (reply) => {
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

type Reply = { status: number; data: unknown; header(name: string): string | undefined };

async function postJson<T>(http: AxiosInstance, url: string, body: unknown, map: (reply: Reply) => T): Promise<T> {
  try {
    const response = await http.post(url, body);
    return map({
      status: response.status,
      data: response.data,
      header(name) {
        const value = response.headers[name.toLowerCase()];
        if (Array.isArray(value)) return value[0];
        return typeof value === 'string' ? value : undefined;
      },
    });
  } catch {
    return { ok: false, code: 'network' } as T;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readSubmitError(reply: Reply): RsvpSubmitResult {
  const error = (reply.data as { error?: { code?: string; field?: string; reason?: string } } | null)?.error;
  const code = error?.code;
  const retryAfter = Number(reply.header('retry-after'));
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
