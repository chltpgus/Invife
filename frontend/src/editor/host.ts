import { isDeadlineClosed } from '@/domain/dates';
import type {
  AppSettings,
  ChannelTotals,
  EditorInvitation,
  EditorInvitationSummary,
  EditorSession,
  HostNotice,
  InvitationSettings,
  InvitationSettingsPatch,
  PublicRsvpRow,
  Recipient,
  RsvpDashboard,
  StaticRebuild,
} from '@/editor/contract';

export const RECIPIENT_BATCH_MAX = 300;
export const RECIPIENT_NAME_MAX = 20;
const NOTICE_LEAD_MS = 7 * 24 * 60 * 60 * 1000;

export type RecipientRecord = {
  id: string;
  name: string;
  revoked: boolean;
  token: string;
  response: Recipient['response'];
};

export type HostState = {
  session: EditorSession;
  adsEnabled: boolean;
  revisions: Record<string, number>;
  kakaoUserId: string | null;
  owners: Record<string, string>;
  recipients: Record<string, RecipientRecord[]>;
  publicRows: Record<string, { invite: PublicRsvpRow[]; rsvpLink: PublicRsvpRow[] }>;
  tickets: Record<string, { invitationIds: string[]; expiresAt: string; used: boolean }>;
};

export type HostPersistence = {
  load: () => HostState;
  save: (state: HostState) => void;
};

export function freshHost(userId = ''): HostState {
  return {
    session: {
      userId: userId || crypto.randomUUID(),
      isAnonymous: true,
      isAdmin: false,
      plan: 'free',
      adsEnabled: false,
      showAds: false,
    },
    adsEnabled: false,
    revisions: {},
    kakaoUserId: null,
    owners: {},
    recipients: {},
    publicRows: {},
    tickets: {},
  };
}

export function memoryHost(seed?: HostState): HostPersistence {
  let current = seed ?? freshHost();
  return {
    load: () => structuredClone(current),
    save: (next) => {
      current = next;
    },
  };
}

const HOST_KEY = 'invife:host';

export function browserHost(): HostPersistence {
  return {
    load() {
      if (typeof localStorage === 'undefined') return freshHost();
      const raw = localStorage.getItem(HOST_KEY);
      if (!raw) {
        const created = freshHost();
        localStorage.setItem(HOST_KEY, JSON.stringify(created));
        return created;
      }
      try {
        const parsed = JSON.parse(raw) as HostState;
        if (!parsed?.session?.userId || !parsed.owners || !parsed.recipients || !parsed.tickets) throw new Error('host');
        parsed.publicRows ??= {};
        parsed.adsEnabled ??= parsed.session.adsEnabled ?? false;
        parsed.revisions ??= {};
        parsed.session = sessionWithAds(parsed.session, parsed.adsEnabled);
        return parsed;
      } catch {
        const created = freshHost();
        localStorage.setItem(HOST_KEY, JSON.stringify(created));
        return created;
      }
    },
    save(state) {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(HOST_KEY, JSON.stringify(state));
    },
  };
}

export function canEdit(state: HostState, id: string): boolean {
  const owner = state.owners[id];
  return !owner || owner === state.session.userId;
}

export function normalizeRecipientName(value: string): string {
  return value.trim().normalize('NFC');
}

/** 줄바꿈만 나눈다. 쉼표는 이름에 남긴다. */
export function parseRecipientPaste(text: string): { names: string[]; error: string | null } {
  const names = text.split(/\r?\n/).map(normalizeRecipientName).filter(Boolean);
  if (names.length === 0) return { names: [], error: '이름을 입력해 주세요' };
  if (names.length > RECIPIENT_BATCH_MAX) return { names: [], error: '한 번에 300명까지 추가할 수 있어요' };
  if (names.some((name) => [...name].length > RECIPIENT_NAME_MAX)) return { names: [], error: '이름은 20자까지 입력할 수 있어요' };
  return { names, error: null };
}

export function sessionWithAds(session: EditorSession, adsEnabled: boolean): EditorSession {
  return {
    ...session,
    plan: 'free',
    adsEnabled,
    showAds: adsEnabled && !session.isAdmin && session.plan === 'free',
  };
}

export function appSettingsFrom(state: HostState): AppSettings {
  const session = sessionWithAds(state.session, state.adsEnabled);
  return { adsEnabled: state.adsEnabled, plan: 'free', showAds: session.showAds, canEditAds: session.isAdmin };
}

export function linkKakaoAccount(state: HostState): { state: HostState; linked: boolean } {
  if (!state.kakaoUserId || state.kakaoUserId === state.session.userId) {
    const userId = state.session.userId;
    return {
      linked: true,
      state: {
        ...state,
        kakaoUserId: userId,
        session: sessionWithAds({ ...state.session, userId, isAnonymous: false }, state.adsEnabled),
      },
    };
  }
  return { state, linked: false };
}

export function signInKakaoAccount(state: HostState): HostState {
  if (!state.kakaoUserId || state.kakaoUserId === state.session.userId) {
    const userId = state.session.userId;
    return {
      ...state,
      kakaoUserId: userId,
      session: sessionWithAds({ ...state.session, userId, isAnonymous: false }, state.adsEnabled),
    };
  }
  return {
    ...state,
    session: sessionWithAds({ ...state.session, userId: state.kakaoUserId, isAnonymous: false }, state.adsEnabled),
  };
}

export function nextRebuild(state: HostState, slug: string, action: StaticRebuild['action']): { state: HostState; staticRebuild: StaticRebuild } {
  const revision = (state.revisions[slug] ?? 0) + 1;
  return {
    state: { ...state, revisions: { ...state.revisions, [slug]: revision } },
    staticRebuild: {
      id: crypto.randomUUID(),
      action,
      slug,
      revision,
      pagePath: `/i/${slug}/`,
      documentPath: `/v1/invitations/${slug}`,
    },
  };
}

export function invitationSettingsFrom(invitation: EditorInvitation): InvitationSettings {
  return {
    id: invitation.id,
    slug: invitation.slug,
    slugEditable: false,
    status: invitation.status,
    purgeAt: invitation.purgeAt,
    links: { invitePath: `/i/${invitation.slug}/`, rsvpLinkPath: invitation.status === 'published' ? invitation.links.rsvpLinkPath : null },
    rsvp: {
      enabled: true,
      deadline: invitation.rsvp.deadline,
      deadlineOverride: invitation.rsvp.deadlineOverride,
      publicLinkEnabled: invitation.status === 'published' && Boolean(invitation.links.rsvpLinkPath),
    },
  };
}

export function settingsPatchError(body: InvitationSettingsPatch): { field: string; reason: string } | null {
  if (body.slug !== undefined) return { field: 'slug', reason: 'not_supported' };
  if (body.publicLinkEnabled !== undefined) return { field: 'rsvp.publicLinkEnabled', reason: 'not_supported' };
  if (body.rsvp && body.rsvp.enabled !== undefined && body.rsvp.enabled !== true) return { field: 'rsvp.enabled', reason: 'not_supported' };
  return null;
}

export function rsvpCounts(state: HostState, id: string): EditorInvitationSummary['rsvp'] {
  const dashboard = buildRsvpDashboard({
    deadline: null,
    now: new Date(),
    slug: '',
    recipients: state.recipients[id] ?? [],
    invite: state.publicRows[id]?.invite ?? [],
    rsvpLink: state.publicRows[id]?.rsvpLink ?? [],
  });
  return {
    responses: dashboard.totals.attendingResponses + dashboard.totals.declined,
    attendingGuests: dashboard.totals.attendingGuests,
    declined: dashboard.totals.declined,
    unanswered: dashboard.totals.unanswered,
  };
}

export function buildRsvpDashboard(input: {
  deadline: string | null;
  now: Date;
  slug: string;
  recipients: RecipientRecord[];
  invite: PublicRsvpRow[];
  rsvpLink: PublicRsvpRow[];
}): RsvpDashboard {
  const active = input.recipients.filter((item) => !item.revoked);
  const personal = channelTotals(
    active.flatMap((item) => (item.response ? [item.response] : [])),
    active.length === 0 ? null : active.filter((item) => !item.response).length,
  );
  const invite = channelTotals(input.invite, null);
  const rsvpLink = channelTotals(input.rsvpLink, null);
  return {
    deadline: input.deadline,
    closed: input.deadline ? isDeadlineClosed(input.now, input.deadline) : false,
    totals: {
      attendingResponses: personal.attendingResponses + invite.attendingResponses + rsvpLink.attendingResponses,
      companionSum: personal.companionSum + invite.companionSum + rsvpLink.companionSum,
      attendingGuests: personal.attendingGuests + invite.attendingGuests + rsvpLink.attendingGuests,
      declined: personal.declined + invite.declined + rsvpLink.declined,
      unanswered: personal.unanswered,
    },
    byChannel: { personal, invite, rsvp_link: rsvpLink },
    byRecipient: input.recipients.map((item) => ({
      recipientId: item.id,
      channel: 'personal' as const,
      listName: item.name,
      responseName: item.response?.name ?? null,
      status: !item.response ? 'unanswered' : item.response.attending ? 'attending' : 'declined',
      revoked: item.revoked,
      companions: item.response?.companions ?? 0,
      updatedAt: item.response?.updatedAt ?? null,
      path: item.revoked ? null : `/i/${input.slug}/g/${item.token}/`,
    })),
    byPublicLink: {
      invite: markDuplicates(input.invite.map((row) => ({ ...row, channel: 'invite' as const }))),
      rsvpLink: markDuplicates(input.rsvpLink.map((row) => ({ ...row, channel: 'rsvp_link' as const }))),
    },
  };
}

function channelTotals(rows: Array<{ attending: boolean; companions: number }>, unanswered: number | null): ChannelTotals {
  const attending = rows.filter((item) => item.attending);
  const companionSum = attending.reduce((sum, item) => sum + item.companions, 0);
  return {
    attendingResponses: attending.length,
    companionSum,
    attendingGuests: attending.length + companionSum,
    declined: rows.length - attending.length,
    unanswered,
  };
}

export function toRecipient(record: RecipientRecord, slug: string): Recipient {
  return {
    id: record.id,
    name: record.name,
    revoked: record.revoked,
    path: record.revoked ? null : `/i/${slug}/g/${record.token}/`,
    response: record.response,
  };
}

export function buildNotices(invitations: EditorInvitation[], now: Date): HostNotice[] {
  return invitations.flatMap((invitation) => {
    if (!invitation.purgeAt || invitation.status === 'deleted') return [];
    const at = new Date(invitation.purgeAt).getTime();
    if (Number.isNaN(at) || at < now.getTime() || at - now.getTime() > NOTICE_LEAD_MS) return [];
    return [
      {
        id: `purge-${invitation.id}`,
        invitationId: invitation.id,
        kind: 'purge_soon' as const,
        purgeAt: invitation.purgeAt,
        message: `${formatPurgeDate(invitation.purgeAt)}에 사진과 하객 정보가 자동으로 지워져요`,
      },
    ];
  });
}

export function formatPurgeDate(iso: string): string {
  const shifted = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  if (Number.isNaN(shifted.getTime())) return '삭제 예정일';
  return `${shifted.getUTCFullYear()}년 ${shifted.getUTCMonth() + 1}월 ${shifted.getUTCDate()}일`;
}

export function purgeAtFor(date: string | null): string | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day + 30, -9, 0, 0, 0)).toISOString();
}

export function invitationStatusLabel(status: EditorInvitationSummary['status'], ceremonyDate: string | null, now: Date): string {
  if (status === 'draft') return '초안';
  if (status === 'unpublished') return '발행 취소';
  if (status === 'deleted') return '삭제됨';
  if (ceremonyDate && ceremonyEnded(ceremonyDate, now)) return '행사 종료';
  return '발행됨';
}

function ceremonyEnded(date: string, now: Date): boolean {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return false;
  const ended = new Date(Date.UTC(year, month - 1, day + 1, -9, 0, 0, 0));
  return now.getTime() >= ended.getTime();
}

function markDuplicates(rows: PublicRsvpRow[]): PublicRsvpRow[] {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.name, (counts.get(row.name) ?? 0) + 1);
  return rows.map((row) => ({ ...row, duplicateName: (counts.get(row.name) ?? 0) > 1 }));
}

export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 12);
}
