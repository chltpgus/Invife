import { describe, expect, it } from 'vitest';
import { accountCopyValue, contactRows, parentLineText, sectionFlags } from '@/domain/visibility';
import type { Invitation } from '@/domain/types';

function invitation(patch: Partial<Invitation> = {}): Invitation {
  return {
    id: 'inv',
    slug: 'sample',
    theme: 'ivory',
    groom: { name: '김민준', givenName: '민준', phone: '010-1111-2222' },
    bride: { name: '이서연', givenName: '서연', phone: '010-3333-4444' },
    ceremony: { date: '2027-05-15', time: '13:00', venueName: '더채플앳청담', address: '서울' },
    families: {},
    photos: [],
    accounts: [],
    rsvp: { deadline: '2027-05-14T14:59:00.000Z' },
    ...patch,
  };
}

describe('빈 값과 고인', () => {
  it('부모가 없으면 혼주 줄을 만들지 않는다', () => {
    expect(parentLineText(undefined, '민준')).toBeNull();
    expect(sectionFlags(invitation()).parents).toBe(false);
    expect(sectionFlags(invitation()).gallery).toBe(false);
    expect(sectionFlags(invitation()).accounts).toBe(false);
  });

  it('고인 표기는 사람마다 다르고, 그 사람만 연락처에서 빠진다', () => {
    const page = invitation({
      families: {
        groom: {
          relation: '아들',
          father: { name: '김철수', phone: '010-0000-0001', deceased: true, deceasedStyle: 'hanja' },
          mother: { name: '박영희', phone: '010-0000-0002' },
        },
        bride: {
          relation: '딸',
          father: { name: '이정훈' },
          mother: { name: '최미경', phone: '010-0000-0003', deceased: true, deceasedStyle: 'hangul' },
        },
      },
    });
    expect(parentLineText(page.families.groom, '민준')).toBe('故 김철수 · 박영희 의 아들 민준');
    expect(parentLineText(page.families.bride, '서연')).toBe('이정훈 · 고 최미경 의 딸 서연');
    expect(contactRows(page).map((row) => row.id)).toEqual(['groom', 'groom-mother', 'bride']);
  });

  it('번호가 없는 사람은 연락 행을 만들지 않고, 그룹이 비면 빠진다', () => {
    const page = invitation({
      groom: { name: '김민준', givenName: '민준' },
      bride: { name: '이서연', givenName: '서연', phone: '010-3333-4444' },
    });
    expect(contactRows(page).map((row) => row.name)).toEqual(['이서연']);
  });

  it('계좌 복사 값에는 예금주를 넣지 않는다', () => {
    expect(
      accountCopyValue({ id: 'a', side: 'groom', relation: '신랑', holder: '김민준', bank: '우리', number: '1002-000-000000' }),
    ).toBe('우리 1002-000-000000');
  });

  it('교통·지도·주소는 있는 것만 남긴다', () => {
    expect(sectionFlags(invitation({ ceremony: { date: '2027-05-15', venueName: '홀' } })).map).toBe(false);
    expect(sectionFlags(invitation({ ceremony: { date: '2027-05-15', venueName: '' } })).directions).toBe(false);
    const withBus = invitation({ transport: { bus: '147' } });
    expect(sectionFlags(withBus).transport).toBe(true);
    expect(sectionFlags(invitation({ transport: { parking: '  ' } })).transport).toBe(false);
  });
});
