export const toQueryString = (params: Record<string, unknown>): string => {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return `${encodeURIComponent(key)}=${value.map((item) => encodeURIComponent(String(item))).join(',')}`;
      }
      return `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`;
    })
    .join('&');
};

export const resolvePathParams = (url: string, params?: Record<string, string | number>): string => {
  if (!params) return url;
  return Object.entries(params).reduce((result, [key, value]) => result.replace(`{${key}}`, encodeURIComponent(String(value))), url);
};

export const readRetryAfter = (headers: { get?: (name: string) => unknown; [key: string]: unknown } | undefined): number | undefined => {
  if (!headers) return undefined;
  const raw = typeof headers.get === 'function' ? headers.get('retry-after') : headers['retry-after'] ?? headers['Retry-After'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const seconds = Number(value);
  return Number.isFinite(seconds) ? seconds : undefined;
};

export const headerValue = (headers: { get?: (name: string) => unknown; [key: string]: unknown } | undefined, name: string): string | undefined => {
  if (!headers) return undefined;
  const raw = typeof headers.get === 'function' ? headers.get(name) : headers[name.toLowerCase()] ?? headers[name];
  if (Array.isArray(raw)) return typeof raw[0] === 'string' ? raw[0] : undefined;
  return typeof raw === 'string' ? raw : undefined;
};
