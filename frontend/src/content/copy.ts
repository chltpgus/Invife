/**
 * 커버의 "The Wedding of" 와 404 의 "Invife" 만 스펙에 있는 영문 키커다.
 * 나머지 eyebrow 는 출시 전에 바꿀 임시 문구다.
 * TEMPORARY
 */
export const eyebrows = {
  cover: 'The Wedding of',
  greeting: 'A Note',
  parents: 'The Families',
  contact: 'Keep in Touch',
  date: 'The Day',
  gallery: 'Gallery',
  directions: 'Directions',
  accounts: 'With Thanks',
  rsvp: 'Kindly Reply',
  notFound: 'Invife',
} as const;

/** TEMPORARY — 공용 초대장 링크의 참석 안내. sharedInvitationRsvp 가 notice 일 때. */
export const sharedInvitationRsvpNote = '참석 여부는 따로 받은 응답 링크에서 답할 수 있어요.';
