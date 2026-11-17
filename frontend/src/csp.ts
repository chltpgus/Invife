import { env } from '@/env';

/** 페이지 메타와 호스트 헤더가 같이 쓰는 CSP. API·R2 출처는 있을 때만 붙인다. */
export function contentSecurityPolicy(
  extra: { apiBaseUrl?: string; r2BaseUrl?: string } = { apiBaseUrl: env.apiBaseUrl, r2BaseUrl: env.r2BaseUrl },
): string {
  const connect = ["'self'", 'https://dapi.kakao.com', 'https://*.kakao.com', 'https://*.daumcdn.net', 'https://kauth.kakao.com', 'https://kapi.kakao.com'];
  const images = ["'self'", 'data:', 'blob:', 'https://*.daumcdn.net', 'https://*.kakaocdn.net', 'https://dapi.kakao.com'];
  for (const value of [extra.apiBaseUrl, extra.r2BaseUrl]) {
    if (!value) continue;
    try {
      const origin = new URL(value).origin;
      connect.push(origin);
      images.push(origin);
    } catch {
      /* 잘못된 URL 은 CSP 에 넣지 않는다 */
    }
  }
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
    "script-src 'self' 'unsafe-inline' https://dapi.kakao.com https://*.kakaocdn.net https://challenges.cloudflare.com",
    "style-src 'self' 'unsafe-inline'",
    `img-src ${images.join(' ')}`,
    `connect-src ${connect.join(' ')}`,
    "font-src 'self'",
    'frame-src https://challenges.cloudflare.com',
  ].join('; ');
}
