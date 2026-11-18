import type { ThemeId } from '@/domain/types';

/** docs/api/editor-api-contract.md 4–6절. 목 클라이언트와 API 클라이언트가 같은 모양을 쓴다. */

export type PhotoFilter = 'original' | 'warm' | 'mono';
export type InvitationStatus = 'draft' | 'published' | 'unpublished' | 'deleted';

export type EditorInvitation = {
  id: string;
  slug: string;
  status: InvitationStatus;
  theme: ThemeId;
  photoFilter: PhotoFilter;
  groom: { name: string; givenName: string; phone: string };
  bride: { name: string; givenName: string; phone: string };
  ceremony: {
    date: string | null;
    time: string | null;
    venueName: string;
    hall: string;
    address: string;
    addressDetail: string;
    lat: number | null;
    lng: number | null;
  };
  greeting: string;
  families: { groom: FamilySide; bride: FamilySide };
  photos: EditorPhoto[];
  transport: { parking: string; subway: string; bus: string; other: string };
  accountsNote: string;
  accounts: EditorAccount[];
  rsvp: { deadline: string | null; deadlineOverride: boolean };
  links: { invitePath: string; rsvpLinkPath: string | null };
  checklist: { field: string; ok: boolean }[];
  hasUnpublishedChanges: boolean;
  purgeAt: string | null;
  createdAt: string;
  updatedAt: string;
  etag: string;
  publishedAt: string | null;
};

export type FamilySide = {
  relation: string;
  father: ParentInput;
  mother: ParentInput;
};

export type ParentInput = {
  name: string;
  phone: string;
  deceased: boolean;
  deceasedStyle: 'hanja' | 'hangul' | null;
};

export type EditorAccount = {
  id: string;
  side: 'groom' | 'bride';
  relation: string;
  holder: string;
  bank: string;
  number: string;
};

export type EditorPhoto = {
  id: string;
  sort: number;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  width: number | null;
  height: number | null;
  focal: { x: number; y: number };
  crop: { x: number; y: number; width: number; height: number };
  filter: PhotoFilter;
  lowQuality: boolean;
  src: { w800: string; w1200: string; w1600: string; thumb: string } | null;
  lqip: string | null;
};

export type EditorInvitationSummary = {
  id: string;
  slug: string;
  status: InvitationStatus;
  theme: ThemeId;
  groomName: string;
  brideName: string;
  ceremonyDate: string | null;
  coverSrc: string | null;
  rsvp: { responses: number; attendingGuests: number; declined: number; unanswered: number | null };
  hasUnpublishedChanges: boolean;
  purgeAt: string | null;
  updatedAt: string;
  etag: string;
};

export type CreateInvitationBody = {
  theme?: ThemeId;
  groomName?: string;
  brideName?: string;
  ceremonyDate?: string;
  ceremonyTime?: string;
};

export type AutosaveBody = {
  theme?: ThemeId;
  photoFilter?: PhotoFilter;
  groom?: { name?: string; givenName?: string; phone?: string };
  bride?: { name?: string; givenName?: string; phone?: string };
  ceremony?: {
    date?: string | null;
    time?: string | null;
    venueName?: string;
    hall?: string;
    address?: string;
    addressDetail?: string;
    lat?: number | null;
    lng?: number | null;
  };
  greeting?: string;
  families?: { groom: FamilySide; bride: FamilySide };
  transport?: { parking?: string; subway?: string; bus?: string; other?: string };
  accountsNote?: string;
  accounts?: Array<{
    id?: string;
    side: 'groom' | 'bride';
    relation: string;
    holder: string;
    bank: string;
    number: string;
  }>;
  photos?: Array<{
    id: string;
    sort: number;
    focal?: { x: number; y: number };
    crop?: { x: number; y: number; width: number; height: number };
    filter?: PhotoFilter;
  }>;
  rsvp?: { deadline?: string | null };
};

export type PresignBody = {
  contentType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic' | 'image/heif';
  byteSize: number;
};

export type PresignResult = {
  photoId: string;
  method: 'PUT';
  uploadUrl: string;
  headers: { 'Content-Type': string };
  expiresAt: string;
};

export type AutosaveResult =
  | { ok: true; invitation: EditorInvitation }
  | { ok: false; code: 'conflict'; invitation: EditorInvitation }
  | { ok: false; code: 'validation'; field: string }
  | { ok: false; code: 'failed' };

export type PhotoStepResult =
  | { ok: true; etag: string; invitation?: EditorInvitation; photo?: EditorPhoto }
  | { ok: false; code: 'failed'; message: string };

export type PresignStep = { ok: true; result: PresignResult; invitation: EditorInvitation } | { ok: false; message: string };

/** docs/api/editor-api-contract.md 2·3·5.4·7·9절. */

export type EditorSession = {
  userId: string;
  isAnonymous: boolean;
  isAdmin: boolean;
  plan: 'free';
  adsEnabled: boolean;
  showAds: boolean;
};

export type EditorFailure = {
  ok: false;
  code: 'login_required' | 'validation' | 'forbidden' | 'claim_invalid' | 'not_found' | 'conflict' | 'failed' | 'unconfigured' | 'existing_account' | 'cancelled';
  field?: string;
  reason?: string;
  message?: string;
};

export type KakaoLinkResult = { ok: true; mode: 'linked'; redirected: boolean } | EditorFailure;

export type ClaimTicketResult = { ok: true; ticket: string; expiresAt: string } | EditorFailure;

export type ClaimDraftsResult = { ok: true; invitations: Array<{ id: string; slug: string }> } | EditorFailure;

export type StaticRebuild = {
  id: string;
  action: 'publish' | 'apply' | 'unpublish' | 'delete';
  slug: string;
  revision: number;
  pagePath: string;
  documentPath: string;
};

export type InvitationActionResult = { ok: true; invitation: EditorInvitation; staticRebuild: StaticRebuild } | EditorFailure;

export type DeleteInvitationResult = { ok: true; staticRebuild?: StaticRebuild } | EditorFailure;

export type AppSettings = {
  adsEnabled: boolean;
  plan: 'free';
  showAds: boolean;
  canEditAds: boolean;
};

export type AppSettingsResult = { ok: true; settings: AppSettings } | EditorFailure;

export type InvitationSettings = {
  id: string;
  slug: string;
  slugEditable: false;
  status: InvitationStatus;
  purgeAt: string | null;
  links: { invitePath: string; rsvpLinkPath: string | null };
  rsvp: {
    enabled: true;
    deadline: string | null;
    deadlineOverride: boolean;
    publicLinkEnabled: boolean;
  };
};

export type InvitationSettingsPatch = {
  rsvp?: { deadline?: string | null; enabled?: boolean };
  slug?: string;
  publicLinkEnabled?: boolean;
};

export type InvitationSettingsResult = { ok: true; settings: InvitationSettings; etag: string } | EditorFailure;

export type Recipient = {
  id: string;
  name: string;
  revoked: boolean;
  path: string | null;
  response: { attending: boolean; companions: number; name: string | null; updatedAt: string } | null;
};

export type RecipientMutationResult = { ok: true; recipients: Recipient[] } | EditorFailure;

export type PublicRsvpRow = {
  id: string;
  channel: 'invite' | 'rsvp_link';
  name: string;
  attending: boolean;
  companions: number;
  updatedAt: string;
  duplicateName: boolean;
};

export type ChannelTotals = {
  attendingResponses: number;
  companionSum: number;
  attendingGuests: number;
  declined: number;
  unanswered: number | null;
};

export type RsvpDashboard = {
  deadline: string | null;
  closed: boolean;
  totals: ChannelTotals;
  byChannel: { personal: ChannelTotals; invite: ChannelTotals; rsvp_link: ChannelTotals };
  byRecipient: Array<{
    recipientId: string;
    channel: 'personal';
    listName: string;
    responseName: string | null;
    status: 'unanswered' | 'attending' | 'declined';
    revoked: boolean;
    companions: number;
    updatedAt: string | null;
    path: string | null;
  }>;
  byPublicLink: { invite: PublicRsvpRow[]; rsvpLink: PublicRsvpRow[] };
};

export type RsvpDashboardResult = { ok: true; dashboard: RsvpDashboard } | EditorFailure;

export type HostNotice = {
  id: string;
  invitationId: string;
  kind: 'purge_soon';
  purgeAt: string;
  message: string;
};

export const CLAIM_TICKET_KEY = 'invife:claim-ticket';
export const CLAIM_ASK_KEY = 'invife:claim-ask';
export const PUBLISH_AFTER_LOGIN_KEY = 'invife:publish-after-login';
export const FLASH_TOAST_KEY = 'invife:toast';

export const ALREADY_LINKED_MESSAGES = ['Identity is already linked to another user', 'Identity is already linked'] as const;

/** 콜백 오류가 이 두 문장일 때만 익명 세션이 남고, 그 다음에만 기존 계정 로그인을 한다. */
export function alreadyLinkedMessage(value: string | null | undefined): boolean {
  if (!value) return false;
  let text = value;
  try {
    text = decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    text = value;
  }
  return ALREADY_LINKED_MESSAGES.some((item) => text.includes(item));
}

export function callbackAlreadyLinked(): boolean {
  if (typeof window === 'undefined') return false;
  return [window.location.search, window.location.hash].some((source) => {
    const params = new URLSearchParams(source.replace(/^[#?]/, ''));
    return alreadyLinkedMessage(params.get('error_description') ?? params.get('error'));
  });
}
