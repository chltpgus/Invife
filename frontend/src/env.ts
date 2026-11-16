function trimSlash(value: string | undefined): string {
  return (value ?? '').replace(/\/$/, '');
}

export const env = {
  siteUrl: trimSlash(process.env.NEXT_PUBLIC_SITE_URL) || 'http://localhost:3000',
  apiBaseUrl: trimSlash(process.env.NEXT_PUBLIC_API_BASE_URL),
  r2BaseUrl: trimSlash(process.env.NEXT_PUBLIC_R2_BASE_URL),
  kakaoJavaScriptKey: process.env.NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY ?? '',
  kakaoRestApiKey: process.env.NEXT_PUBLIC_KAKAO_REST_API_KEY ?? '',
  turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '',
  dataSource: process.env.NEXT_PUBLIC_DATA_SOURCE === 'api' ? 'api' : 'fixture',
} as const;

export function absoluteUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${env.siteUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

/** R2 에 상대 경로로 저장된 사진만 베이스를 붙인다. 샘플의 `/samples/...` 는 그대로 둔다. */
export function resolveAssetUrl(url: string): string {
  if (!url || url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/')) {
    return url;
  }
  if (!env.r2BaseUrl) return url;
  return `${env.r2BaseUrl}/${url.replace(/^\//, '')}`;
}
