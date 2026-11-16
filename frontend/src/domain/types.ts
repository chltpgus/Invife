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
  /** R2 상대 키. 페이지가 NEXT_PUBLIC_R2_BASE_URL 을 붙인다. */
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
 * 빌드에 들어가는 공개 초대장.
 * rsvp.deadline 은 서버가 계산해 넣은 ISO 문자열이다. 마감 컬럼이 비면 예식 전날 23:59:59.999 KST.
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

export type RsvpChannel = 'personal' | 'invite' | 'rsvp_link';

export type RsvpResponse = {
  id: string;
  attending: boolean;
  /** 0–10, 본인 제외. 불참이면 0. */
  companions: number;
  name: string;
  updatedAt: string;
};

export type GuestLink =
  | { channel: 'invite' }
  | { channel: 'personal'; token: string }
  | { channel: 'rsvp_link'; token: string };

export type RsvpContext = {
  status: 'open' | 'closed';
  deadline: string;
  link: RsvpChannel;
  revoked?: boolean;
  prefillName?: string;
  response?: RsvpResponse | null;
};

export type RsvpContextResult =
  | { ok: true; context: RsvpContext }
  | { ok: false; code: 'not_found' | 'unavailable' | 'network' };

export type RsvpSubmitBody = {
  slug: string;
  channel: RsvpChannel;
  token?: string;
  name?: string;
  attending: boolean;
  companions: number;
  responseId?: string;
  editKey?: string;
  turnstileToken?: string;
};

export type RsvpErrorCode =
  | 'validation'
  | 'turnstile_failed'
  | 'edit_forbidden'
  | 'not_found'
  | 'closed'
  | 'revoked'
  | 'rate_limited'
  | 'unavailable'
  | 'network';

export type RsvpSubmitResult =
  | { ok: true; response: RsvpResponse; edited: boolean; editKey?: string }
  | { ok: false; code: RsvpErrorCode; field?: string; reason?: string; retryAfter?: number };

export type StoredEdit = {
  responseId: string;
  editKey: string;
  response: RsvpResponse;
};
