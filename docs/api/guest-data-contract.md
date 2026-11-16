# 하객 화면 데이터 계약 (DRAFT)

- 상태: **초안.** 백엔드와 맞추기 전이다. 필드 이름과 에러 코드는 바뀔 수 있다.
- 소비처: `frontend/src/domain/types.ts` (이 문서와 같은 모양). 페이지는 이 타입만 보고, 샘플/API 는 `GuestDataSource` 하나 뒤에 있다.
- 기준일: 2026-11-16. 받는 사람 링크의 기본 이름 모드는 `prefill-input` 이다. 디자인 스펙 Q6 와 같다.

하객 페이지는 초대장 본문을 빌드 때 정적 HTML 로 만든다. RSVP 제출만 API 를 친다. DB 가 멈춰도 초대장 글과 사진은 보인다.

## 1. 링크 세 종류

| 종류 | 경로 | RSVP |
|---|---|---|
| 공용 초대장 | `/i/{slug}/` | 기본은 폼 없이 안내 문구만. 응답 토큰을 HTML 에 넣지 않는다. |
| 받는 사람 초대장 | `/i/{slug}/g/{token}/` | 이름 영역은 설정값. 기본 `prefill-input`. |
| 공용 RSVP | `/i/{slug}/s/{token}/` | 이름 입력 필수. 초대장 본문도 같이 보여 준다. |

토큰이 없거나 초대장이 내려갔으면 404, `noindex`.

받는 사람 토큰이 폐기됐으면 초대장은 그대로 두고, RSVP 만 공용과 같이 이름을 다시 받는다. 폐기 전 이름은 화면에 내지 않는다. (스펙 Q9 제안. 아래 열린 질문)

`slug` 와 두 토큰은 서로 추측되지 않는 값이다.

## 2. 공개 초대장 JSON

`GET /v1/invitations/{slug}` → 200 `Invitation` 또는 404.

`rsvp.deadline` 은 **항상** ISO 8601 이다. `null` 이 없다. 제작자가 마감을 비우면 저장 시점에 예식 **전날 23:59 KST** 로 채운다. 하객 페이지는 비어 있는 마감을 계산하지 않는다.

```ts
type Invitation = {
  id: string;
  slug: string;
  theme: 'ivory' | 'sage' | 'mist';
  groom: { name: string; givenName: string; phone?: string };
  bride: { name: string; givenName: string; phone?: string };
  ceremony: {
    date: string;       // YYYY-MM-DD, KST 달력
    time?: string;      // HH:mm. 없으면 날짜만
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
  photos: Photo[];      // 첫 장 = 커버이자 갤러리 대표. 최대 10.
  transport?: { parking?: string; subway?: string; bus?: string; other?: string };
  accountsNote?: string;
  accounts: Account[];
  rsvp: { deadline: string };
};

type FamilySide = {
  relation: string;     // 아들, 딸, 장남, 차녀 …
  father?: Parent;
  mother?: Parent;
};

type Parent = {
  name: string;
  phone?: string;
  deceased?: boolean;                 // 사람마다
  deceasedStyle?: 'hanja' | 'hangul'; // deceased 이면 필수. hanja=故, hangul=고
};

type Photo = {
  id: string;
  width: number;
  height: number;
  focal: { x: number; y: number }; // 0–1
  src: { w800: string; w1200: string; w1600: string };
  lqip: string; // data URI
};

type Account = {
  id: string;
  side: 'groom' | 'bride';
  relation: string;
  holder: string;
  bank: string;
  number: string;
};
```

사진 `src` 가 `/` 나 `http` 로 시작하지 않으면 `NEXT_PUBLIC_R2_BASE_URL` 을 붙인다. 키가 없으면 그 이미지는 실패 자리(다시 불러오기)로 둔다.

고인인 부모는 연락 행을 만들지 않는다. 번호가 없는 사람도 행을 만들지 않는다. 계좌는 고인 여부와 상관없이, 입력돼 있으면 보여 준다.

## 3. 링크 해석

빌드가 경로를 만들 때 쓰는 초안. **공개 런타임에 열면 안 된다.** 받는 사람 이름이 들어 있다.

`GET /v1/guest/records/{slug}` → `InvitationRecord | 404`

```ts
type InvitationRecord = {
  invitation: Invitation;
  sharedRsvpToken: string;
  recipients: Array<{
    token: string;
    name: string;
    revoked: boolean;
    response: RsvpResponse | null;
  }>;
};

type RsvpResponse = {
  id: string;
  attending: boolean;
  companions: number; // 0–10, 본인 제외. 불참이면 0
  name: string;
  updatedAt: string;
};
```

`GET /v1/guest/static-params` → `{ slug: string; link: string[] }[]`  
`link` 는 `[]`(공용 초대장), `['g', token]`, `['s', sharedRsvpToken]`.

페이지 설정(초대장이 아님):

| 키 | 기본 | 의미 |
|---|---|---|
| `rsvpNameMode` | `prefill-input` | `hidden` · `show-name` · `prefill-input`. 받는 사람 링크에만 적용. |
| `sharedInvitationRsvp` | `notice` | `notice` 안내만 · `inline-form` 공용 초대장에 이름 입력 폼. |
| `endedEventAt` | `null` | `null` 이면 예식 **다음 날 00:00 KST**. ISO 면 모든 초대장에 그 시각. |

`prefill-input` 은 surface 박스에 `"{이름} 님으로 응답해요"` 를 보여주고, `"{이름} 님이 아니신가요?"` 를 누르면 입력이 열린다. 공용 RSVP·폐기된 토큰·`inline-form` 은 이 설정과 상관없이 빈 이름 입력이 필수(1–20자, 앞뒤 공백 제거)다.

## 4. RSVP 제출

`POST /v1/invitations/{slug}/rsvp`  
수정은 `PATCH` 같은 경로. 본문에 `responseId`.

```ts
type RsvpSubmitBody = {
  slug: string;
  linkType: 'shared-invitation' | 'personal' | 'shared-rsvp' | 'revoked-personal';
  token?: string;
  name?: string;
  attending: boolean;
  companions: number;
  responseId?: string;
  turnstileToken?: string;
};
```

성공 200:

```json
{ "response": { "id": "", "attending": true, "companions": 2, "name": "박하늘", "updatedAt": "" }, "edited": false }
```

| HTTP | code | 화면 |
|---|---|---|
| 400 | `validation` | 이름 필드 오류. 입력은 유지. |
| 403 | `revoked` | 개인 토큰이 폐기됨. 이름 입력으로 바꾼다. |
| 409 | `closed` | 마감. 폼을 닫고 마감 문구. |
| 429 | `rate_limited` | 「잠시 후 다시 시도해 주세요」. 입력은 유지. |
| 그 외 · 네트워크 | `network` | 「전달하지 못했어요. 입력한 내용은 그대로 있어요.」 |

마감 시각은 포함한다. 그 다음 순간부터 거절한다. 페이지는 로드된 기기의 KST 시계로 먼저 닫고, 제출 응답으로 확정한다.

Turnstile 은 공용 RSVP 링크에만 둔다. 사이트 키가 없으면 위젯 자리를 그리지 않고(샘플은 그대로 제출된다). 운영에서는 키가 있을 때만 토큰을 필수로 본다.

같은 기기의 공용 응답은 `localStorage` 의 응답 id 로 다시 연다. 다른 기기는 새 응답이다. API 가 없으면 샘플 클라이언트가 이 저장을 대신한다.

## 5. 테이블 스케치

초안이다. 인덱스와 RLS 는 구현 때 다시 잡는다.

| 테이블 | 핵심 컬럼 |
|---|---|
| `invitations` | `id`, `slug` unique, `owner_id`, `status` draft/published/unpublished/deleted, `theme`, 신랑·신부 이름·`given_name`·전화, `ceremony_date`, `ceremony_time` null, 장소·홀·주소·`lat`·`lng`, `greeting`, 교통 4칸, `accounts_note`, **`rsvp_deadline timestamptz not null`**, `published_at` |
| `invitation_families` | `invitation_id`, `side`, `relation`, `role` father/mother, `name`, `phone`, `deceased`, `deceased_style` |
| `invitation_photos` | `invitation_id`, `sort`, `focal_x`, `focal_y`, `width`, `height`, `url_800`, `url_1200`, `url_1600`, `lqip` |
| `invitation_accounts` | `invitation_id`, `side`, `sort`, `relation`, `holder`, `bank`, `account_number` |
| `recipients` | `invitation_id`, `name`, `token_hash`, `revoked_at` |
| `rsvp_responses` | `invitation_id`, `recipient_id` null(공용), `shared` boolean, `name`, `attending`, `companions` 0–10, `created_at`, `updated_at` |

공용 RSVP 토큰은 `invitations` 의 별도 컬럼(`shared_rsvp_token_hash`)으로 두는 쪽을 제안한다. 받는 사람 행과 섞지 않는다.

발행이 아닌 상태(`unpublished`, `deleted`, 없는 slug)는 404.

## 6. 환경 변수

`frontend/.env.example`

| 변수 | 없을 때 |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` 으로 OG·딥링크 appname 을 만든다. |
| `NEXT_PUBLIC_DATA_SOURCE` | `fixture` |
| `NEXT_PUBLIC_API_BASE_URL` | RSVP 는 샘플 저장. 있으면 그 오리진으로 제출. |
| `NEXT_PUBLIC_R2_BASE_URL` | 상대 사진 경로는 실패 자리. |
| `NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY` | 공유 버튼 비활성. |
| `NEXT_PUBLIC_KAKAO_REST_API_KEY` | 지도 실패 자리. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | 위젯을 그리지 않음. |

## 7. 열린 질문

1. **공용 초대장의 RSVP.** 스펙 Q1 은 아직 열려 있다. 지금은 `notice`(안내 문구만, 응답 토큰은 페이지에 없음). `sharedInvitationRsvp = inline-form` 으로 바꾸면 이름 입력 폼이 된다.
2. **공용 RSVP 페이지에 초대장 본문을 다 실을지.** 지금은 같은 섹션을 보여주고 폼만 다르다. 폼만 있는 짧은 페이지가 필요한지.
3. **이름 수정이 받는 사람 행을 바꾸는지, 응답 행만 바꾸는지.** 화면은 응답의 `name` 만 보낸다.
4. **폐기 토큰을 404 로 볼지**, 지금처럼 이름 입력으로 열지.
5. **`inline-form` 을 켜면** 공용 RSVP 토큰이 페이지에 실려 두 링크의 접근 통제가 약해진다. 그때는 Turnstile·횟수 제한만으로 충분한지.
6. **카카오 정적 지도.** REST 키를 브라우저 `Authorization` 으로 보낸다. CORS 가 막히면 실패 자리로 떨어진다. 키를 서버에서만 쓰고 이미지를 캐시해도 되는지, 약관은 아직 미확인(스펙 Q12).
7. **끝난 행사**는 이름·날짜·감사 문구만 둔다(스펙 Q8). 시각은 배포 설정 하나다. 초대장마다 컬럼이 필요한지.
8. **이름 모드**도 배포 설정 하나다. 초대장마다 다르게 둘지.
9. 식사 인원은 받지 않는다(스펙 Q5).
10. 고인 계좌는 입력되면 보여 준다(스펙 Q4).
