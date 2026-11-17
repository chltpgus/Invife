# 제작자(에디터) API 계약 (DRAFT)

- 상태: **초안.** 프론트와 맞춰 가는 문서다. 구현은 이 문서를 따른다.
- 기준: [`editor-spec.md`](../design/editor-spec.md), [`mvp-plan.md`](../planning/mvp-plan.md), [`guest-data-contract.md`](./guest-data-contract.md). 하객 계약과 어긋나면 하객 계약이 이긴다.
- 소비처: 제작 화면 `/new`, `/edit/[id]`, `/dashboard`. 하객 페이지는 이 API를 부르지 않는다.
- 기준일: 2026-11-17.

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
| 403 | `forbidden` | 소유자가 아님, 익명이 발행·명단을 시도 |
| 403 | `claim_invalid` | 이전 티켓이 없거나 만료·사용됨 |
| 404 | `not_found` | 없는 초대장, 남의 초대장(존재 여부를 숨김) |
| 409 | `conflict` | `If-Match` 의 `updatedAt` 이 서버보다 낡음 |
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

## 3. 로그인과 초안 이전

프론트가 Supabase 클라이언트로 직접 한다. 이 API는 세션을 만들지 않는다.

1. 「무료로 만들기」→ `signInAnonymously()`. 실패하면 인라인 오류. 서버는 익명 가입에 Turnstile 을 붙이지 않는다(Turnstile 은 하객 공용 채널만). 남용은 IP·사용자당 초안 생성 횟수로 막는다.
2. 발행 직전, 익명이면 `linkIdentity({ provider: 'kakao' })`. 같은 사용자 id 가 영구 계정이 된다. 초대장 `owner_id` 는 그대로다.
3. 그 카카오 계정이 **이미 있으면** `linkIdentity` 는 실패한다(Manual linking 은 베타이고, 이미 있는 identity 에는 붙지 않는다). 이때 익명 세션은 유지된다. 프론트는 다이얼로그 「이 카카오 계정은 이미 Invife에 가입돼 있어요. 이 초안을 그 계정으로 옮길까요?」를 띄운다.

옮기기:

1. 아직 익명 세션인 동안 `POST /v1/editor/claim-tickets` `{ "invitationIds": ["..."] }` → `201 { "ticket": "<원문 한 번>", "expiresAt": "<15분>" }`. 티켓은 그 익명 사용자가 소유한 초안만 묶는다. 평문은 응답에만 있고 DB 에는 sha256 만 있다. `sessionStorage` 키 `invife:claim-ticket`.
2. `signInWithOAuth({ provider: 'kakao' })` 로 기존 계정에 로그인한다. 리다이렉트 복귀 주소는 프론트 경로 `/edit/{id}/publish` 로 둔다.
3. 영구 세션으로 `POST /v1/editor/drafts/claim` `{ "ticket": "..." }` → `200 { "invitations": [{ "id", "slug" }] }`. `owner_id` 가 바뀐다. 티켓은 1회용이다.
4. 이어서 발행한다.

취소하면 아무것도 호출하지 않는다. 익명 초안은 그 브라우저에 남는다.

대시보드의 「이미 만든 청첩장 보기」는 카카오 로그인만 하고 claim 을 하지 않는다.

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
  lowQuality: boolean;
  src: { w800: string; w1200: string; w1600: string; thumb: string } | null;
  lqip: string | null;
};
```

빈 문자열은 「아직 없음」이다. 하객 화면에서는 비어 있는 선택 블록을 숨긴다. 공개 `Invitation` 에는 빈 값을 넣지 않는다(하객 계약 2절).

`givenName` 을 비운 채 발행하면 서버가 이름에서 첫 글자를 뺀 값으로 채운다. 복성·외자 오류를 피하려면 프론트가 서명용 칸을 따로 보내는 편이 낫다(editor-spec Q7).

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
};
```

`unanswered` 는 폐기되지 않은 받는 사람이 있을 때만 숫자다. 명단이 없으면 `null`(카드 대신 안내).

`GET /v1/editor/invitations/:id` → `{ "invitation": EditorInvitation }`

삭제된 초대장과 남의 초대장은 `404 not_found`.

### 5.3 자동 저장

`PATCH /v1/editor/invitations/:id`

보낸 필드만 바꾼다. 없는 필드는 유지다. `families`, `accounts`, `photos`(메타만)를 보내면 그 배열은 **통째로 교체**다.

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
  photos?: Array<{ id: string; sort: number; focal?: { x: number; y: number } }>;
  rsvp?: { deadline?: string | null };   // null 이면 덮어쓰기 해제(예식 전날로 계산)
};
```

낙관적 잠금(선택): `If-Match: "<updatedAt>"`. 어긋나면 `409 conflict`. 헤더가 없으면 마지막 저장이 이긴다. 저장 성공의 `updatedAt` 을 다음 요청에 쓴다.

`200` `{ "invitation": EditorInvitation }`.

자동 저장은 **작업 중인 문서**만 바꾼다. 이미 발행된 초대장이라도 하객이 보는 스냅샷(`published_document`)은 바뀌지 않는다. `hasUnpublishedChanges` 가 true 가 된다. 하객 화면은 「변경 사항 반영」(`apply`) 또는 첫 발행 때만 바뀐다. 디바운스 800ms·최대 5초·blur 즉시 저장은 프론트 규칙이다(editor-spec 7장).

발행 후에도 시간·장소·계좌를 포함한 **모든 필드**를 고칠 수 있다. 링크(`slug`, 이미 나간 개인 토큰)는 유지된다(editor-spec Q17 임시 처리).

검증(자동 저장, 발행보다 느슨하다):

| 필드 | 규칙 |
|---|---|
| 신랑·신부 이름 | 0–10자. 발행 때는 2–10 |
| givenName | 0–10자 |
| 전화 | 비거나, 숫자와 `-` 만, 숫자 8–15개 |
| 예식장 | 0–30자 |
| 홀 | 0–20자 |
| 주소·상세 | 주소 0–120, 상세 0–40 |
| 인사말 | 0–300자 |
| 교통 각 칸 | 0–100자 |
| 계좌 안내 | 0–80자 |
| 혼주 이름 | 0–10, 관계 0–6 |
| 계좌 | 측마다 최대 3. 예금주 0–20, 번호는 숫자·`-` 와 숫자 8–20개 |
| 초점 | 0–1. 기본 (0.5, 0.4) |
| 마감 덮어쓰기 | 예식 시작(날짜+시간, KST)보다 늦으면 `validation` |
| 고인 | `deceased` 인데 `deceasedStyle` 이 없으면 발행 때 `validation`. 자동 저장은 허용(체크 직후 라디오 전) |
| 사진 장 수 | 메타 배열도 최대 10 |

10분 단위 시간은 프론트만 지킨다. 서버는 `HH:mm` 이면 받는다. 「오늘 이후」도 프론트 검증이다. 서버는 달력 날짜이기만 하면 저장한다(지난 예식 수정·시드).

### 5.4 발행 · 반영 · 발행 취소 · 삭제

발행 필수: 신랑·신부 이름, 날짜, 시간, 예식장, 주소, 대표 사진 1장이 `ready`. 고인이면 표기 방식. 계좌는 한 칸이라도 채웠으면 관계·예금주·은행·번호를 모두.

`POST /v1/editor/invitations/:id/publish`

초안이거나 발행 취소된 초대장을 공개한다. 영구 사용자만. 익명이면 `403 forbidden` + `reason: "login_required"`. 같은 `slug`. 공유 RSVP 토큰이 없으면 만든다. `200` `{ "invitation": EditorInvitation }`.

`POST /v1/editor/invitations/:id/apply`

발행 중인 문서의 하객 스냅샷을 작업 문서로 바꾼다. 영구 사용자만. `slug` 와 개인 링크는 유지. 마감을 이미 지난 시각으로 당기면 즉시 마감된다(확인 문구는 프론트). `200` 동일.

`POST /v1/editor/invitations/:id/unpublish`

하객 GET 과 RSVP 가 `404`. 사진·응답·슬러그는 남는다. 다시 `publish` 하면 같은 링크다.

`DELETE /v1/editor/invitations/:id`

```ts
type DeleteBody = { confirm?: string };
```

발행·발행 취소 상태는 본문 `confirm: "삭제"` 가 있어야 한다. 초안은 본문 없이 지운다. 즉시 `deleted`(공개 404). 행·R2 객체는 24시간 안에 하드 삭제한다.

발행은 정적 페이지를 직접 빌드하지 않는다. 공개 JSON 이 바뀌면 프론트·호스트가 ISR·재배포로 갱신한다(호스팅은 1주차 미결정). DB 가 죽어도 이미 올라간 HTML 은 CDN 에 남는다.

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

`POST /v1/editor/invitations/:id/photos/:photoId/complete` → `200` `{ "photo": EditorPhoto }`

서버 파이프라인(`backend/src/photos/process.ts`, complete 요청 안에서 동기 실행):

1. EXIF 방향으로 돌리고 위치 등 메타데이터를 제거한다.
2. 색감 필터를 입힌다. `original` 그대로, `warm` 은 따뜻한 톤, `mono` 는 흑백. 초대장의 `photoFilter` 를 10장에 같이 쓴다.
3. WebP 를 만든다. 너비 800, 1200, 1600(원본보다 키우지 않음), 썸네일 너비 400, LQIP(아주 작은 data URL).
4. 키는 `inv/{invitationId}/{photoId}/w800.webp` 같은 **상대 키**다. 하객 `src` 와 같다. 썸네일 키는 공개 JSON 에 넣지 않고 에디터에만 준다.
5. 다시 만들 수 있게 메타데이터를 뺀 마스터를 `master.webp` 로 남긴다. 브라우저 원본 키는 지운다.

`photoFilter` 를 바꾸면 기존 `ready` 사진을 다시 큐에 넣고, 같은 파이프라인이 변종을 다시 만든다. 별도 워커는 아직 없다. 실패한 건 `npm run job:photos` 가 `processing|failed` 를 다시 돈다. HEIC 는 서버 libvips 가 HEIF 를 열 수 있을 때만 된다. 로컬에서 안 열리면 `400 validation` + `reason: "unsupported_image"`.

`DELETE /v1/editor/invitations/:id/photos/:photoId` → `204`. 객체 삭제는 같은 저장소 드라이버.

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
type RsvpDashboard = {
  deadline: string | null;
  closed: boolean;
  totals: {
    attendingResponses: number;
    companionSum: number;
    attendingGuests: number;     // 참석 응답 × (1 + 동행)
    declined: number;
    unanswered: number | null;   // 명단이 없으면 null
  };
  byRecipient: Array<{
    recipientId: string;
    listName: string;
    responseName: string | null;
    status: 'unanswered' | 'attending' | 'declined';
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
  name: string;
  attending: boolean;
  companions: number;
  updatedAt: string;
  duplicateName: boolean;        // 같은 채널·같은 이름 2건 이상. 병합하지 않음
};
```

호스트가 응답을 고치는 API 는 없다.

공용 RSVP 토큰을 다시 발급하는 API 는 이번 초안에 없다. `/s/{token}` 은 출처 표식이고, 모르거나 폐기된 표식은 하객 API 가 404 로 본다.

## 8. 공개 JSON (빌드·ISR)

하객 계약 2절 그대로다. 받는 사람 이름·토큰·응답은 넣지 않는다.

`GET /v1/invitations` → `{ "slug": string }[]` (발행 중이고 아직 퍼지하지 않은 것만)

`GET /v1/invitations/:slug` → `200 Invitation` 또는 `404`.

이 두 경로는 인증이 없다. 프론트 `createApiGuestDataSource` 가 헤더 없이 부른다. 본문은 발행 시점의 스냅샷이라, 자동 저장만으로는 바뀌지 않는다.

`Cache-Control: public, max-age=60, stale-while-revalidate=86400`. CDN 이 이 값을 따르면 DB 가 잠깐 죽어도 직전 JSON 을 줄 수 있다. 정적 HTML 로 이미 구워진 페이지는 API 가 죽어도 그대로다. RSVP 만 `503` 이 될 수 있다.

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
- 유효한 개인 링크에는 Turnstile 이 없다. `invite` 와 `rsvp_link` 의 새 제출은 시크릿이 설정된 환경에서 서버가 siteverify 한다. `editKey` 가 맞는 수정은 Turnstile 을 다시 요구하지 않는다.
- 토큰·editKey 원문은 로그에 남기지 않는다. 남기더라도 해시 앞 8자만.

## 11. 이번 구현에 없는 것

- 결제, 유료 플랜, 광고 스크립트(자리는 `showAds` 만)
- 주소 검색·좌표 변환(프론트 또는 추후 프록시). 서버는 `lat`·`lng` 를 저장만 한다
- 카카오 공유·지도 SDK
- 정적 지도 프록시, OG 이미지 렌더(프론트 `generate-og`)
- ISR·CDN purge 호출(호스팅 결정 전). 공개 JSON 과 `Cache-Control` 만 제공
- 공용 RSVP 토큰 재발급, 응답 CSV, 신랑측·신부측 집계, 방명록
- 실카카오 메일 발송(아웃박스 + 웹훅 자리만)

## 12. 프론트에 묻는 것

1. 자동 저장 `If-Match` 를 매 요청에 넣을지, 충돌 배너가 있을 때만 넣을지.
2. 발행 후 수정은 이 초안처럼 「반영」 버튼 전까지 하객 스냅샷을 유지하는 쪽으로 확정할지.
3. 명단 이름을 20자로 맞춘 것(위 7절)을 받아들일지.
4. `givenName` 자동 채움(첫 글자 제거)을 쓸지, 발행 전에 프론트가 항상 보낼지.
5. `addressDetail` 을 공개 `address` 한 줄로 합치는 방식이 맞는지.
6. claim 티켓을 `sessionStorage`(`invife:claim-ticket`)에 두는 방식이 카카오 리다이렉트와 맞는지. 복귀 경로를 `/edit/{id}/publish` 로 봐도 되는지.
7. `editKey` 수정에 Turnstile 을 생략하는 것(10절). 위젯은 수정 화면에도 있으므로, 토큰이 오면 검사하고 없으면 통과시킨다.
8. 목록 카드의 `rsvp.attendingGuests` 정의(참석 응답 + 동행, 본인 포함)가 12.2 요약과 같은지.
9. 사진 complete 가 수 초 동기 응답인 점을 업로드 UI(「변환 중…」)에 둘지. 실패 시 `photo.status = failed` 로 폴링하지 않고 complete 응답만 보면 되는지.
10. 공개 목록 `GET /v1/invitations` 가 인증 없이 slug 배열을 주는 것(현 프론트와 동일). 빌드 키를 필수로 바꿀지는 호스팅 때 다시 본다.
