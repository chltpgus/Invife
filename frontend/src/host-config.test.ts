import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy } from '@/csp';

const policy = contentSecurityPolicy({ apiBaseUrl: '', r2BaseUrl: '' });

describe('호스트 설정', () => {
  it('Cloudflare 와 Vercel 이 같은 리라이트·헤더를 쓴다', () => {
    const headers = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');
    const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')) as {
      rewrites: { source: string; destination: string }[];
      headers: { source: string; headers: { key: string; value: string }[] }[];
    };
    const redirects = readFileSync(new URL('../public/_redirects', import.meta.url), 'utf8')
      .split('\n')
      .filter((line) => line.trim() && !line.startsWith('#'))
      .map((line) => line.trim().split(/\s+/));
    expect(redirects).toEqual(vercel.rewrites.map((rule) => [rule.source, rule.destination, '200']));
    expect(vercel.rewrites.map((rule) => rule.source)).toEqual([
      '/i/:slug/g/:token',
      '/i/:slug/g/:token/',
      '/i/:slug/s/:token',
      '/i/:slug/s/:token/',
    ]);
    const shared = vercel.headers[0]?.headers ?? [];
    expect(shared).toEqual([
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'Content-Security-Policy', value: policy },
    ]);
    expect(headers).toContain('Referrer-Policy: no-referrer');
    expect(headers).toContain(`Content-Security-Policy: ${policy}`);
    expect(policy).toContain('https://*.kakaocdn.net');
    expect(policy).not.toContain('t1.kakaocdn.net');
  });
});
