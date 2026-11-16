import { describe, expect, it } from 'vitest';
import { guestPath, parseGuestPath } from '@/domain/links';

describe('링크', () => {
  it('슬러그 셸과 세 경로를 읽는다', () => {
    expect(guestPath('minjun')).toBe('/i/minjun/');
    expect(parseGuestPath('/i/minjun/', 'minjun')).toEqual({ channel: 'invite' });
    expect(parseGuestPath('/i/minjun/g/jihun/', 'minjun')).toEqual({ channel: 'personal', token: 'jihun' });
    expect(parseGuestPath('/i/minjun/s/open-rsvp', 'minjun')).toEqual({ channel: 'rsvp_link', token: 'open-rsvp' });
    expect(parseGuestPath('/i/minjun/g/', 'minjun')).toBeNull();
    expect(parseGuestPath('/i/minjun/x/jihun/', 'minjun')).toBeNull();
    expect(parseGuestPath('/i/other/', 'minjun')).toBeNull();
  });
});
