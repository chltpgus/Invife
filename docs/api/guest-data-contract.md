# 하객 화면 데이터 계약 (DRAFT)

- 상태: **초안.** 필드 이름은 백엔드와 한 번 더 맞춘다.
- 소비처: `frontend/src/domain/types.ts`. 빌드는 `GuestDataSource`(공개 초대장만). 참석 칸은 `RsvpClient`.
- 기준일: 2026-11-16.

초대장 글과 사진은 슬러그마다 HTML 하나로 만든다. 받는 사람 이름, 기존 응답, 토큰은 HTML 에 넣지 않는다. DB 가 멈춰도 초대장 글과 사진은 보인다. 참석 칸만 API 를 친다.

정적 내보내기(`output: 'export'`)는 그대로 둔다. ISR 은 1주차에 호스트를 정한 뒤 다시 본다.

## 1. 링크 세 종류

| 종류 | 브라우저 경로 | channel | RSVP |
|---|---|---|---|
| 공용 초대장 | `/i/{slug}/` | `invite` | 이름 입력 + 참석 + 동행 + Turnstile. 토큰 없음. |
| 받는 사람 초대장 | `/i/{slug}/g/{token}/` | `personal` | 이름 미리 채움 + 「OO 님이 아니신가요?」. Turnstile 없음. |
| 공용 RSVP | `/i/{slug}/s/{token}/` | `rsvp_link` | 이름 입력 + Turnstile. `token` 은 출처 표식이지 비밀이 아니다. |

빌드는 `/i/{slug}/index.html` 만 만든다. `/g/*` 와 `/s/*` 는 **같은 파일로 내부 rewrite** 한다. 브라우저는 원래 주소를 유지해야 한다. 리다이렉트(302)가 아니다.

| 호스트 | 설정 |
|---|---|
| `next dev` | `next.config.ts` 의 `rewrites` |
| Cloudflare Pages, Netlify | `frontend/public/_redirects` (`200` rewrite) |
| Vercel | `vercel.json` 의 `rewrites`: `/i/:slug/g/:token` → `/i/:slug`, `/i/:slug/s/:token` → `/i/:slug` (슬래시 있는 경로도 같게) |
| nginx | `rewrite ^/i/([^/]+)/(g\|s)/[^/]+/?$ /i/$1/ last;` |

빌드가 끝나면 `[slug]` 청크 폴더를 `slug` 로 바꾸고 HTML 의 `%5Bslug%5D` 참조도 고친다. 대괄호 경로를 404 로 주는 호스트에서는 글은 보이는데 클릭이 전부 죽는다.

토큰이 없거나 초대장이 내려갔으면 404, `noindex`. 없는 토큰도 404. 폐기된 받는 사람 토큰은 초대장을 연 뒤 RSVP 만 공용과 같이 빈 이름 + Turnstile 이다. 폐기 전 이름과 응답은 보여 주지 않는다.

토큰은 서버에서 해시로만 저장한다. 페이지가 읽는 공개 JSON 에는 없다.

## 2. 공개 초대장 JSON

`GET /v1/invitations` → `{ slug: string }[]`  
`GET /v1/invitations/{slug}` → 200 `Invitation` 또는 404.

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
  families: { groom?: FamilySide; bride?: FamilySide };
  photos: Photo[];      // 첫 장 = 커버이자 갤러리 대표. 최대 10.
  transport?: { parking?: string; subway?: string; bus?: string; other?: string };
  accountsNote?: string;
  accounts: Account[];
  rsvp: { deadline: string };
};
```

`rsvp.deadline` 은 서버가 계산한 ISO 8601 이다. 저장 컬럼이 아니다. 제작자가 덮어쓰지 않으면 예식 **전날 23:59:59.999 KST** 다. 그 시각은 포함하고, 다음 밀리초부터 닫는다. 참석 칸이 열리면 맥락 API 의 `deadline` 이 이 값보다 우선한다.

사진 `src` 는 R2 상대 키다. `NEXT_PUBLIC_R2_BASE_URL` 을 붙인다. 베이스가 없으면 `/` + 키(로컬 `public/`)다.

고인인 부모는 연락 행을 만들지 않는다. 번호가 없는 사람도 행을 만들지 않는다. 계좌는 고인 여부와 상관없이, 입력돼 있으면 보여 준다.

## 3. 참석 맥락

참석 칸이 열리면 `POST /functions/v1/rsvp-context` (`cache: no-store`).

```ts
type RsvpContextRequest = { slug: string; token?: string };

type RsvpContext = {
  status: 'open' | 'closed';
  deadline: string;
  link: 'personal' | 'invite' | 'rsvp_link';
  revoked?: boolean;
  prefillName?: string;
  response?: RsvpResponse | null;
};
```

- `invite`: 토큰을 보내지 않는다. `prefillName` 도 없다.
- `personal`: `prefillName` 과 그 사람의 `response`. 폐기는 `revoked: true` 만 주고 이름·응답은 없다.
- `rsvp_link`: 출처 표식 토큰. 응답 본문은 이 기기의 `localStorage` 에 있다.
- 없는 토큰·없는 슬러그: 404.

끝난 행사인지는 빌드 시각이 아니라 브라우저 시계로 예식 다음 날 00:00 KST(또는 배포 설정의 한 시각)와 비교한다.

## 4. RSVP 제출

`POST /functions/v1/rsvp` 한 번. PATCH 는 없다.

```ts
type RsvpSubmitBody = {
  slug: string;
  channel: 'personal' | 'invite' | 'rsvp_link';
  token?: string;
  name?: string;
  attending: boolean;
  companions: number;
  responseId?: string;
  editKey?: string;
  turnstileToken?: string;
};
```

- 개인 링크는 토큰으로 upsert. 받는 사람당 응답 하나. 이름을 고쳐도 **응답 행의 이름만** 바뀐다. 받는 사람 이름은 호스트만 고친다.
- `invite` 와 `rsvp_link` 는 첫 성공에 일회용 `editKey` 를 준다. 이 기기는 `{responseId, editKey, response}` 를 `localStorage` 에 둔다. 키는 슬러그 기준이다. `invife:rsvp:{slug}:invite`, `invife:rsvp:{slug}:rsvp_link:{token}`. 고칠 때는 `responseId` 와 `editKey` 를 같이 보낸다.
- 불참이면 `companions` 는 0 이어야 한다.
- 이름은 trim + NFC, 1–20 코드 포인트.
- Turnstile 은 `invite`, `rsvp_link`, 폐기된 개인 링크에만. 개인 링크(유효)에는 없다. 사이트 키가 없으면 위젯을 그리지 않는다.

성공 200:

```json
{ "response": { "id": "", "attending": true, "companions": 0, "name": "", "updatedAt": "" }, "edited": false, "editKey": "" }
```

`editKey` 는 공용 채널의 첫 응답에만 있다.

오류는 HTTP 상태와 `body.error.code` 를 같이 본다.

| HTTP | code | 화면 |
|---|---|---|
| 400 | `validation` | `error.field` · `error.reason`. 이름이면 이름 칸만. 그 외는 이름 칸을 열지 않고 배너. |
| 403 | `turnstile_failed` | 위젯을 다시 그린다. |
| 403 | `edit_forbidden` | 「이 기기에서는 응답을 수정할 수 없어요.」 |
| 404 | `not_found` | 초대장 없음과 같은 404. |
| 409 | `closed` | 폼을 닫고 마감 문구. |
| 410 | `revoked` | 공용과 같은 빈 이름 + Turnstile. 이전 이름·응답은 지운다. |
| 429 | `rate_limited` | 「잠시 후 다시 시도해 주세요」. `Retry-After` 초가 있으면 같이 보여 준다. |
| 503 | `unavailable` | 「지금은 응답을 받을 수 없어요.」 |
| 그 외 · 네트워크 | | 「전달하지 못했어요. 입력한 내용은 그대로 있어요.」 |

## 5. 테이블 스케치

초안이다. 인덱스와 RLS 는 구현 때 다시 잡는다.

| 테이블 | 핵심 컬럼 |
|---|---|
| `invitations` | `id`, `slug` unique, `owner_id`, `status` draft/published/unpublished/deleted, `theme`, 신랑·신부 이름·`given_name`·전화, `ceremony_date`, `ceremony_time` null, 장소·홀·주소·`lat`·`lng`, `greeting`, 교통 4칸, `accounts_note`, `rsvp_deadline` **null 이면 예식 전날로 계산**, `published_at` |
| `invitation_families` | `invitation_id`, `side`, `relation`, `role` father/mother, `name`, `phone`, `deceased`, `deceased_style` |
| `invitation_photos` | `invitation_id`, `sort`, `focal_x`, `focal_y`, `width`, `height`, R2 키 세 개, `lqip` |
| `invitation_accounts` | `invitation_id`, `side`, `sort`, `relation`, `holder`, `bank`, `account_number` |
| `recipients` | `invitation_id`, `name`, `token_hash`, `revoked_at` |
| `rsvp_responses` | `invitation_id`, `recipient_id` null(공용), `channel` personal/invite/rsvp_link, `name`, `attending`, `companions` 0–10, `edit_key_hash` null(개인), `created_at`, `updated_at` |

공용 RSVP 출처 표식도 해시로 둔다. 평문 토큰은 응답에 실지 않는다. 발행이 아닌 상태(`unpublished`, `deleted`, 없는 slug)는 404.

## 6. 리퍼러와 지도

`/i/*` 는 `Referrer-Policy: no-referrer`. 페이지 `<meta name="referrer">` 와 호스트 헤더를 같이 둔다. Cloudflare/Netlify 는 `frontend/public/_headers`. nginx 는 `add_header Referrer-Policy no-referrer;`. Vercel 은 `vercel.json` 의 `headers` 에서 `/i/(.*)`.

지도는 카카오 맵 JavaScript SDK 다. `NEXT_PUBLIC_KAKAO_MAP_KEY` 는 도메인이 등록된 **JavaScript 키**다. `NEXT_PUBLIC_KAKAO_REST_API_KEY`(로그인 client_id)는 쓰지 않는다. 키가 없거나 SDK 가 실패하면 핀과 「지도를 불러오지 못했어요」만 남기고, 주소 복사와 지도 앱 버튼은 그대로다. 키를 브라우저에 두기 싫으면 서버가 정적 지도를 대신 받아 캐시하는 프록시를 쓸 수 있다. 약관은 아직 미확인이다.

## 7. 환경 변수

`frontend/.env.example`

| 변수 | 없을 때 |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` |
| `NEXT_PUBLIC_DATA_SOURCE` | `fixture` |
| `NEXT_PUBLIC_API_BASE_URL` | 샘플 RSVP. 있으면 `{base}/functions/v1/rsvp-context` 와 `.../rsvp` |
| `NEXT_PUBLIC_R2_BASE_URL` | 사진 키를 `/` 아래로 |
| `NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY` | 공유 버튼 비활성 |
| `NEXT_PUBLIC_KAKAO_MAP_KEY` | 지도 실패 자리 |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | 위젯을 그리지 않음 |

## 8. 결정과 남은 질문

결정:

1. **공용 초대장 RSVP 는 인라인 폼.** 오너 결정. `channel: invite`, 토큰 없음, Turnstile 과 요청 제한. `sharedInvitationRsvp` 스위치와 안내 문구만 있는 변종은 없다.
2. **이름 수정은 응답 행만.** 받는 사람 이름은 호스트 화면의 것이다.
3. **폐기 토큰은 410**, 공용과 같은 RSVP. 없는 토큰은 404.
4. **마감 컬럼은 초대장마다 두지 않는다.** `ceremony_date` 로 계산하고, 덮어쓴 값만 저장한다. 응답에는 항상 계산된 `deadline` 이 있다.
5. 이름 칸 모드(`rsvpNameMode`)는 없다. 받는 사람 링크는 미리 채우기 한 가지다.
6. 식사 인원은 받지 않는다. 고인 계좌는 입력되면 보여 준다.

남은 질문:

1. 공용 RSVP(`/s/`) 페이지에 초대장 본문을 다 실을지. 지금은 같은 셸이다.
2. 끝난 행사 시각을 초대장마다 둘지. 지금은 배포 설정 하나이고, 비교는 브라우저에서 한다.
3. 카카오 지도를 서버 프록시로 바꿀지. 지금은 JS SDK 다.
