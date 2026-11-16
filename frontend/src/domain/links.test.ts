import { describe, expect, it } from 'vitest';
import { guestPath, parseLink, resolveGuestView } from '@/domain/links';
import type { InvitationRecord } from '@/domain/types';

const record: InvitationRecord = {
  invitation: {
    id: 'inv',
    slug: 'minjun',
    theme: 'ivory',
    groom: { name: '김민준', givenName: '민준' },
    bride: { name: '이서연', givenName: '서연' },
    ceremony: { date: '2027-05-15', venueName: '홀' },
    families: {},
    photos: [],
    accounts: [],
    rsvp: { deadline: '2027-05-14T14:59:00.000Z' },
  },
  sharedRsvpToken: 'share-token',
  recipients: [
    { token: 'jihun', name: '김지훈', revoked: false, response: null },
    { token: 'old', name: '이준', revoked: true, response: null },
  ],
};

describe('링크', () => {
  it('경로를 세 종류로 읽는다', () => {
    expect(parseLink(undefined)).toEqual({ type: 'shared-invitation' });
    expect(parseLink([])).toEqual({ type: 'shared-invitation' });
    expect(parseLink(['g', 'jihun'])).toEqual({ type: 'personal', token: 'jihun' });
    expect(parseLink(['s', 'share-token'])).toEqual({ type: 'shared-rsvp', token: 'share-token' });
    expect(parseLink(['x', 'jihun'])).toBeNull();
    expect(guestPath('minjun', { type: 'personal', token: 'a b' })).toBe('/i/minjun/g/a%20b/');
  });

  it('토큰이 다르면 없고, 폐기된 토큰은 이름 없는 응답으로 연다', () => {
    expect(resolveGuestView(record, { type: 'shared-rsvp', token: 'nope' })).toBeNull();
    expect(resolveGuestView(record, { type: 'personal', token: 'nope' })).toBeNull();
    expect(resolveGuestView(record, { type: 'personal', token: 'old' })).toEqual({
      kind: 'revoked-personal',
      token: 'old',
    });
    expect(resolveGuestView(record, { type: 'shared-invitation' })).toEqual({
      kind: 'shared-invitation',
      rsvp: 'notice',
    });
  });
});
