import type { GuestLink, RsvpChannel, RsvpResponse, RsvpSubmitResult, StoredEdit } from '@/domain/types';

export const COMPANION_MIN = 0;
export const COMPANION_MAX = 10;

export type FormBanner = 'none' | 'error' | 'rate_limited' | 'unavailable' | 'edit_forbidden' | 'turnstile' | 'validation';

export type RsvpPhase =
  | {
      name: 'form';
      intent: 'create' | 'edit';
      banner: FormBanner;
      retryAfter?: number;
      submitting: boolean;
      nameError: string | null;
    }
  | { name: 'success'; edited: boolean }
  | { name: 'closed' };

export function initialPhase(closed: boolean, existing: RsvpResponse | null): RsvpPhase {
  if (closed) return { name: 'closed' };
  if (existing) return { name: 'success', edited: false };
  return { name: 'form', intent: 'create', banner: 'none', submitting: false, nameError: null };
}

export function normalizeGuestName(name: string): string {
  return name.trim().normalize('NFC');
}

/** 1–20 코드 포인트. 앞뒤 공백을 빼고 NFC 로 맞춘 뒤 센다. */
export function validateGuestName(name: string): string | null {
  const normalized = normalizeGuestName(name);
  const length = [...normalized].length;
  if (length < 1) return '이름을 입력해 주세요';
  if (length > 20) return '이름은 20자까지 입력할 수 있어요';
  return null;
}

export function canSubmitRsvp(attending: boolean | null, submitting: boolean): boolean {
  return attending !== null && !submitting;
}

export function companionsToSend(attending: boolean, companions: number): number {
  if (!attending) return 0;
  return Math.min(COMPANION_MAX, Math.max(COMPANION_MIN, companions));
}

export function responseSummary(response: Pick<RsvpResponse, 'attending' | 'companions' | 'name'>, showName: boolean): string {
  const core = response.attending ? `참석 · 동행 ${response.companions}명` : '불참';
  if (showName && response.name.trim()) return `${response.name.trim()} 님 · ${core}`;
  return core;
}

export function validationCopy(field: string | undefined, reason: string | undefined): { nameError: string | null; banner: FormBanner } {
  if (field === 'name') {
    if (reason === 'too_long') return { nameError: '이름은 20자까지 입력할 수 있어요', banner: 'none' };
    return { nameError: '이름을 입력해 주세요', banner: 'none' };
  }
  if (field === 'companions') return { nameError: null, banner: 'validation' };
  return { nameError: null, banner: 'validation' };
}

export function phaseAfterResult(result: RsvpSubmitResult, edited: boolean): RsvpPhase | null {
  if (result.ok) return { name: 'success', edited };
  if (result.code === 'closed') return { name: 'closed' };
  if (result.code === 'not_found') return null;
  const intent = edited ? 'edit' : 'create';
  if (result.code === 'validation') {
    const copy = validationCopy(result.field, result.reason);
    return { name: 'form', intent, banner: copy.banner, submitting: false, nameError: copy.nameError };
  }
  if (result.code === 'rate_limited') {
    return { name: 'form', intent, banner: 'rate_limited', retryAfter: result.retryAfter, submitting: false, nameError: null };
  }
  if (result.code === 'turnstile_failed') {
    return { name: 'form', intent, banner: 'turnstile', submitting: false, nameError: null };
  }
  if (result.code === 'edit_forbidden') {
    return { name: 'form', intent, banner: 'edit_forbidden', submitting: false, nameError: null };
  }
  if (result.code === 'unavailable') {
    return { name: 'form', intent, banner: 'unavailable', submitting: false, nameError: null };
  }
  if (result.code === 'revoked') {
    return { name: 'form', intent: 'create', banner: 'none', submitting: false, nameError: null };
  }
  return { name: 'form', intent, banner: 'error', submitting: false, nameError: null };
}

export function submitLabel(phase: RsvpPhase): string {
  if (phase.name !== 'form') return '참석 여부 전달하기';
  if (phase.submitting) return '보내는 중…';
  if (phase.banner === 'error' || phase.banner === 'rate_limited' || phase.banner === 'unavailable' || phase.banner === 'turnstile') {
    return '다시 보내기';
  }
  if (phase.intent === 'edit') return '수정 내용 전달하기';
  return '참석 여부 전달하기';
}

export function needsTurnstile(link: GuestLink, revoked: boolean): boolean {
  return revoked || link.channel !== 'personal';
}

export function editStorageKey(slug: string, channel: Extract<RsvpChannel, 'invite' | 'rsvp_link'>, token?: string): string {
  if (channel === 'invite') return `invife:rsvp:${slug}:invite`;
  return `invife:rsvp:${slug}:rsvp_link:${token ?? ''}`;
}

export function readStoredEdit(raw: string | null): StoredEdit | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredEdit;
    if (!parsed.responseId || !parsed.editKey || !parsed.response) return null;
    return parsed;
  } catch {
    return null;
  }
}
