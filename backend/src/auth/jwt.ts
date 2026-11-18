import { jwtVerify } from 'jose';

export type AuthClaims = {
  sub: string;
  isAnonymous: boolean;
  admin: boolean;
};

export async function verifyAccessToken(token: string, secret: string): Promise<AuthClaims> {
  const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ['HS256'] });
  const sub = typeof payload.sub === 'string' ? payload.sub : '';
  if (!sub) throw new Error('missing sub');
  const appMeta = isRecord(payload.app_metadata) ? payload.app_metadata : {};
  return {
    sub,
    isAnonymous: payload.is_anonymous === true,
    admin: appMeta.role === 'admin',
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function bearer(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}
