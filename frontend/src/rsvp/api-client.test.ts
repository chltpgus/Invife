import axios from 'axios';
import { describe, expect, it } from 'vitest';
import { createApiRsvpClient } from '@/rsvp/client';

function httpWith(status: number, data: unknown, headers: Record<string, string> = {}) {
  const http = axios.create({ validateStatus: () => true });
  http.defaults.adapter = async (config) => ({ data, status, statusText: String(status), headers, config });
  return http;
}

const body = {
  slug: 'minjun-seoyeon',
  channel: 'invite' as const,
  name: '박하늘',
  attending: true,
  companions: 0,
};

describe('RSVP API 오류 코드', () => {
  it('403 turnstile_failed 는 이름 오류가 아니다', async () => {
    const client = createApiRsvpClient('https://api.example', httpWith(403, { error: { code: 'turnstile_failed' } }));
    await expect(client.submit({ ...body, turnstileToken: 'bad' })).resolves.toEqual({ ok: false, code: 'turnstile_failed' });
  });

  it('429 는 Retry-After 를 보존한다', async () => {
    const client = createApiRsvpClient(
      'https://api.example',
      httpWith(429, { error: { code: 'rate_limited' } }, { 'retry-after': '12' }),
    );
    await expect(client.submit(body)).resolves.toEqual({ ok: false, code: 'rate_limited', retryAfter: 12 });
  });
});
