import { defaultRsvpDeadline, pad2 } from '@/domain/dates';
import type { Account, Invitation, Parent, Photo, Side, ThemeId } from '@/domain/types';

export const PHOTO_LIMIT = 10;
export const PHOTO_MAX_BYTES = 20 * 1024 * 1024;
export const GREETING_MAX = 300;
export const NAME_MAX = 10;
export const AUTOSAVE_DEBOUNCE_MS = 800;
export const AUTOSAVE_MAX_WAIT_MS = 5000;
export const PREVIEW_DEBOUNCE_MS = 300;
export const DEFAULT_FOCAL = { x: 0.5, y: 0.4 };
export const FULL_CROP = { x: 0, y: 0, width: 1, height: 1 };

export type PhotoCrop = { x: number; y: number; width: number; height: number };

export const PHOTO_EXTENSION = /\.(jpe?g|png|heic|heif|webp)$/i;

export type PhotoTone = 'original' | 'warm' | 'mono';

export type SectionId =
  | 'cover'
  | 'greeting'
  | 'families'
  | 'contact'
  | 'when'
  | 'gallery'
  | 'directions'
  | 'accounts'
  | 'rsvp';

export type EditorDraft = {
  invitation: Invitation;
  photoTone: PhotoTone;
  /** 사진마다의 크롭·필터. 없으면 전체 크롭과 photoTone. */
  photoAdjust: Record<string, { crop: PhotoCrop; filter: PhotoTone }>;
  /** 서버(또는 로컬 저장소)가 준 시각. ISO. */
  updatedAt: string;
  /** 제작자가 마감을 직접 골랐으면 true. 아니면 예식 전날 23:59 KST. */
  deadlineCustom: boolean;
};

export type NewDraftInput = {
  theme: ThemeId;
  groomName?: string;
  brideName?: string;
  ceremonyDate?: string;
  ceremonyTime?: string;
};

export type FieldIssue = {
  id: string;
  section: SectionId;
  message: string;
  /** 발행 체크리스트에 올라가는 필수 누락 */
  publish: boolean;
};

export type SectionMark = 'complete' | 'required' | 'error' | 'empty';

export type AutosaveClock = { firstDirtyAt: number | null; lastChangeAt: number | null };

const PHOTO_MIME = new Set(['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp']);

export function kstToday(now: Date): string {
  const shifted = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`;
}

export function splitKst(iso: string): { date: string; time: string } | null {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return null;
  const shifted = new Date(time + 9 * 60 * 60 * 1000);
  return {
    date: `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`,
    time: `${pad2(shifted.getUTCHours())}:${pad2(shifted.getUTCMinutes())}`,
  };
}

/** 23:59 는 그 분의 마지막 밀리초까지. 그 외는 정각. 날짜나 시간이 비면 null. */
export function joinKst(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const seconds = time === '23:59' ? '59.999' : '00';
  const parsed = new Date(`${date}T${time}:${seconds}+09:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export function givenNameFromFull(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length <= 1) return trimmed;
  return trimmed.slice(1);
}

export function makeDraft(input: NewDraftInput, now: Date, id: string): EditorDraft {
  const groomName = input.groomName?.trim() ?? '';
  const brideName = input.brideName?.trim() ?? '';
  const date = input.ceremonyDate?.trim() ?? '';
  const time = input.ceremonyTime?.trim() ?? '';
  const invitation: Invitation = {
    id,
    slug: id,
    theme: input.theme,
    groom: { name: groomName, givenName: '' },
    bride: { name: brideName, givenName: '' },
    ceremony: {
      date,
      time: time || undefined,
      venueName: '',
    },
    families: {
      groom: { relation: '아들', father: { name: '' }, mother: { name: '' } },
      bride: { relation: '딸', father: { name: '' }, mother: { name: '' } },
    },
    photos: [],
    accounts: [],
    rsvp: { deadline: validDate(date) ? defaultRsvpDeadline(date).toISOString() : '' },
  };
  return { invitation, photoTone: 'original', photoAdjust: {}, updatedAt: now.toISOString(), deadlineCustom: false };
}

export function setCoupleName(draft: EditorDraft, side: 'groom' | 'bride', name: string): EditorDraft {
  const current = draft.invitation[side];
  return {
    ...draft,
    invitation: { ...draft.invitation, [side]: { ...current, name } },
  };
}

export function setCeremonyDate(draft: EditorDraft, date: string): EditorDraft {
  const invitation: Invitation = {
    ...draft.invitation,
    ceremony: { ...draft.invitation.ceremony, date },
  };
  if (!draft.deadlineCustom && validDate(date)) {
    invitation.rsvp = { deadline: defaultRsvpDeadline(date).toISOString() };
  }
  return { ...draft, invitation };
}

export function setDeadline(draft: EditorDraft, date: string, time: string): EditorDraft {
  const deadline = joinKst(date, time);
  if (!deadline) return draft;
  return {
    ...draft,
    deadlineCustom: true,
    invitation: { ...draft.invitation, rsvp: { deadline } },
  };
}

export function resetDeadline(draft: EditorDraft): EditorDraft {
  const date = draft.invitation.ceremony.date;
  if (!validDate(date)) return draft;
  return {
    ...draft,
    deadlineCustom: false,
    invitation: { ...draft.invitation, rsvp: { deadline: defaultRsvpDeadline(date).toISOString() } },
  };
}

export function formatPhone(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 11);
  if (digits.startsWith('02')) {
    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
    if (digits.length <= 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
    return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}`;
  }
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

export function isPhotoFile(file: { type: string; name: string }): boolean {
  return PHOTO_MIME.has(file.type) || PHOTO_EXTENSION.test(file.name);
}

export function photoFileError(file: { type: string; name: string; size: number }): string | null {
  if (!isPhotoFile(file)) return 'JPG, PNG, HEIC, WebP 사진만 올릴 수 있어요';
  if (file.size > PHOTO_MAX_BYTES) return '20MB보다 큰 사진은 올릴 수 있어요';
  return null;
}

export function takeWithinLimit<T>(existing: number, incoming: T[], limit = PHOTO_LIMIT): { accepted: T[]; dropped: number } {
  const room = Math.max(0, limit - existing);
  const accepted = incoming.slice(0, room);
  return { accepted, dropped: incoming.length - accepted.length };
}

export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const next = items.slice();
  const [item] = next.splice(from, 1);
  if (!item) return items;
  next.splice(to, 0, item);
  return next;
}

export function clampFocal(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function previewInvitation(draft: EditorDraft): Invitation {
  const source = draft.invitation;
  const transport = source.transport;
  const cleaned = transport
    ? {
        parking: blankToUndefined(transport.parking),
        subway: blankToUndefined(transport.subway),
        bus: blankToUndefined(transport.bus),
        other: blankToUndefined(transport.other),
      }
    : undefined;
  const accounts = source.accounts.filter((account) => account.holder.trim() && account.bank.trim() && account.number.trim());
  return {
    ...source,
    groom: cleanPerson(source.groom),
    bride: cleanPerson(source.bride),
    ceremony: {
      ...source.ceremony,
      venueName: source.ceremony.venueName.trim(),
      hall: blankToUndefined(source.ceremony.hall),
      time: source.ceremony.time?.trim() || undefined,
      address: guestAddress(source.ceremony.address),
    },
    greeting: source.greeting?.trim() ? source.greeting : undefined,
    accounts,
    accountsNote: blankToUndefined(source.accountsNote),
    transport: cleaned && Object.values(cleaned).some(Boolean) ? cleaned : undefined,
    photos: source.photos.slice(0, PHOTO_LIMIT),
  };
}

export function splitAddress(address: string | undefined): { road: string; detail: string } {
  if (!address) return { road: '', detail: '' };
  const [road, ...rest] = address.split('\n');
  return { road: road ?? '', detail: rest.join('\n').trim() };
}

export function joinAddress(road: string, detail: string): string | undefined {
  const line = [road.trim(), detail.trim()].filter(Boolean).join('\n');
  return line || undefined;
}

export function fieldIssues(draft: EditorDraft, now: Date): FieldIssue[] {
  const invitation = draft.invitation;
  const issues: FieldIssue[] = [];
  pushName(issues, 'groom-name', invitation.groom.name, '신랑 이름을 입력해 주세요');
  pushName(issues, 'bride-name', invitation.bride.name, '신부 이름을 입력해 주세요');
  if (!invitation.groom.givenName.trim()) {
    issues.push({ id: 'groom.givenName', section: 'cover', message: '서명에 쓸 이름을 확인해 주세요', publish: true });
  }
  if (!invitation.bride.givenName.trim()) {
    issues.push({ id: 'bride.givenName', section: 'cover', message: '서명에 쓸 이름을 확인해 주세요', publish: true });
  }
  const dateMessage = dateIssue(invitation.ceremony.date, now);
  if (dateMessage) issues.push({ id: 'ceremony-date', section: 'cover', message: dateMessage, publish: true });
  const timeMessage = timeIssue(invitation.ceremony.time);
  if (timeMessage) issues.push({ id: 'ceremony-time', section: 'cover', message: timeMessage, publish: true });
  const venue = invitation.ceremony.venueName.trim();
  if (venue.length < 2) issues.push({ id: 'venue', section: 'cover', message: '예식장 이름을 입력해 주세요', publish: true });
  else if (venue.length > 30) issues.push({ id: 'venue', section: 'cover', message: '예식장 이름은 30자까지 입력할 수 있어요', publish: true });
  const hall = invitation.ceremony.hall?.trim() ?? '';
  if (hall.length > 20) issues.push({ id: 'hall', section: 'cover', message: '홀 이름은 20자까지 입력할 수 있어요', publish: false });
  const address = splitAddress(invitation.ceremony.address);
  if (!address.road.trim()) issues.push({ id: 'address', section: 'directions', message: '주소를 검색해 주세요', publish: true });
  if (address.detail.length > 40) issues.push({ id: 'address-detail', section: 'directions', message: '상세 주소는 40자까지 입력할 수 있어요', publish: false });
  if (invitation.photos.length === 0) issues.push({ id: 'cover-photo', section: 'gallery', message: '대표 사진을 올려 주세요', publish: true });
  if ((invitation.greeting ?? '').length > GREETING_MAX) {
    issues.push({ id: 'greeting', section: 'greeting', message: '인사말은 300자까지 쓸 수 있어요', publish: false });
  }
  issues.push(...deceasedIssues(invitation));
  issues.push(...phoneIssues(invitation));
  issues.push(...transportIssues(invitation));
  issues.push(...accountIssues(invitation.accounts));
  const deadlineMessage = deadlineIssue(invitation.rsvp.deadline, invitation.ceremony.date, invitation.ceremony.time, now);
  if (deadlineMessage) issues.push({ id: 'deadline', section: 'rsvp', message: deadlineMessage, publish: true });
  return issues;
}

export function publishIssues(issues: FieldIssue[]): FieldIssue[] {
  return issues.filter((issue) => issue.publish);
}

export function sectionMark(section: SectionId, issues: FieldIssue[], draft: EditorDraft): SectionMark {
  const mine = issues.filter((issue) => issue.section === section || (section === 'cover' && issue.id === 'cover-photo'));
  if (mine.some((issue) => !issue.publish)) return 'error';
  if (section === 'cover' && (mine.some((issue) => issue.publish) || draft.invitation.photos.length === 0)) return 'required';
  if (mine.some((issue) => issue.publish)) return 'required';
  if (section === 'greeting' && !draft.invitation.greeting?.trim()) return 'empty';
  if (section === 'families' && !hasParentName(draft)) return 'empty';
  if (section === 'contact' && !hasPhone(draft)) return 'empty';
  if (section === 'accounts' && !draft.invitation.accounts.some((account) => account.holder.trim() || account.bank.trim() || account.number.trim())) {
    return 'empty';
  }
  if (section === 'gallery' && draft.invitation.photos.length === 0) return 'required';
  if (section === 'directions') {
    const transport = draft.invitation.transport;
    const extra = [transport?.parking, transport?.subway, transport?.bus, transport?.other].some((item) => item?.trim());
    if (!draft.invitation.ceremony.address?.trim() && !extra && !draft.invitation.ceremony.venueName.trim()) return 'required';
  }
  return 'complete';
}

export function markDirty(clock: AutosaveClock, now: number): AutosaveClock {
  return { firstDirtyAt: clock.firstDirtyAt ?? now, lastChangeAt: now };
}

export function clearDirtyClock(): AutosaveClock {
  return { firstDirtyAt: null, lastChangeAt: null };
}

/** 다음 저장까지 밀리초. 0 이면 지금 저장. 변경이 없으면 null. */
export function autosaveDelay(
  clock: AutosaveClock,
  now: number,
  debounce = AUTOSAVE_DEBOUNCE_MS,
  maxWait = AUTOSAVE_MAX_WAIT_MS,
): number | null {
  if (clock.firstDirtyAt === null || clock.lastChangeAt === null) return null;
  const maxLeft = maxWait - (now - clock.firstDirtyAt);
  const debounceLeft = debounce - (now - clock.lastChangeAt);
  if (maxLeft <= 0 || debounceLeft <= 0) return 0;
  return Math.min(maxLeft, debounceLeft);
}

function guestAddress(address: string | undefined): string | undefined {
  const parts = splitAddress(address);
  const line = [parts.road.trim(), parts.detail.trim()].filter(Boolean).join(' ');
  return line || undefined;
}

function validDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

function pushName(issues: FieldIssue[], id: string, value: string, emptyMessage: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length < 2) {
    issues.push({ id, section: 'cover', message: emptyMessage, publish: true });
    return;
  }
  if (trimmed.length > NAME_MAX) {
    issues.push({ id, section: 'cover', message: '이름은 10자까지 입력할 수 있어요', publish: true });
  }
}

function dateIssue(date: string, now: Date): string | null {
  if (!validDate(date)) return '예식 날짜를 골라 주세요';
  if (date < kstToday(now)) return '오늘 이후 날짜를 골라 주세요';
  return null;
}

function timeIssue(time: string | undefined): string | null {
  if (!time) return '예식 시간을 골라 주세요';
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return '예식 시간을 골라 주세요';
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59 || minute % 10 !== 0) return '예식 시간은 10분 단위로 골라 주세요';
  return null;
}

function deadlineIssue(deadline: string, date: string, time: string | undefined, now: Date): string | null {
  if (!deadline) return null;
  const at = new Date(deadline).getTime();
  if (Number.isNaN(at) || at <= now.getTime()) return '마감은 지금보다 뒤, 예식 시간보다 앞이어야 해요';
  if (validDate(date) && time) {
    const ceremony = new Date(`${date}T${time}:00+09:00`).getTime();
    if (!Number.isNaN(ceremony) && at >= ceremony) return '마감은 지금보다 뒤, 예식 시간보다 앞이어야 해요';
  }
  return null;
}

function deceasedIssues(invitation: Invitation): FieldIssue[] {
  const issues: FieldIssue[] = [];
  const sides: Array<['groom' | 'bride', string]> = [
    ['groom', '신랑'],
    ['bride', '신부'],
  ];
  for (const [side, label] of sides) {
    const family = invitation.families[side];
    for (const [slot, slotLabel] of [
      ['father', '아버지'],
      ['mother', '어머니'],
    ] as const) {
      const parent = family?.[slot];
      if (!parent?.deceased || !parent.name.trim()) continue;
      if (parent.deceasedStyle !== 'hanja' && parent.deceasedStyle !== 'hangul') {
        issues.push({
          id: `${side}-${slot}-style`,
          section: 'families',
          message: `${label} ${slotLabel} 고인 표기 방식을 골라 주세요`,
          publish: true,
        });
      }
    }
  }
  return issues;
}

/** 발행 400. `deceased_style` 은 필드 경로가 없어서, 이름 있는 고인만 그 사람의 표기 칸으로 붙인다. */
export function issuesForPublishValidation(invitation: Invitation, error: { field?: string; reason?: string }): FieldIssue[] {
  if (error.reason === 'deceased_style') return deceasedIssues(invitation);
  if (!error.field) return [];
  const section = error.field.startsWith('families.') || error.field.includes('-style') ? 'families' : error.field.startsWith('accounts') ? 'accounts' : error.field.includes('phone') ? 'contact' : 'cover';
  return [{ id: error.field, section, message: '입력한 내용을 다시 확인해 주세요', publish: true }];
}

function phoneIssues(invitation: Invitation): FieldIssue[] {
  const issues: FieldIssue[] = [];
  const rows: Array<[string, string | undefined]> = [
    ['groom.phone', invitation.groom.phone],
    ['bride.phone', invitation.bride.phone],
    ['families.groom.father.phone', invitation.families.groom?.father?.phone],
    ['families.groom.mother.phone', invitation.families.groom?.mother?.phone],
    ['families.bride.father.phone', invitation.families.bride?.father?.phone],
    ['families.bride.mother.phone', invitation.families.bride?.mother?.phone],
  ];
  for (const [id, phone] of rows) {
    if (phoneError(phone)) {
      issues.push({ id, section: 'contact', message: '전화번호를 다시 확인해 주세요', publish: true });
    }
  }
  return issues;
}

function phoneError(value: string | undefined): boolean {
  const digits = (value ?? '').replace(/\D/g, '');
  if (!digits) return false;
  return digits.length < 8 || digits.length > 15;
}

function transportIssues(invitation: Invitation): FieldIssue[] {
  const transport = invitation.transport;
  if (!transport) return [];
  const issues: FieldIssue[] = [];
  for (const key of ['parking', 'subway', 'bus', 'other'] as const) {
    if ((transport[key] ?? '').length > 100) {
      issues.push({ id: key, section: 'directions', message: '100자까지 입력할 수 있어요', publish: false });
    }
  }
  return issues;
}

function accountIssues(accounts: Account[]): FieldIssue[] {
  const issues: FieldIssue[] = [];
  const counts: Record<Side, number> = { groom: 0, bride: 0 };
  for (const account of accounts) {
    counts[account.side] += 1;
    const holder = account.holder.trim();
    const bank = account.bank.trim();
    const number = account.number.trim();
    if (!holder && !bank && !number) continue;
    if (!holder || !bank || !number || !accountNumberReady(number)) {
      issues.push({ id: `accounts.${account.id}.number`, section: 'accounts', message: '은행, 계좌번호, 예금주를 모두 입력해 주세요', publish: true });
      continue;
    }
    if (holder.length < 2 || holder.length > 20) {
      issues.push({ id: `accounts.${account.id}.holder`, section: 'accounts', message: '예금주는 2자에서 20자까지 입력해 주세요', publish: true });
    }
    if (!accountNumberReady(number)) {
      issues.push({ id: `accounts.${account.id}.number`, section: 'accounts', message: '계좌번호는 숫자와 - 만 입력할 수 있어요', publish: true });
    }
  }
  if (counts.groom > 3 || counts.bride > 3) {
    issues.push({ id: 'accounts', section: 'accounts', message: '한쪽에 계좌는 3개까지 넣을 수 있어요', publish: true });
  }
  return issues;
}

function accountNumberReady(value: string): boolean {
  if (!/^[0-9-]+$/.test(value)) return false;
  const digits = value.replace(/-/g, '').length;
  return digits >= 8 && digits <= 20;
}

function hasParentName(draft: EditorDraft): boolean {
  const families = draft.invitation.families;
  return [families.groom?.father, families.groom?.mother, families.bride?.father, families.bride?.mother].some((parent) => parent?.name.trim());
}

function hasPhone(draft: EditorDraft): boolean {
  const invitation = draft.invitation;
  return [invitation.groom.phone, invitation.bride.phone, invitation.families.groom?.father?.phone, invitation.families.groom?.mother?.phone, invitation.families.bride?.father?.phone, invitation.families.bride?.mother?.phone].some(
    (phone) => phone?.replace(/\D/g, ''),
  );
}

function cleanPerson(person: Invitation['groom']): Invitation['groom'] {
  return { name: person.name.trim(), givenName: person.givenName.trim(), phone: blankToUndefined(person.phone) };
}

function blankToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function parentOf(invitation: Invitation, side: Side, slot: 'father' | 'mother'): Parent {
  return invitation.families[side]?.[slot] ?? { name: '' };
}

export function lowQuality(photo: Photo): boolean {
  return Math.min(photo.width, photo.height) < 800;
}
