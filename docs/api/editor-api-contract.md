# 제작자(에디터) API 계약 (DRAFT)

- 상태: **초안.** 프론트와 맞춰 가는 문서다. 구현은 이 문서를 따른다.
- 기준: [`editor-spec.md`](../design/editor-spec.md), [`mvp-plan.md`](../planning/mvp-plan.md), [`guest-data-contract.md`](./guest-data-contract.md). 하객 계약과 어긋나면 하객 계약이 이긴다.
- 소비처: 제작 화면 `/new`, `/edit/[id]`, `/dashboard`. 하객 페이지는 이 API를 부르지 않는다.
- 기준일: 2026-11-18.

인증은 Supabase Auth 다. 데이터 API는 같은 오리진의 Node 서버다. 사진 변환(sharp)과 Turnstile 때문에 Supabase Edge Function 이 아니라 Node 로 둔다. 경로는 하객 클라이언트가 이미 쓰는 `{API_BASE}` 와 같다.

## 1. 공통

베이스: `NEXT_PUBLIC_API_BASE_URL` (끝 슬래시 없음).

| 항목 | 값 |
|---|---|
| 인증 | `Authorization: Bearer <Supabase access token>` |
| 본문 | `Content-Type: application/json` (업로드 PUT 제외) |
| 성공 시각 | ISO 8601 UTC (`updatedAt` 등) |
| 식별자 | 초대장 `id` 는 UUID. 공개 주소는 `slug` |

익명 로그인으로 만든 사용자도 JWT 역할은 `authenticated` 다. 익명 여부는 `is_anonymous` 클레임으로만 가른다. 어드민은 `app_metadata.role = 'admin'` 만 본다. `user_metadata` 는 사용자가 바꿀 수 있으므로 권한에 쓰지 않는다.

초대장 한 건을 읽거나 쓰면 응답 헤더 `ETag: "<etag>"` 와 본문 `etag` 를 같이 준다. `etag` 는 사용자가 고칠 수 있는 내용만으로 만든 SHA-256 이다. 본문 필드, 사진 순서·포커스·크롭·필터, 사진 추가·삭제가 들어간다. 사진 변환 상태, 변종 URL, LQIP 처럼 서버만 바꾸는 값은 빠진다. 그래서 변환이 끝나도 `etag` 는 그대로다. 목록의 각 항목도 같은 `etag` 를 가진다. 409 도 헤더와 본문 `etag`·`invitation` 을 준다. 다음 자동 저장의 `If-Match` 는 가장 최근에 받은 `etag` 다. 따옴표 있는 헤더 값과 본문 값 둘 다 받는다. `updatedAt` 은 저장 시각이고 `etag` 와 다르다.

오류 본문:

```ts
type ApiError = {
  error: {
    code: string;
    field?: string;
    reason?: string;
    retryAfter?: number;
  };
};
```

| HTTP | code | 언제 |
|---|---|---|
| 400 | `validation` | 형식·길이·필수값. `field` 는 `groom.name` 처럼 점 경로 |
| 401 | `unauthorized` | 토큰 없음·만료·서명 불일치 |
| 403 | `forbidden` | 소유자가 아님, 익명이 발행·명단·설정을 시도(`reason: "login_required"`), 광고 스위치를 어드민이 아닌 사용자가 시도(`reason: "admin_required"`) |
| 403 | `claim_invalid` | 이전 티켓이 없거나 만료·사용됨 |
| 404 | `not_found` | 없는 초대장, 남의 초대장(존재 여부를 숨김) |
| 409 | `conflict` | 자동 저장 `If-Match` 가 서버의 현재 `etag` 와 다름. 본문에 현재 `invitation` 과 `etag` |
| 429 | `rate_limited` | `Retry-After` 초. 본문 `retryAfter` 도 같음 |
| 503 | `unavailable` | DB 장애 |
| 503 | `spend_cap` | 지출 상한. 사진 업로드·초안 생성만 막는다. RSVP 는 막지 않는다 |

`409 conflict` 는 오류와 함께 서버의 현재 문서를 준다. 클라이언트가 「최신 내용 불러오기」에 쓴다.

```json
{ "error": { "code": "conflict" }, "invitation": {} }
```

## 2. 세션

`GET /v1/editor/session`

```ts
type EditorSession = {
  userId: string;
  isAnonymous: boolean;
  isAdmin: boolean;
  /** MVP 는 항상 free. 결제 없음. */
  plan: 'free';
  /** 전역 스위치. 기본 false. 출시 시 꺼 둠. */
  adsEnabled: boolean;
  /**
   * adsEnabled && !isAdmin && plan === 'free'
   * 기획의 showAds = !admin && plan === 'free' 에, 기본으로 끈 전역 스위치를 곱한 값.
   * 편집 화면·미리보기·로그인·명단·계좌 화면에는 프론트가 슬롯을 그리지 않는다.
   */
  showAds: boolean;
};
```

광고 스크립트는 이 API에 없다. 하객 `/i/*` 에는 넣지 않는다.

### 2.1 광고 스위치

`GET /v1/editor/settings` → 로그인한 사용자.

```ts
type AppSettings = {
  adsEnabled: boolean;
  plan: 'free';
  showAds: boolean;
  /** app_metadata.role === 'admin' 일 때만 true. user_metadata 는 무시한다. */
  canEditAds: boolean;
};
```

`PATCH /v1/editor/settings` `{ "adsEnabled": boolean }`

어드민만. 그 외는 `403 forbidden`, `reason: "admin_required"`. `user_metadata.role` 은 어드민이 아니다. 성공하면 위 `AppSettings` 를 다시 준다. `showAds` 는 세션과 같은 식이고, 어드민 자신의 화면은 스위치를 켜도 `showAds: false` 다. 하객 페이지 스크립트는 이 값으로 넣지 않는다.

## 3. 로그인과 초안 이전

프론트가 Supabase 클라이언트로 직접 한다. 이 API는 세션을 만들지 않는다.

### 3.1 비회원이 초안을 서버에 저장

비회원 초안도 이 서버의 초대장 행이다. 브라우저에만 두지 않는다.

1. 프론트가 Supabase JS 로 `signInAnonymously()` 를 호출한다. 실패하면 인라인 오류. 이 API 는 익명 가입에 Turnstile 을 붙이지 않는다(Turnstile 은 하객 공용 채널만). 남용은 IP·사용자당 초안 생성 횟수로 막는다(9절).
2. 성공하면 Supabase 가 익명 사용자와 세션을 준다. 에디터 API 에 보내는 토큰은 그 세션의 `access_token` 이다. `Authorization: Bearer <access_token>`. 클레임 `role` 은 `authenticated`, `is_anonymous` 는 true 다. 만료되면 프론트가 Supabase 세션을 갱신해 새 access token 을 같은 헤더에 넣는다.
3. `POST /v1/editor/invitations`(5.1)로 초안을 만든다. 소유자는 그 익명 사용자다. `201` 의 `invitation.id` 와 `etag` 를 보관한다.
4. 이후 편집은 `PATCH /v1/editor/invitations/:id`(5.3)다. 같은 Bearer 와 `If-Match: <직전 etag>` 를 보낸다. 응답 `etag` 가 다음 `If-Match` 다.
5. 익명은 발행과 명단이 `403 forbidden`, `reason: "login_required"` 다. 영구 계정으로 잇는 방법은 3.2 다.

### 3.2 발행 직전, 카카오 계정으로 잇기

2026-11-18 공식 문서 기준이다. [Identity Linking](https://supabase.com/docs/guides/auth/auth-identity-linking) 은 Manual linking 을 아직 **베타**로 적는다. [Anonymous Sign-Ins](https://supabase.com/docs/guides/auth/auth-anonymous) 는 익명 사용자를 영구 사용자로 바꿀 때 `linkIdentity()` 를 쓰라고 하고, 그 identity 가 이미 다른 사용자에게 있으면 실패하니 기존 계정으로 로그인한 뒤 데이터를 옮기라고 한다. [`linkIdentity`](https://supabase.com/docs/reference/javascript/auth-linkidentity) 는 후보 identity 가 이미 이 사용자 또는 다른 사용자에게 붙어 있으면 실패한다. GoTrue 는 그때 `422` `identity_already_exists` 와 메시지 `Identity is already linked` 또는 `Identity is already linked to another user` 를 준다. supabase-js 는 그 두 메시지에 한해서 콜백 URL 의 오류로 기존 세션을 지우지 않는다. 다른 오류는 세션을 지울 수 있다. 카카오 provider 이름은 `kakao` 다. 네이티브 ID 토큰 연결(`linkIdentity({ provider: 'kakao', token })`)도 카카오를 지원하지만, 웹 에디터는 OAuth `linkIdentity({ provider: 'kakao' })` 를 쓴다.

첫 연결에 `signInWithOAuth` 를 쓰면 안 된다. 그건 다른 사용자를 만들거나 기존 계정으로 들어가서, 익명 `owner_id` 가 그대로 남는다.

1. 발행 직전, 익명이면 익명 세션에서 `linkIdentity({ provider: 'kakao', options: { redirectTo } })`. `redirectTo` 는 프론트 경로 `/edit/{id}/publish` 다. 프로젝트가 Manual linking 을 켜 두어야 한다(대시보드 Authentication 설정, 셀프 호스트는 `GOTRUE_SECURITY_MANUAL_LINKING_ENABLED=true`, 로컬 `backend/supabase/config.toml` 의 `enable_manual_linking`).
2. 성공하면 **같은 사용자 id** 가 영구 계정이 되고 `is_anonymous` 가 false 가 된다. 프론트는 세션을 갱신한 뒤 그 access token 으로 발행한다. 초대장 `owner_id` 는 그대로다.
3. 그 카카오 identity 가 **이미 있으면** `linkIdentity` 는 실패한다. 콜백의 오류 메시지가 위의 두 문장 중 하나일 때만 익명 세션이 유지된다. 프론트는 그 메시지를 보고 다이얼로그 「이 카카오 계정은 이미 Invife에 가입돼 있어요. 이 초안을 그 계정으로 옮길까요?」를 띄운다. 메시지를 확인하기 전에 `signInWithOAuth` 를 호출하지 않는다.

옮기기:

1. 아직 익명 세션인 동안 `POST /v1/editor/claim-tickets` `{ "invitationIds": ["..."] }` → `201 { "ticket": "<원문 한 번>", "expiresAt": "<15분>" }`. 티켓은 그 익명 사용자가 소유한 초안만 묶는다. 평문은 응답에만 있고 DB 에는 sha256 만 있다. `sessionStorage` 키 `invife:claim-ticket`. 영구 세션이 호출하면 `403 forbidden`, `reason: "not_anonymous"`.
2. `signInWithOAuth({ provider: 'kakao' })` 로 기존 계정에 로그인한다. 리다이렉트 복귀 주소는 `/edit/{id}/publish`. 이 호출이 익명 세션을 바꾼다. 그래서 티켓을 먼저 받는다.
3. 영구 세션으로 `POST /v1/editor/drafts/claim` `{ "ticket": "..." }` → `200 { "invitations": [{ "id", "slug" }] }`. `owner_id` 가 바뀐다. 티켓은 1회용이다. 다시 쓰거나, 15분이 지났거나, 그 사이 소유자가 바뀌면 `403 claim_invalid`. 익명 세션으로 claim 하면 `403 forbidden`, `reason: "login_required"`.
4. 이어서 발행한다.

취소하면 아무것도 호출하지 않는다. 익명 초안은 그 브라우저에 남는다.

대시보드의 「이미 만든 청첩장 보기」는 카카오 로그인만 하고 claim 을 하지 않는다. 어드민은 로그인 뒤에도 `app_metadata.role = 'admin'` 만 본다. 카카오가 넣는 `user_metadata` 로 어드민이 되지 않는다.

## 4. 초대장 문서

```ts
type ThemeId = 'ivory' | 'sage' | 'mist';
type PhotoFilter = 'original' | 'warm' | 'mono';
type InvitationStatus = 'draft' | 'published' | 'unpublished' | 'deleted';

type EditorInvitation = {
  id: string;
  slug: string;
  status: InvitationStatus;
  theme: ThemeId;
  photoFilter: PhotoFilter;
  groom: { name: string; givenName: string; phone: string };
  bride: { name: string; givenName: string; phone: string };
  ceremony: {
    date: string | null;       // YYYY-MM-DD, KST 달력
    time: string | null;       // HH:mm
    venueName: string;
    hall: string;
    address: string;
    addressDetail: string;     // 공개 JSON 에는 address 뒤에 합쳐 넣는다
    lat: number | null;
    lng: number | null;
  };
  greeting: string;
  families: { groom: FamilySide; bride: FamilySide };
  photos: EditorPhoto[];       // sort 오름차순. 첫 장 = 커버
  transport: { parking: string; subway: string; bus: string; other: string };
  accountsNote: string;
  accounts: EditorAccount[];
  rsvp: {
    /** 계산된 마감. 날짜가 없으면 null. */
    deadline: string | null;
    /** true 면 호스트가 덮어쓴 값. false 면 예식 전날 23:59:59.999 KST. */
    deadlineOverride: boolean;
  };
  links: {
    invitePath: string;             // /i/{slug}/
    /** 발행 후에만. 평문 토큰은 소유자 응답에만 있고 DB 에는 해시만. */
    rsvpLinkPath: string | null;
  };
  checklist: { field: string; ok: boolean }[];
  hasUnpublishedChanges: boolean;
  purgeAt: string | null;          // 예식일 + 30일, KST 자정. 날짜 없으면 null
  createdAt: string;
  updatedAt: string;
  etag: string;
  publishedAt: string | null;
};

type FamilySide = {
  relation: string;
  father: ParentInput;
  mother: ParentInput;
};

type ParentInput = {
  name: string;
  phone: string;
  deceased: boolean;
  deceasedStyle: 'hanja' | 'hangul' | null;
};

type EditorAccount = {
  id: string;
  side: 'groom' | 'bride';
  relation: string;
  holder: string;
  bank: string;
  number: string;
};

type EditorPhoto = {
  id: string;
  sort: number;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  width: number | null;
  height: number | null;
  focal: { x: number; y: number };
  crop: { x: number; y: number; width: number; height: number }; // 원본 대비 0–1
  filter: PhotoFilter;
  lowQuality: boolean;
  src: { w800: string; w1200: string; w1600: string; thumb: string } | null;
  lqip: string | null;
};
```

빈 문자열은 「아직 없음」이다. 하객 화면에서는 비어 있는 선택 블록을 숨긴다. 공개 `Invitation` 에는 빈 값을 넣지 않는다(하객 계약 2절).

`givenName` 은 비어 있으면 빈 채로 둔다. 서버가 이름의 첫 글자를 떼어 채우지 않는다. 복성(남궁, 제갈)에서 깨지고, 미리보기와 발행 결과가 달라지기 때문이다. 발행 때 비어 있으면 `400 validation`, `field: "groom.givenName"` 또는 `"bride.givenName"`, `reason: "required"`. 제안 값은 에디터에서 사용자가 확인한 뒤에만 보낸다.

## 5. 만들기 · 자동 저장 · 발행

### 5.1 초안 만들기

`POST /v1/editor/invitations`

테마 선택 화면의 「만들기 시작」. 세 칸은 모두 생략할 수 있다.

```ts
type CreateInvitationBody = {
  theme?: ThemeId;          // 기본 ivory
  groomName?: string;
  brideName?: string;
  ceremonyDate?: string;    // YYYY-MM-DD
  ceremonyTime?: string;    // HH:mm
};
```

`201` `{ "invitation": EditorInvitation }`. `status` 는 `draft`. `slug` 는 10–16자의 추측하기 어려운 값이다(이름·날짜를 넣지 않는다). 사람이 읽는 슬러그는 받지 않는다(editor-spec Q13 임시 처리).

### 5.2 목록 · 한 건

`GET /v1/editor/invitations` → `{ "invitations": EditorInvitationSummary[] }`

```ts
type EditorInvitationSummary = {
  id: string;
  slug: string;
  status: InvitationStatus;
  theme: ThemeId;
  groomName: string;
  brideName: string;
  ceremonyDate: string | null;
  coverSrc: string | null;     // thumb 상대 키. 없으면 null
  rsvp: { responses: number; attendingGuests: number; declined: number; unanswered: number | null };
  hasUnpublishedChanges: boolean;
  purgeAt: string | null;
  updatedAt: string;
  etag: string;
};
```

`unanswered` 는 폐기되지 않은 받는 사람이 있을 때만 숫자다. 명단이 없으면 `null`(카드 대신 안내).

`GET /v1/editor/invitations/:id` → `{ "invitation": EditorInvitation }`

삭제된 초대장과 남의 초대장은 `404 not_found`.

### 5.3 자동 저장

`PATCH /v1/editor/invitations/:id`

보낸 필드만 바꾼다. 없는 필드는 유지다. `families`, `accounts`를 보내면 그 배열은 **통째로 교체**다. `photos`는 나열한 id의 `sort`, `focal`, `crop`, `filter`만 바꾼다. 목록에서 뺀 사진은 지우지 않는다. 삭제는 `DELETE .../photos/:photoId`다. `crop` 을 생략하면 `{ x: 0, y: 0, width: 1, height: 1 }` 로 저장한다. editor-spec 에는 자유 크롭이 없고 초점만 있으므로, 화면은 이 전체 프레임을 보내도 된다. 저장돼 있는 `crop` 과 `filter` 가 그대로면 다시 만들지 않는다. 초점만 바뀌어도 변환은 다시 하지 않는다. `crop` 또는 `filter` 가 달라지고 이미 변종이 있으면 그 사진만 `processing` 으로 돌아가 다시 만든다. 새 파일이 나오기 전까지 `src` 는 이전 변종을 가리킨다.

```ts
type AutosaveBody = {
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
  rsvp?: { deadline?: string | null };   // null 이면 덮어쓰기 해제(예식 전날로 계산)
};
```

자동 저장은 `If-Match` 가 필수다. 없으면 `400 validation`, `field: "if-match"`, `reason: "required"`. 값이 현재 `etag` 와 다르면 `409 conflict`. 성공은 `200` `{ "invitation": EditorInvitation }` 이고 헤더 `ETag` 가 새 값이다.

자동 저장은 **작업 중인 문서**만 바꾼다. 이미 발행된 초대장이라도 하객이 보는 스냅샷(`published_document`)은 바뀌지 않는다. `hasUnpublishedChanges` 가 true 가 된다. 하객 화면은 「변경 사항 반영」(`apply`) 또는 첫 발행 때만 바뀐다. 디바운스 800ms·최대 5초·blur 즉시 저장은 프론트 규칙이다(editor-spec 7장).

발행 후에도 시간·장소·계좌를 포함한 **모든 필드**를 고칠 수 있다. 링크(`slug`, 이미 나간 개인 토큰)는 유지된다(editor-spec Q17 임시 처리).

검증(자동 저장, 발행보다 느슨하다):

| 필드 | 규칙 |
|---|---|
| 신랑·신부 이름 | 0–10자. 발행 때는 2–10 |
| givenName | 0–10자 |
| 전화 | 자동 저장은 0–20자(작성 중 `010` 같은 미완성 허용). 발행 때는 비거나, 숫자와 `-` 만, 숫자 8–15개 |
| 예식장 | 0–30자 |
| 홀 | 0–20자 |
| 주소·상세 | 주소 0–120, 상세 0–40 |
| 인사말 | 0–300자 |
| 교통 각 칸 | 0–100자 |
| 계좌 안내 | 0–80자 |
| 혼주 이름 | 0–10, 관계 0–6 |
| 계좌 | 자동 저장은 측마다 최대 3, 길이만 본다. 발행 때는 한 칸이라도 채웠으면 관계·예금주 2자 이상·은행·번호(숫자·`-`, 숫자 8–20)가 모두 있어야 한다 |
| 초점 | 0–1. 기본 (0.5, 0.4) |
| 크롭 | `x`,`y`,`width`,`height` 는 원본 비율 0–1. `width`·`height` 는 0보다 크고, 시작+크기는 1을 넘지 않는다. 생략하면 전체 `{0,0,1,1}` 로 저장한다. 저장값과 같으면 재변환하지 않는다 |
| 사진 필터 | `original` · `warm` · `mono`. 사진마다. 초대장 `photoFilter` 를 바꾸면 아직 개별 필터를 같이 안 보낸 사진에 일괄 적용되고, 변종이 있는 사진은 다시 만든다 |
| 마감 덮어쓰기 | 예식 시작(날짜+시간, KST)보다 늦으면 `validation` |
| 고인 | 부모가 `deceased: true` 이고 이름이 비어 있지 않은데 `deceasedStyle` 이 없으면 발행이 `400 validation`, `reason: "deceased_style"`. 표기는 `hanja`(故) 또는 `hangul`(고)이다. 이름은 비어 있고 고인만 체크된 경우는 막지 않는다. 자동 저장은 표기 없이 받는다 |
| 사진 장 수 | 메타 배열도 최대 10 |

10분 단위 시간은 프론트만 지킨다. 서버는 `HH:mm` 이면 받는다. 「오늘 이후」도 프론트 검증이다. 서버는 달력 날짜이기만 하면 저장한다(지난 예식 수정·시드).

### 5.4 발행 · 반영 · 발행 취소 · 삭제

발행 필수: 신랑·신부 이름, 신랑·신부 `givenName`(1자 이상, 자동 채움 없음), 날짜, 시간, 예식장, 주소, 대표 사진 1장이 `ready`. 고인으로 표시했고 이름이 있는 부모는 `deceasedStyle` 이 `hanja`(故) 또는 `hangul`(고)이어야 한다. 표기를 고르지 않으면 `reason: "deceased_style"`. 전화·혼주 전화·계좌는 이 시점에 형식을 검사한다. 오류는 `field` 에 `groom.givenName`, `groom.phone`, `accounts.number` 처럼 점 경로를 담는다. `deceased_style` 은 점 경로가 아니라 `reason` 이다.

`POST /v1/editor/invitations/:id/publish`

초안이거나 발행 취소된 초대장을 공개한다. 영구 사용자만. 익명이면 `403 forbidden` + `reason: "login_required"`. 같은 `slug`. 공유 RSVP 토큰이 없으면 만든다. `200` `{ "invitation": EditorInvitation, "staticRebuild": StaticRebuild }`.

`POST /v1/editor/invitations/:id/apply`

발행 중인 문서의 하객 스냅샷을 작업 문서로 바꾼다. 영구 사용자만. `slug` 와 개인 링크는 유지. 발행 뒤에도 시간·장소·계좌를 포함한 필드를 고친 뒤 이 호출로 같은 링크의 정적 페이지를 다시 굽는다. 마감을 이미 지난 시각으로 당기면 즉시 마감된다(확인 문구는 프론트). `200` 동일.

`POST /v1/editor/invitations/:id/unpublish`

하객 GET 과 RSVP 가 `404`. 사진·응답·슬러그는 남는다. 다시 `publish` 하면 같은 링크다. `200` 에 `staticRebuild.action` 은 `unpublish`.

`DELETE /v1/editor/invitations/:id`

```ts
type DeleteBody = { confirm?: string };
```

발행·발행 취소 상태는 본문 `confirm: "삭제"` 가 있어야 한다. 초안은 본문 없이 지운다. 즉시 `deleted`(공개 404). 행·R2 객체는 24시간 안에 하드 삭제한다. 영구 사용자의 삭제는 `{ "ok": true, "staticRebuild": StaticRebuild }` 다. 익명 초안 삭제는 공개 HTML 이 없으므로 `{ "ok": true }` 만 준다.

```ts
type StaticRebuild = {
  id: string;
  action: 'publish' | 'apply' | 'unpublish' | 'delete';
  slug: string;
  revision: number;
  /** /i/{slug}/ */
  pagePath: string;
  /** /v1/invitations/{slug} */
  documentPath: string;
};
```

이 서버는 HTML 을 굽지 않는다. 성공 응답의 `staticRebuild` 와 8절 큐가, 프론트 빌드가 `/i/{slug}/index.html` 을 다시 만들 신호다. 하객 페이지는 그 정적 파일을 읽고, 요청 때 DB 를 보지 않는다. DB 가 죽어도 이미 CDN 에 있는 HTML 은 남는다. RSVP 만 `503` 이 될 수 있다.

### 5.5 초대장 설정

설정 화면(`/dashboard/[id]/settings`)이 읽는 값이다. editor-spec 11·6.2⑨·Q12·Q13 을 따른다. RSVP 를 끄는 스위치는 없다. 공용 RSVP 링크를 끄는 스위치도 없다. 슬러그는 사람이 고르지 못한다.

`GET /v1/editor/invitations/:id/settings`

영구 사용자만. 익명이면 `403 forbidden`, `reason: "login_required"`. 남의 초대장과 삭제된 초대장은 `404 not_found`.

```ts
type InvitationSettings = {
  id: string;
  slug: string;
  /** 항상 false. Q13. 본문에 slug 를 넣으면 400. */
  slugEditable: false;
  status: InvitationStatus;
  purgeAt: string | null;
  links: {
    invitePath: string;
    /** 발행 중일 때만. 평문 토큰은 소유자 응답에만. */
    rsvpLinkPath: string | null;
  };
  rsvp: {
    /** 항상 true. false 를 보내면 field "rsvp.enabled", reason "not_supported". */
    enabled: true;
    deadline: string | null;
    deadlineOverride: boolean;
    /** 발행 중이고 공용 토큰이 있을 때만 true. 본문에 이 키를 넣으면 reason "not_supported". */
    publicLinkEnabled: boolean;
  };
};
```

응답은 `{ "settings": InvitationSettings, "etag": string }` 이고 헤더 `ETag` 도 준다.

`PATCH /v1/editor/invitations/:id/settings`

`If-Match` 필수. 없으면 `400 validation`, `field: "if-match"`. 값이 다르면 `409 conflict` 와 현재 `invitation`(자동 저장과 같다).

```ts
type SettingsPatch = {
  rsvp: { deadline: string | null; enabled?: true };
};
```

`deadline: null` 은 덮어쓰기를 해제한다(예식 전날 23:59:59.999 KST). 예식 시작보다 늦으면 `field: "rsvp.deadline"`, `reason: "deadline_after_ceremony"`. 이 호출은 **작업 문서**만 바꾼다. 이미 발행된 스냅샷은 `apply` 전까지 유지되고, `hasUnpublishedChanges` 가 true 가 된다. 발행 취소·삭제는 5.4 의 `unpublish`·`DELETE` 다. 이 경로로 하지 않는다.

## 6. 사진

장당 최대 20MB. 형식 JPEG, PNG, WebP, HEIC/HEIF. 최대 10장. 짧은 변 800px 미만은 `lowQuality: true`(거절하지 않음).

### 6.1 업로드 URL

`POST /v1/editor/invitations/:id/photos/presign`

```ts
type PresignBody = {
  contentType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic' | 'image/heif';
  byteSize: number;
};

type PresignResult = {
  photoId: string;
  method: 'PUT';
  uploadUrl: string;
  headers: { 'Content-Type': string };
  expiresAt: string;          // 15분
};
```

R2 가 설정돼 있으면 `uploadUrl` 은 버킷 PUT 서명 URL 이다. 없으면 이 서버의 `PUT /v1/editor/uploads/:uploadToken` 이다(로컬·테스트). 토큰은 해시만 저장한다.

클라이언트는 그 URL 로 원본을 PUT 한다. 긴 변 2400px 리사이즈와 EXIF 회전은 클라이언트가 해도 되고, 서버가 한 번 더 맞춘다.

### 6.2 변환

`POST /v1/editor/invitations/:id/photos/:photoId/complete` 는 변환이 끝날 때까지 기다리지 않는다. 원본이 있으면 상태를 `processing` 으로 두고 **`202`** `{ "photo": EditorPhoto, "etag": string }` 을 바로 돌려준다. 이미 `ready` 거나 변환 중이면 같은 본문으로 `200` 이다. 10장을 한 요청에 붙잡지 않기 위해서다.

상태 조회:

- `GET /v1/editor/invitations/:id/photos` → `{ "etag", "photos": EditorPhoto[] }`
- `GET /v1/editor/invitations/:id/photos/:photoId` → `{ "etag", "photo": EditorPhoto }`

`status` 는 `processing` | `ready` | `failed`. `ready` 이거나, 다시 만드는 중에도 이전 변종이 있으면 `src` 와 `lqip` 가 있다. 새 파일이 준비되기 전에는 그 이전 변종을 보여 준다.

폴링: 업로드한 장만 1초 간격으로 위 GET 을 본다. 전부 `ready` 또는 `failed` 이면 멈춘다. 60초가 지나도 `processing` 이면 실패로 보고 다시 `complete` 할 수 있다. 두 GET 의 `etag` 는 그 초대장의 현재 `etag` 다. 변환이 끝나도 이 값은 바뀌지 않으므로, 폴링 뒤에 `If-Match` 를 갈아끼울 필요가 없다. 사진 추가·삭제·순서·포커스·크롭·필터를 저장할 때만 `etag` 가 바뀐다.

서버 파이프라인(`backend/src/photos/process.ts`)은 응답을 보낸 뒤 같은 프로세스에서 돈다. 프로세스가 죽으면 `npm run job:photos` 가 2분이 넘은 `processing|failed` 를 마스터로 다시 만든다.

1. EXIF 방향으로 돌리고 위치 등 메타데이터를 제거한다. 필터·크롭 전의 마스터를 `master.webp` 로 남긴다.
2. `crop`(0–1)으로 자른 뒤 색감 필터를 입힌다. `original` 그대로, `warm` 은 따뜻한 톤, `mono` 는 흑백. 필터는 사진마다다.
3. WebP 를 만든다. 너비 800, 1200, 1600(원본보다 키우지 않음), 썸네일 너비 400, LQIP(아주 작은 data URL).
4. 키는 `inv/{invitationId}/{photoId}/w800.webp` 같은 **상대 키**다. 하객 `src` 와 같다. 썸네일 키는 공개 JSON 에 넣지 않고 에디터에만 준다.
5. 브라우저가 올린 원본 키는 성공 뒤에 지운다. 마스터는 다시 크롭·필터할 때 쓴다.

HEIC 는 서버 libvips 가 HEIF 를 열 수 있을 때만 된다. 열지 못하면 그 사진만 `failed` 가 된다.

`DELETE /v1/editor/invitations/:id/photos/:photoId` → `204`. 객체 삭제는 같은 저장소 드라이버. 자동 저장 목록에서 빼는 것으로는 지우지 않는다.

## 7. 받는 사람 · 집계

영구 사용자만. 익명(미발행)은 `403 forbidden`.

이름: trim + NFC, 1–20자. editor-spec 의 30자는 하객 RSVP 상한(1–20)과 맞지 않아 **20으로 맞춘다**. 30자를 쓰려면 RSVP 상한도 같이 올려야 한다.

`POST /v1/editor/invitations/:id/recipients`

```ts
type AddRecipientsBody = { names: string[] };   // 한 명 또는 붙여넣기. 한 번에 최대 300
```

`201` `{ "recipients": Recipient[] }`. 같은 이름도 별도 행으로 만든다(경고는 프론트).

```ts
type Recipient = {
  id: string;
  name: string;
  revoked: boolean;
  /** /i/{slug}/g/{token}/ 평문은 소유자에게만. */
  path: string | null;
  response: { attending: boolean; companions: number; name: string | null; updatedAt: string } | null;
};
```

`POST .../recipients/:recipientId/reissue` — 버전을 올리고 옛 토큰 해시를 폐기 목록에 넣는다. 응답 행은 남는다. 옛 링크는 하객 계약대로 `revoked`.

`POST .../recipients/:recipientId/revoke` — 링크만 죽인다. 미응답 집계에서 빠진다.

`PATCH .../recipients/:recipientId` `{ "name": "..." }` — 명단 이름만. 이미 제출된 응답 이름은 바꾸지 않는다.

`GET /v1/editor/invitations/:id/rsvp`

```ts
type ChannelTotals = {
  attendingResponses: number;
  companionSum: number;
  attendingGuests: number;       // 그 채널의 참석 응답 × (1 + 동행)
  declined: number;
  /** personal 만 숫자. 명단이 없으면 null. invite·rsvp_link 는 항상 null. */
  unanswered: number | null;
};

type RsvpDashboard = {
  deadline: string | null;
  closed: boolean;
  totals: {
    attendingResponses: number;
    companionSum: number;
    attendingGuests: number;     // 세 채널 합. 참석 응답 × (1 + 동행)
    declined: number;
    unanswered: number | null;   // personal 과 같다. 명단이 없으면 null
  };
  /** 채널별 집계. 키는 personal | invite | rsvp_link. */
  byChannel: {
    personal: ChannelTotals;
    invite: ChannelTotals;
    rsvp_link: ChannelTotals;
  };
  byRecipient: Array<{
    recipientId: string;
    channel: 'personal';
    listName: string;
    responseName: string | null;
    status: 'unanswered' | 'attending' | 'declined';
    /** true 면 미응답·totals·byChannel.personal 에서 빠진다. 행은 남는다. */
    revoked: boolean;
    companions: number;
    updatedAt: string | null;
    path: string | null;
  }>;
  byPublicLink: {
    invite: PublicRsvpRow[];
    rsvpLink: PublicRsvpRow[];
  };
};

type PublicRsvpRow = {
  id: string;
  channel: 'invite' | 'rsvp_link';
  name: string;
  attending: boolean;
  companions: number;
  updatedAt: string;
  duplicateName: boolean;        // 같은 채널·같은 이름 2건 이상. 병합하지 않음
};
```

`totals` 는 `byChannel` 세 칸의 합이다. `unanswered` 만 `personal` 값을 쓴다. 폐기된 받는 사람은 `byChannel.personal` 과 `totals` 에 넣지 않는다. 미응답 목록은 `byRecipient` 에서 `revoked === false` 이고 `status === 'unanswered'` 인 행이다. 하객 화면에는 명단 이름을 그리지 않고, RSVP 이름 칸 미리 채우기에만 쓴다.

호스트가 응답을 고치는 API 는 없다.

공용 RSVP 토큰을 다시 발급하는 API 는 이번 초안에 없다. `/s/{token}` 은 출처 표식이고, 모르거나 폐기된 표식은 하객 API 가 404 로 본다.

## 8. 공개 JSON (빌드·ISR)

하객 계약 2절 그대로다. 받는 사람 이름·토큰·응답은 넣지 않는다.

`GET /v1/invitations` → `{ "slug": string }[]` (발행 중이고 아직 퍼지하지 않은 것만)

`GET /v1/invitations/:slug` → `200 Invitation` 또는 `404`.

이 두 경로는 인증이 없다. 프론트 `createApiGuestDataSource` 가 헤더 없이 부른다. 본문은 발행 시점의 스냅샷이라, 자동 저장만으로는 바뀌지 않는다.

`Cache-Control: public, max-age=60, stale-while-revalidate=86400`. CDN 이 이 값을 따르면 DB 가 잠깐 죽어도 직전 JSON 을 줄 수 있다. 정적 HTML 로 이미 구워진 페이지는 API 가 죽어도 그대로다. RSVP 만 `503` 이 될 수 있다.

### 8.1 정적 페이지를 다시 굽는 방법

하객 빌드는 `output: 'export'` 로 `/i/{slug}/index.html` 만 만든다. `/g/`, `/s/` 는 그 파일로 rewrite 하고, HTML 에는 받는 사람 이름·토큰·응답을 넣지 않는다(하객 계약 1절). 호스팅이 나중에 ISR 로 바뀌어도 같은 경로를 한 장만 다시 만든다.

브라우저는 배포 비밀을 갖지 않는다. 발행 응답의 `staticRebuild` 는 화면 안내용이고, 실제 재생성은 빌드 워커가 한다.

1. `STATIC_REBUILD_TOKEN` 을 이 서버와 워커에만 둔다. 비어 있으면 아래 경로는 `404 not_found`.
2. `GET /v1/rebuilds?limit=50` 헤더 `Authorization: Bearer <STATIC_REBUILD_TOKEN>`. 토큰이 다르면 `401 unauthorized`. `200 { "rebuilds": Array<StaticRebuild & { createdAt: string }> }`. 아직 ack 하지 않은 것만, 오래된 순이다.
3. 각 항목:
   - `publish`, `apply`: `GET documentPath`(인증 없음)로 공개 JSON 을 받아 `pagePath` 의 `index.html` 을 다시 쓴다. ISR 호스트라면 `pagePath` 를 `revalidatePath` 에 넘긴다.
   - `unpublish`, `delete`: 그 `pagePath` 를 정적 출력에서 뺀다. 다음 전체 내보내기는 `GET /v1/invitations` 에 슬러그가 없으면 그 페이지를 만들지 않는다.
4. `POST /v1/rebuilds/ack` `{ "ids": ["..."] }` 같은 Bearer. `200 { "acked": number }`. 워커가 파일을 쓴 뒤에 호출한다. 호출 전에는 큐에 남는다.
5. 게스트 요청 경로에서 DB 를 읽지 않는다. 그래서 DB 장애 중에도 마지막 HTML 이 보인다.

워커가 전체 `next build` 를 다시 돌려도 된다. 큐는 바뀐 슬러그만 골라 굽기 위한 것이다. 호스트별 deploy hook URL 은 이 서버가 호출하지 않는다. 호스팅이 정해지면 워커가 그 hook 을 치면 된다.

## 9. 보관 · 알림 · 상한

매일 03:00 KST (`npm run job:retention`, 운영에서는 `pg_cron` 이 같은 SQL 을 호출).

| 시점 | 동작 |
|---|---|
| 퍼지 7일 전 (설정 `purge_notice_lead_days`) | `host_notices` 행(대시보드 배너) + `notice_outbox` 행. `purge_notice_sent_at` |
| 예식일 + 30일 (KST 자정, `purge_delay_days`) | 사진·받는 사람·응답·폐기 토큰 삭제, R2 prefix 삭제, `purged_at` |
| 사용자가 삭제한 뒤 24시간 | 초대장 행까지 삭제 |
| 익명 사용자 생성 후 30일, 발행 이력이 없음 | `auth.users` 와 초안 삭제 |

퍼지에 **연락처·계좌·이름을 포함할지는 미정**이다. 설정으로 둔다. 기본값은 둘 다 포함하지 않는다(`purge_include_host_contact`, `purge_include_accounts` = false). 초대장 행(이름·날짜·인사말)은 남겨 끝난 행사 화면을 만들 수 있게 한다.

알림 채널도 설정이다. 기본 `dashboard,kakao_email`. 카카오 계정 이메일은 비즈앱이 없으면 오지 않는다. 아웃박스는 쌓이되, `KAKAO_EMAIL_WEBHOOK` 이 없으면 보내지 않고 상태만 `skipped` 로 남긴다. 채널을 `dashboard` 만으로 바꿀 수 있다.

`GET /v1/editor/notices` → `{ "notices": [{ "id", "invitationId", "kind": "purge_soon", "purgeAt", "message" }] }`

지출 상한은 `spend_cap_cents`(비우면 상한 없음)와 월간 카운터다. 상한에 닿으면 초안 생성·사진 presign 이 `503 spend_cap`. 클라우드 콘솔의 Supabase Spend Cap·R2 알림은 따로 켜야 한다(체크리스트). 이 카운터는 그 대시보드를 대신하지 않는다.

횟수 제한(기본값, 설정으로 조정):

| 동작 | 한도 |
|---|---|
| 초안 생성 | 사용자 20회/시간, IP 60회/시간 |
| 사진 presign | 사용자 60회/시간 |
| claim 티켓 | 사용자 10회/시간 |
| 하객 RSVP | 하객 계약·백엔드 README 의 값 |

## 10. 하객 RSVP 와의 경계

이 문서가 하객 제출을 다시 정의하지 않는다. 구현이 지키는 것만 적는다.

- 마감은 `rsvp_deadline_override` 가 없으면 예식 **전날 23:59:59.999 KST**. 그 시각은 포함하고 다음 밀리초부터 닫는다. 판단은 서버 `now()` 만.
- 개인 링크는 토큰 upsert. 공용(`invite`, `rsvp_link`)은 첫 성공에 `editKey` 를 한 번 준다. DB 에는 해시만.
- 유효한 개인 링크에는 Turnstile 이 없다. `invite` 와 `rsvp_link` 의 **첫 제출**은 시크릿이 설정된 환경에서 서버가 siteverify 한다. `responseId` 와 `editKey` 를 함께 보낸 수정은 토큰이 있어도 검사하지 않는다. 만료된 위젯 토큰이 수정을 막지 않게 하기 위해서다. 키가 틀리면 `edit_forbidden` 이다.
- 토큰·editKey 원문은 로그에 남기지 않는다. 남기더라도 해시 앞 8자만.

## 11. 이번 구현에 없는 것

- 결제, 유료 플랜, 광고 스크립트(자리는 `showAds` 만)
- 주소 검색·좌표 변환(프론트 또는 추후 프록시). 서버는 `lat`·`lng` 를 저장만 한다
- 카카오 공유·지도 SDK
- 정적 지도 프록시, OG 이미지 렌더(프론트 `generate-og`)
- 호스트별 deploy hook 호출. 재생성 신호는 `staticRebuild` 와 `GET /v1/rebuilds` 다(8.1). HTML 생성은 프론트 빌드가 한다
- 공용 RSVP 토큰 재발급, 응답 CSV, 신랑측·신부측 집계, 방명록
- 실카카오 메일 발송(아웃박스 + 웹훅 자리만)

## 12. 프론트와 맞춘 것

1. 자동 저장은 매번 `If-Match` 를 보낸다. 읽기·쓰기 응답은 현재 `etag` 를 헤더와 본문에 준다. 409 도 같다.
2. 발행 후 수정은 「반영」(`apply`) 전까지 하객 스냅샷을 유지한다.
3. 명단 이름은 1–20자다.
4. `givenName` 은 자동으로 채우지 않는다. 비어 있으면 발행이 `groom.givenName` / `bride.givenName` `required` 로 거절한다. 제안 값은 에디터가 보여 주고 사용자가 확인한다.
5. `addressDetail` 은 공개 `address` 한 줄에 공백으로 붙인다.
6. claim 티켓은 `sessionStorage` 키 `invife:claim-ticket`, 복귀 경로 `/edit/{id}/publish`. 로그인 화면 연결은 프론트가 나중에 잇는다.
7. `editKey` 가 있는 수정은 Turnstile 토큰을 무시한다. 첫 제출만 검사한다.
8. `attendingGuests` = 참석 응답 × (1 + 동행).
9. `complete` 는 `202` 와 `processing` 을 바로 준다. 상태는 `GET .../photos` 와 `GET .../photos/:photoId` 로 폴링하고, 응답에 현재 초대장 `etag` 가 있다(6.2). 변환이 끝나도 `etag` 는 그대로라 자동 저장 `If-Match` 를 새로 받지 않아도 된다.
10. 공개 slug 목록은 인증 없이 배열이다.
11. 사진 자동 저장은 `sort`, `focal`, `crop`, `filter` 를 받는다. `crop` 을 생략하면 전체 프레임 `{0,0,1,1}` 이다. 저장돼 있는 `crop`·`filter` 와 같으면 다시 만들지 않는다. 달라지면 다시 만들고, 그동안 이전 변종을 준다. 목록에서 빼도 삭제되지 않는다.
12. 자동 저장은 전화·계좌의 미완성을 받는다. 형식은 발행 때 필드 오류로 본다.
13. 카카오 첫 연결은 `linkIdentity({ provider: 'kakao' })` 다. 콜백 오류가 `Identity is already linked` 또는 `Identity is already linked to another user` 일 때만 익명 세션이 유지된다. 그 다음, `signInWithOAuth` 보다 먼저 `POST /v1/editor/claim-tickets` 를 호출한다(3.2).
14. 발행·반영·발행 취소·영구 사용자 삭제는 `staticRebuild` 를 준다. 페이지를 다시 굽는 절차는 8.1 이다. 하객 HTML 에 명단 이름을 넣지 않는다.
15. 설정 화면은 `GET/PATCH /v1/editor/invitations/:id/settings` 다. RSVP 끄기, 공용 RSVP 링크 끄기, 슬러그 변경은 `not_supported` 다. 마감만 작업 문서에 저장하고, 하객 화면은 `apply` 다음에 바뀐다.
16. 광고 스위치는 `PATCH /v1/editor/settings` 이고 어드민만 된다. `showAds` 식은 세션과 같다.
17. RSVP 집계의 `byChannel` 키는 `personal`, `invite`, `rsvp_link` 다. `totals` 는 그 합이다. 미응답은 폐기되지 않은 명단만 센다.

자유 크롭 UI 는 없다. 초점은 사진마다 저장하고, 크롭은 전체 프레임이다. `givenName` 발행 필수는 소유자 결정 전까지 지금 규칙(비어 있으면 거절)을 유지한다. 사진 최대 장수가 editor-spec 과 다른 곳은 프론트의 후속 diff 를 기다린다. 그 전까지 이 문서가 구현 기준이다.
