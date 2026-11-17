import { describe, expect, it } from 'vitest';
import { defaultRsvpDeadline } from '@/domain/dates';
import {
  autosaveDelay,
  clearDirtyClock,
  fieldIssues,
  formatPhone,
  issuesForPublishValidation,
  joinKst,
  makeDraft,
  markDirty,
  photoFileError,
  publishIssues,
  resetDeadline,
  setCeremonyDate,
  setCoupleName,
  setDeadline,
  takeWithinLimit,
  type NewDraftInput,
} from '@/domain/editor';

const now = new Date('2026-11-17T03:00:00.000Z');

function draft(partial: Partial<NewDraftInput> = {}) {
  return makeDraft({ theme: 'ivory', ...partial }, now, 'd1');
}

describe('초안 마감', () => {
  it('예식 날짜를 고르면 전날 23:59:59.999 KST 로 맞춘다', () => {
    const next = setCeremonyDate(draft(), '2027-05-15');
    expect(next.deadlineCustom).toBe(false);
    expect(next.invitation.rsvp.deadline).toBe(defaultRsvpDeadline('2027-05-15').toISOString());
    expect(joinKst('2027-05-14', '23:59')).toBe(defaultRsvpDeadline('2027-05-15').toISOString());
  });

  it('직접 고른 마감은 날짜를 바꿔도 유지하고, 프리셋은 다시 기본값이다', () => {
    const custom = setDeadline(setCeremonyDate(draft(), '2027-05-15'), '2027-05-10', '18:00');
    const moved = setCeremonyDate(custom, '2027-06-01');
    expect(moved.deadlineCustom).toBe(true);
    expect(moved.invitation.rsvp.deadline).toBe(custom.invitation.rsvp.deadline);
    const reset = resetDeadline(moved);
    expect(reset.deadlineCustom).toBe(false);
    expect(reset.invitation.rsvp.deadline).toBe(defaultRsvpDeadline('2027-06-01').toISOString());
  });

  it('마감을 비우는 경로는 없다', () => {
    const next = setCeremonyDate(draft({ ceremonyDate: '2027-05-15' }), '2027-05-20');
    expect(next.invitation.rsvp.deadline).not.toBe('');
  });
});

describe('발행 검증', () => {
  it('이름, 날짜, 시간, 예식장, 주소, 대표 사진이 없으면 발행 항목으로 보여 준다', () => {
    const messages = publishIssues(fieldIssues(draft(), now)).map((issue) => issue.message);
    expect(messages).toEqual([
      '신랑 이름을 입력해 주세요',
      '신부 이름을 입력해 주세요',
      '서명에 쓸 이름을 확인해 주세요',
      '서명에 쓸 이름을 확인해 주세요',
      '예식 날짜를 골라 주세요',
      '예식 시간을 골라 주세요',
      '예식장 이름을 입력해 주세요',
      '주소를 검색해 주세요',
      '대표 사진을 올려 주세요',
    ]);
  });

  it('지난 날짜, 긴 이름, 고인 표기 미선택, 마감 범위를 가른다', () => {
    let next = setCoupleName(draft({ ceremonyDate: '2020-01-01', ceremonyTime: '13:07' }), 'groom', '김');
    next = setCoupleName(next, 'bride', '이서연이름이가나다라마');
    next = {
      ...next,
      invitation: {
        ...next.invitation,
        ceremony: { ...next.invitation.ceremony, venueName: '더채플', address: '서울 강남구 도산대로 442' },
        photos: [{ id: 'p', width: 1000, height: 1000, focal: { x: 0.5, y: 0.4 }, src: { w800: 'a', w1200: 'a', w1600: 'a' }, lqip: 'a' }],
        families: {
          groom: { relation: '아들', father: { name: '김철수', deceased: true }, mother: { name: '', deceased: true } },
          bride: { relation: '딸', father: { name: '' }, mother: { name: '' } },
        },
      },
    };
    const messages = fieldIssues(next, now).map((issue) => issue.message);
    expect(messages).toContain('신랑 이름을 입력해 주세요');
    expect(messages).toContain('이름은 10자까지 입력할 수 있어요');
    expect(messages).toContain('오늘 이후 날짜를 골라 주세요');
    expect(messages).toContain('예식 시간은 10분 단위로 골라 주세요');
    expect(messages).toContain('신랑 아버지 고인 표기 방식을 골라 주세요');
    expect(messages.some((message) => message.includes('어머니'))).toBe(false);
    const mapped = issuesForPublishValidation(next.invitation, { reason: 'deceased_style' });
    expect(mapped.map((issue) => issue.id)).toEqual(['groom-father-style']);
  });

  it('마감은 지금보다 뒤이고 예식 시각보다 앞이어야 한다', () => {
    const ready = setCeremonyDate(draft({ ceremonyTime: '13:00' }), '2027-05-15');
    const early = setDeadline(ready, '2026-11-01', '10:00');
    expect(fieldIssues(early, now).some((issue) => issue.id === 'deadline')).toBe(true);
    const after = setDeadline(ready, '2027-05-15', '13:00');
    expect(fieldIssues(after, now).some((issue) => issue.message === '마감은 지금보다 뒤, 예식 시간보다 앞이어야 해요')).toBe(true);
    expect(fieldIssues(ready, now).some((issue) => issue.id === 'deadline')).toBe(false);
  });
});

describe('사진 한도', () => {
  it('10장을 넘기면 앞에서부터 남은 수만 받는다', () => {
    expect(takeWithinLimit(0, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])).toEqual({
      accepted: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      dropped: 2,
    });
    expect(takeWithinLimit(8, ['a', 'b', 'c', 'd', 'e'])).toEqual({ accepted: ['a', 'b'], dropped: 3 });
    expect(takeWithinLimit(10, ['a'])).toEqual({ accepted: [], dropped: 1 });
  });

  it('형식과 20MB 를 거른다', () => {
    expect(photoFileError({ type: 'image/gif', name: 'a.gif', size: 10 })).toMatch(/JPG/);
    expect(photoFileError({ type: '', name: 'a.HEIC', size: 10 })).toBeNull();
    expect(photoFileError({ type: 'image/jpeg', name: 'a.jpg', size: 20 * 1024 * 1024 + 1 })).toMatch(/20MB/);
  });
});

describe('자동 저장 시각', () => {
  it('마지막 입력 800ms 뒤, 그리고 첫 변경 후 최대 5초에 저장한다', () => {
    let clock = clearDirtyClock();
    expect(autosaveDelay(clock, 0)).toBeNull();
    clock = markDirty(clock, 0);
    expect(autosaveDelay(clock, 799)).toBe(1);
    expect(autosaveDelay(clock, 800)).toBe(0);
    clock = markDirty(clock, 4500);
    expect(autosaveDelay(clock, 4500)).toBe(500);
    expect(autosaveDelay(clock, 5000)).toBe(0);
  });
});

describe('전화번호', () => {
  it('휴대폰 번호에 하이픈을 넣는다', () => {
    expect(formatPhone('01012345678')).toBe('010-1234-5678');
    expect(formatPhone('010-12')).toBe('010-12');
  });
});
