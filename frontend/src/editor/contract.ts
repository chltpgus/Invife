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
