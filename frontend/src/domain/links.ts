import type { GuestLink } from '@/domain/types';

export function guestPath(slug: string): string {
  return `/i/${slug}/`;
}

/** 브라우저 주소에서 링크 종류를 읽는다. 토큰은 HTML 에 없고 이 경로에만 있다. */
export function parseGuestPath(pathname: string, slug: string): GuestLink | null {
  const path = decodeURI(pathname).replace(/\/+$/, '') || '/';
  const base = `/i/${slug}`;
  if (path === base) return { channel: 'invite' };
  if (!path.startsWith(`${base}/`)) return null;
  const parts = path.slice(base.length + 1).split('/');
  if (parts.length !== 2 || !parts[1]) return null;
  const [kind, token] = parts;
  if (kind === 'g') return { channel: 'personal', token };
  if (kind === 's') return { channel: 'rsvp_link', token };
  return null;
}
