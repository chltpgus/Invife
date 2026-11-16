import { describe, expect, it } from 'vitest';
import { siteConfig } from '@/config';
import {
  canSubmitRsvp,
  companionsToSend,
  initialPhase,
  phaseAfterResult,
  requiresGuestName,
  responseSummary,
  submitLabel,
  validateGuestName,
} from '@/domain/rsvp';
import type { GuestView, RsvpResponse } from '@/domain/types';

const response: RsvpResponse = {
  id: 'r1',
  attending: true,
  companions: 2,
  name: '박하늘',
  updatedAt: '2027-04-01T00:00:00.000Z',
};

describe('RSVP 상태', () => {
  it('기본 이름 모드는 받는 사람 링크의 미리 채우기다', () => {
    expect(siteConfig.rsvpNameMode).toBe('prefill-input');
  });

  it('링크 종류에 따라 이름 입력이 갈린다', () => {
    const personal: GuestView = { kind: 'personal', token: 't', name: '김지훈', response: null };
    const shared: GuestView = { kind: 'shared-rsvp', token: 's' };
    const notice: GuestView = { kind: 'shared-invitation', rsvp: 'notice' };
    expect(requiresGuestName(personal, 'prefill-input')).toBe(true);
    expect(requiresGuestName(personal, 'hidden')).toBe(false);
    expect(requiresGuestName(personal, 'show-name')).toBe(false);
    expect(requiresGuestName(shared, 'hidden')).toBe(true);
    expect(requiresGuestName(notice, 'prefill-input')).toBe(false);
    expect(requiresGuestName({ kind: 'revoked-personal', token: 't' }, 'prefill-input')).toBe(true);
  });

  it('이름은 앞뒤 공백을 빼고 1자에서 20자', () => {
    expect(validateGuestName('  ', true)).toBe('이름을 입력해 주세요');
    expect(validateGuestName('  서연  ', true)).toBeNull();
    expect(validateGuestName('가'.repeat(21), true)).toBe('이름은 20자까지 입력할 수 있어요');
    expect(validateGuestName('', false)).toBeNull();
  });

  it('참석을 고르기 전에는 보낼 수 없고, 불참이면 동행은 0이다', () => {
    expect(canSubmitRsvp(null, false)).toBe(false);
    expect(canSubmitRsvp(true, true)).toBe(false);
    expect(companionsToSend(false, 4)).toBe(0);
    expect(companionsToSend(true, 11)).toBe(10);
  });

  it('재방문·마감·수정 성공·429', () => {
    expect(initialPhase(false, null).name).toBe('form');
    expect(initialPhase(false, response).name).toBe('success');
    expect(initialPhase(true, response).name).toBe('closed');
    expect(phaseAfterResult({ ok: true, response, edited: true }, true)).toEqual({ name: 'success', edited: true });
    expect(phaseAfterResult({ ok: false, code: 'rate_limited' }, false)?.name).toBe('form');
    const limited = phaseAfterResult({ ok: false, code: 'rate_limited' }, true);
    expect(limited?.name === 'form' && limited.banner).toBe('rate_limited');
    expect(submitLabel({ name: 'form', intent: 'edit', banner: 'none', submitting: false, nameError: null })).toBe(
      '수정 내용 전달하기',
    );
  });

  it('요약 문구', () => {
    expect(responseSummary(response, true)).toBe('박하늘 님 · 참석 · 동행 2명');
    expect(responseSummary({ ...response, attending: false, companions: 0 }, false)).toBe('불참');
  });
});
