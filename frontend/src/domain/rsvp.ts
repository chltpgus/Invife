import type { RsvpNameMode } from '@/config';
import type { GuestView, RsvpResponse, RsvpSubmitResult } from '@/domain/types';

export const COMPANION_MIN = 0;
export const COMPANION_MAX = 10;

export type RsvpPhase =
  | {
      name: 'form';
      intent: 'create' | 'edit';
      banner: 'none' | 'error' | 'rate_limited';
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

export function requiresGuestName(view: GuestView, mode: RsvpNameMode): boolean {
  if (view.kind === 'shared-rsvp' || view.kind === 'revoked-personal') return true;
  if (view.kind === 'shared-invitation') return view.rsvp === 'inline-form';
  return mode === 'prefill-input';
}

export function showsPersonalName(view: GuestView, mode: RsvpNameMode): boolean {
  return view.kind === 'personal' && mode !== 'hidden';
}

export function validateGuestName(name: string, required: boolean): string | null {
  if (!required) return null;
  const trimmed = name.trim();
  if (!trimmed) return '이름을 입력해 주세요';
  if ([...trimmed].length > 20) return '이름은 20자까지 입력할 수 있어요';
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

export function summaryShowsName(view: GuestView, mode: RsvpNameMode): boolean {
  if (view.kind === 'personal') return mode !== 'hidden';
  if (view.kind === 'shared-invitation') return view.rsvp === 'inline-form';
  return view.kind === 'shared-rsvp' || view.kind === 'revoked-personal';
}

export function phaseAfterResult(result: RsvpSubmitResult, edited: boolean): RsvpPhase | null {
  if (result.ok) return { name: 'success', edited };
  if (result.code === 'closed') return { name: 'closed' };
  if (result.code === 'rate_limited') {
    return { name: 'form', intent: edited ? 'edit' : 'create', banner: 'rate_limited', submitting: false, nameError: null };
  }
  if (result.code === 'validation') {
    return {
      name: 'form',
      intent: edited ? 'edit' : 'create',
      banner: 'none',
      submitting: false,
      nameError: '이름을 입력해 주세요',
    };
  }
  return { name: 'form', intent: edited ? 'edit' : 'create', banner: 'error', submitting: false, nameError: null };
}

export function submitLabel(phase: RsvpPhase): string {
  if (phase.name !== 'form') return '참석 여부 전달하기';
  if (phase.submitting) return '보내는 중…';
  if (phase.banner === 'error' || phase.banner === 'rate_limited') return '다시 보내기';
  if (phase.intent === 'edit') return '수정 내용 전달하기';
  return '참석 여부 전달하기';
}

export function storageKeyFor(invitationId: string, view: GuestView): string {
  if (view.kind === 'personal') return `invife:rsvp:${invitationId}:personal:${view.token}`;
  if (view.kind === 'revoked-personal') return `invife:rsvp:${invitationId}:revoked:${view.token}`;
  if (view.kind === 'shared-rsvp') return `invife:rsvp:${invitationId}:shared:${view.token}`;
  if (view.rsvp === 'inline-form') return `invife:rsvp:${invitationId}:shared:${view.sharedRsvpToken}`;
  return `invife:rsvp:${invitationId}:shared-invitation`;
}

export function linkToken(view: GuestView): string | undefined {
  if (view.kind === 'personal' || view.kind === 'revoked-personal' || view.kind === 'shared-rsvp') return view.token;
  if (view.kind === 'shared-invitation' && view.rsvp === 'inline-form') return view.sharedRsvpToken;
  return undefined;
}
