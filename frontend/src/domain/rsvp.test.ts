import { describe, expect, it } from 'vitest';
import {
  canSubmitRsvp,
  companionsToSend,
  guestName,
  initialPhase,
  needsTurnstile,
  normalizeGuestName,
  phaseAfterResult,
  submitLabel,
  validateGuestName,
  validationCopy,
} from '@/domain/rsvp';
import type { RsvpResponse } from '@/domain/types';

const response: RsvpResponse = {
  id: 'r1',
  attending: true,
  companions: 2,
  name: '박하늘',
  updatedAt: '2027-04-01T00:00:00.000Z',
};

describe('RSVP 상태', () => {
  it('이름은 공백을 빼고 NFC 로 맞춘 뒤 1자에서 20코드 포인트', () => {
    expect(normalizeGuestName('  서연  ')).toBe('서연');
    expect(normalizeGuestName('가\u0300')).toBe('가\u0300'.normalize('NFC'));
    expect(validateGuestName('  ')).toBe('이름을 입력해 주세요');
    expect(validateGuestName('  서연  ')).toBeNull();
    expect(validateGuestName('가'.repeat(21))).toBe('이름은 20자까지 입력할 수 있어요');
  });

  it('400 은 필드에 따라 갈린다', () => {
    expect(validationCopy('name', 'required').nameError).toBe('이름을 입력해 주세요');
    expect(validationCopy('name', 'too_long').nameError).toBe('이름은 20자까지 입력할 수 있어요');
    expect(validationCopy('companions', 'not_zero')).toEqual({ nameError: null, banner: 'validation' });
    expect(validationCopy(undefined, undefined).nameError).toBeNull();
  });

  it('참석을 고르기 전에는 보낼 수 없고, 불참이면 동행은 0이다', () => {
    expect(canSubmitRsvp(null, false)).toBe(false);
    expect(canSubmitRsvp(true, true)).toBe(false);
    expect(companionsToSend(false, 4)).toBe(0);
    expect(companionsToSend(true, 11)).toBe(10);
  });

  it('Turnstile 은 개인 링크가 아니거나 폐기된 링크에만', () => {
    expect(needsTurnstile({ channel: 'personal', token: 't' }, false)).toBe(false);
    expect(needsTurnstile({ channel: 'personal', token: 't' }, true)).toBe(true);
    expect(needsTurnstile({ channel: 'invite' }, false)).toBe(true);
    expect(needsTurnstile({ channel: 'rsvp_link', token: 's' }, false)).toBe(true);
  });

  it('이미 있는 응답 이름이 미리 채운 이름보다 우선한다', () => {
    expect(guestName({ name: '박철수' }, '김지훈')).toBe('박철수');
    expect(guestName({ name: '  박철수  ' }, '김지훈')).toBe('박철수');
    expect(guestName({ name: '   ' }, '김지훈')).toBe('김지훈');
    expect(guestName(null, '김지훈')).toBe('김지훈');
  });

  it('재방문·마감·수정 성공·429·폐기', () => {
    expect(initialPhase(false, null).name).toBe('form');
    expect(initialPhase(false, response).name).toBe('success');
    expect(initialPhase(true, response).name).toBe('closed');
    expect(phaseAfterResult({ ok: true, response, edited: true }, true)).toEqual({ name: 'success', edited: true });
    const limited = phaseAfterResult({ ok: false, code: 'rate_limited', retryAfter: 30 }, true);
    expect(limited?.name === 'form' && limited.banner === 'rate_limited' && limited.retryAfter).toBe(30);
    expect(phaseAfterResult({ ok: false, code: 'revoked' }, false)).toMatchObject({ name: 'form', intent: 'create' });
    expect(phaseAfterResult({ ok: false, code: 'not_found' }, false)).toBeNull();
    expect(submitLabel({ name: 'form', intent: 'edit', banner: 'none', submitting: false, nameError: null })).toBe(
      '수정 내용 전달하기',
    );
  });
});
