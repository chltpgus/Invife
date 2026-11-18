import type { EditorInvitation, EditorPhoto } from '@/editor/contract';

/** 헤더 `ETag` 의 따옴표·weak 표기를 벗긴다. 본문 `etag` 와 같은 비교에 쓴다. */
export function bareEtag(value: string): string {
  return value.replace(/^W\//, '').replace(/^"|"$/g, '').trim();
}

/** If-Match 로 보낼 값. 헤더의 따옴표와 본문 `etag` 둘 다 여기서만 푼다. */
export function readEtag(header: string | undefined, body: string | undefined): string | null {
  if (body) return bareEtag(body);
  if (!header) return null;
  return bareEtag(header) || null;
}

export function etagsMatch(stored: string, ifMatch: string): boolean {
  const left = bareEtag(stored);
  const right = bareEtag(ifMatch);
  return Boolean(left) && left === right;
}

/**
 * 다음에 쓸 If-Match. 변환이 etag 를 바꿔도, 바꾸지 않아도 이 함수만 거친다.
 * 새 값이 없으면 기존 etag 를 유지한다.
 */
export function nextEtag(current: string, incoming: string | null | undefined): string {
  if (!incoming) return current;
  const next = bareEtag(incoming);
  return next && next !== current ? next : current;
}

export function withEtag(invitation: EditorInvitation, etag: string | null | undefined): EditorInvitation {
  return { ...invitation, etag: nextEtag(invitation.etag, etag) };
}

export function withPhoto(invitation: EditorInvitation, photo: EditorPhoto, etag: string | null | undefined): EditorInvitation {
  const photos = invitation.photos.some((item) => item.id === photo.id)
    ? invitation.photos.map((item) => (item.id === photo.id ? photo : item))
    : [...invitation.photos, photo];
  return withEtag({ ...invitation, photos }, etag);
}

/**
 * 사용자가 고칠 수 있는 내용만으로 만든 지문. 서버 SHA-256 의 목이다.
 * 변환 상태·변종 URL·LQIP·updatedAt 은 빠지므로 변환이 끝나도 값이 같다.
 */
export function contentEtag(invitation: EditorInvitation): string {
  const photos = invitation.photos.map((photo) => ({
    id: photo.id,
    sort: photo.sort,
    focal: photo.focal,
    crop: photo.crop,
    filter: photo.filter,
  }));
  return fingerprint(JSON.stringify({
    id: invitation.id,
    theme: invitation.theme,
    photoFilter: invitation.photoFilter,
    groom: invitation.groom,
    bride: invitation.bride,
    ceremony: invitation.ceremony,
    greeting: invitation.greeting,
    families: invitation.families,
    transport: invitation.transport,
    accountsNote: invitation.accountsNote,
    accounts: invitation.accounts,
    photos,
    rsvp: invitation.rsvp,
  }));
}

export function stampUser(invitation: EditorInvitation, now: Date): EditorInvitation {
  return { ...invitation, updatedAt: now.toISOString(), etag: contentEtag(invitation) };
}

function fingerprint(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
