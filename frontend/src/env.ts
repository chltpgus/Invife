function trimSlash(value: string | undefined): string {
  return (value ?? '').replace(/\/$/, '');
}

export const env = {
  siteUrl: trimSlash(process.env.NEXT_PUBLIC_SITE_URL) || 'http://localhost:3000',
  apiBaseUrl: trimSlash(process.env.NEXT_PUBLIC_API_BASE_URL),
  r2BaseUrl: trimSlash(process.env.NEXT_PUBLIC_R2_BASE_URL),
  kakaoJavaScriptKey: process.env.NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY ?? '',
  /** 카카오 지도 JavaScript 키. REST 키(로그인 client_id)는 쓰지 않는다. */
  kakaoMapKey: process.env.NEXT_PUBLIC_KAKAO_MAP_KEY ?? '',
  turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '',
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  dataSource: process.env.NEXT_PUBLIC_DATA_SOURCE === 'api' ? 'api' : 'fixture',
} as const;

export function absoluteUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${env.siteUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

/** 사진 src 는 R2 상대 키다. 베이스가 없으면 사이트의 `/` 아래로 붙인다. */
export function resolveAssetUrl(url: string): string {
  if (!url || url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://')) return url;
  const key = url.replace(/^\//, '');
  if (env.r2BaseUrl) return `${env.r2BaseUrl}/${key}`;
  return `/${key}`;
}
