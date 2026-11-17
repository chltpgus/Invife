import { describe, expect, it } from 'vitest';
import {
  deadlineCaption,
  defaultEndedAt,
  defaultRsvpDeadline,
  formatCoverWhen,
  formatKoreanTime,
  isDeadlineClosed,
  isEventEnded,
  weekdayIndex,
} from '@/domain/dates';
import type { Invitation } from '@/domain/types';

type Assert<T extends true> = T;
type DeadlineIsString = Invitation['rsvp']['deadline'] extends string
  ? null extends Invitation['rsvp']['deadline']
    ? false
    : true
  : false;
const deadlineIsRequired: Assert<DeadlineIsString> = true;
void deadlineIsRequired;

describe('예식 기준 시각', () => {
  it('RSVP 기본 마감은 예식 전날 23:59:59.999 KST', () => {
    expect(defaultRsvpDeadline('2027-05-15').toISOString()).toBe('2027-05-14T14:59:59.999Z');
    expect(defaultRsvpDeadline('2027-03-01').toISOString()).toBe('2027-02-28T14:59:59.999Z');
  });

  it('끝난 행사는 예식 다음 날 00:00 KST', () => {
    expect(defaultEndedAt('2027-05-15').toISOString()).toBe('2027-05-15T15:00:00.000Z');
    expect(defaultEndedAt('2027-12-31').toISOString()).toBe('2027-12-31T15:00:00.000Z');
  });

  it('마감 시각은 포함하고 그 직후부터 닫는다', () => {
    const deadline = '2027-05-14T14:59:59.999Z';
    expect(isDeadlineClosed(new Date(deadline), deadline)).toBe(false);
    expect(isDeadlineClosed(new Date('2027-05-14T15:00:00.000Z'), deadline)).toBe(true);
  });

  it('끝난 행사 시각이 되면 바로 전환한다', () => {
    const at = '2027-05-15T15:00:00.000Z';
    expect(isEventEnded(new Date('2027-05-15T14:59:59.999Z'), '2027-05-15', null)).toBe(false);
    expect(isEventEnded(new Date(at), '2027-05-15', null)).toBe(true);
    expect(isEventEnded(new Date('2020-01-01T00:00:00.000Z'), '2027-05-15', '2020-01-01T00:00:00.000Z')).toBe(true);
  });
});

describe('날짜 표기', () => {
  it('2027-05-15 는 토요일', () => {
    expect(weekdayIndex('2027-05-15')).toBe(6);
    expect(formatCoverWhen('2027-05-15', '13:00')).toBe('2027. 05. 15 SAT · 오후 1시');
    expect(formatCoverWhen('2027-05-15')).toBe('2027. 05. 15 SAT');
  });

  it('오전·오후와 분을 붙인다', () => {
    expect(formatKoreanTime('00:00')).toBe('오전 12시');
    expect(formatKoreanTime('09:30')).toBe('오전 9시 30분');
    expect(formatKoreanTime('12:00')).toBe('오후 12시');
  });

  it('마감 안내 문구', () => {
    expect(deadlineCaption('2027-05-14T14:59:59.999Z')).toBe('5월 14일(금)까지 수정할 수 있어요');
  });
});
