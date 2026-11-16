export type ThemeId = 'ivory' | 'sage' | 'mist';
export type Side = 'groom' | 'bride';
export type DeceasedStyle = 'hanja' | 'hangul';

export type Parent = {
  name: string;
  phone?: string;
  /** 사람마다 둔다. true 면 연락 버튼·연락 행을 만들지 않는다. */
  deceased?: boolean;
  /** deceased 일 때 필수. hanja = 故, hangul = 고 */
  deceasedStyle?: DeceasedStyle;
};

export type FamilySide = {
  /** 아들, 딸, 장남, 차녀 등 제작자 입력 */
  relation: string;
  father?: Parent;
  mother?: Parent;
};

export type CouplePerson = {
  name: string;
  givenName: string;
  phone?: string;
};

export type Photo = {
  id: string;
  width: number;
  height: number;
  focal: { x: number; y: number };
  src: { w800: string; w1200: string; w1600: string };
  lqip: string;
};

export type Transport = {
  parking?: string;
  subway?: string;
  bus?: string;
  other?: string;
};

export type Account = {
  id: string;
  side: Side;
  relation: string;
  holder: string;
  bank: string;
  number: string;
};

/**
 * 하객 화면에 내려가는 초대장.
 * rsvp.deadline 은 항상 있다. 제작자가 비우면 저장 시점에 예식 전날 23:59 KST 로 채운다.
 */
export type Invitation = {
  id: string;
  slug: string;
  theme: ThemeId;
  groom: CouplePerson;
  bride: CouplePerson;
  ceremony: {
    /** YYYY-MM-DD, KST 달력 날짜 */
    date: string;
    /** HH:mm. 없으면 날짜만 보여 준다. */
    time?: string;
    venueName: string;
    hall?: string;
    address?: string;
    lat?: number;
    lng?: number;
  };
  greeting?: string;
  families: {
    groom?: FamilySide;
    bride?: FamilySide;
  };
  photos: Photo[];
  transport?: Transport;
  accountsNote?: string;
  accounts: Account[];
  rsvp: {
    deadline: string;
  };
};

export type RsvpResponse = {
  id: string;
  attending: boolean;
  /** 0–10, 본인 제외. 불참이면 0. */
  companions: number;
  name: string;
  updatedAt: string;
};

export type Recipient = {
  token: string;
  name: string;
  revoked: boolean;
  response: RsvpResponse | null;
};

/** 빌드가 경로를 만들 때 쓰는 레코드. 공용 RSVP 토큰과 받는 사람 목록은 공개 초대장 JSON 과 분리한다. */
export type InvitationRecord = {
  invitation: Invitation;
  sharedRsvpToken: string;
  recipients: Recipient[];
};

export type FixtureRsvpMode = 'ok' | 'error' | 'rate_limited';

export type FixtureRecord = InvitationRecord & {
  rsvpMode: FixtureRsvpMode;
};

export type GuestLink =
  | { type: 'shared-invitation' }
  | { type: 'personal'; token: string }
  | { type: 'shared-rsvp'; token: string };

export type GuestView =
  | { kind: 'shared-invitation'; rsvp: 'notice' }
  | { kind: 'shared-invitation'; rsvp: 'inline-form'; sharedRsvpToken: string }
  | { kind: 'shared-rsvp'; token: string }
  | { kind: 'personal'; token: string; name: string; response: RsvpResponse | null }
  | { kind: 'revoked-personal'; token: string };

export type RsvpLinkType = GuestView['kind'];

export type RsvpSubmitBody = {
  slug: string;
  linkType: RsvpLinkType;
  token?: string;
  name?: string;
  attending: boolean;
  companions: number;
  responseId?: string;
  turnstileToken?: string;
};

export type RsvpErrorCode = 'closed' | 'rate_limited' | 'revoked' | 'validation' | 'network';

export type RsvpSubmitResult =
  | { ok: true; response: RsvpResponse; edited: boolean }
  | { ok: false; code: RsvpErrorCode };
