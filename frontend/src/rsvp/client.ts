import type { FixtureRsvpMode, RsvpResponse, RsvpSubmitBody, RsvpSubmitResult } from '@/domain/types';

export interface RsvpClient {
  submit(body: RsvpSubmitBody): Promise<RsvpSubmitResult>;
  /** API 가 없을 때 이 기기에 남겨 둔 응답. API 클라이언트는 항상 null 이고, 응답은 페이지 데이터에 있다. */
  read(storageKey: string): Promise<RsvpResponse | null>;
  remember(storageKey: string, response: RsvpResponse): void;
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

export function createFixtureRsvpClient(mode: FixtureRsvpMode, store: MemoryStore): RsvpClient {
  return {
    async read(storageKey) {
      const raw = store.get(storageKey);
      if (!raw) return null;
      return JSON.parse(raw) as RsvpResponse;
    },
    remember(storageKey, response) {
      store.set(storageKey, JSON.stringify(response));
    },
    async submit(body) {
      if (mode === 'rate_limited') return { ok: false, code: 'rate_limited' };
      if (mode === 'error') return { ok: false, code: 'network' };
      const name = body.name?.trim() ?? '';
      if ((body.linkType === 'shared-rsvp' || body.linkType === 'revoked-personal' || body.linkType === 'shared-invitation') && !name) {
        return { ok: false, code: 'validation' };
      }
      const response: RsvpResponse = {
        id: body.responseId ?? `local-${body.slug}-${body.token ?? 'open'}`,
        attending: body.attending,
        companions: body.companions,
        name,
        updatedAt: new Date().toISOString(),
      };
      return { ok: true, response, edited: Boolean(body.responseId) };
    },
  };
}

export function createApiRsvpClient(baseUrl: string): RsvpClient {
  return {
    remember() {},
    async read() {
      return null;
    },
    async submit(body) {
      try {
        const response = await fetch(`${baseUrl}/v1/invitations/${encodeURIComponent(body.slug)}/rsvp`, {
          method: body.responseId ? 'PATCH' : 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (response.status === 429) return { ok: false, code: 'rate_limited' };
        if (response.status === 403) return { ok: false, code: 'revoked' };
        if (response.status === 409) return { ok: false, code: 'closed' };
        if (response.status === 400) return { ok: false, code: 'validation' };
        if (!response.ok) return { ok: false, code: 'network' };
        const payload = (await response.json()) as { response: RsvpResponse; edited?: boolean };
        return { ok: true, response: payload.response, edited: Boolean(payload.edited ?? body.responseId) };
      } catch {
        return { ok: false, code: 'network' };
      }
    },
  };
}
