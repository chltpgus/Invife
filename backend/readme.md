# Invife 백엔드

하객 RSVP, 제작자 에디터, 공개 초대장 JSON을 한 Node 서버에서 제공한다. 데이터베이스와 로그인은 Supabase(Postgres + Auth)다. 사진 변환은 이 프로세스의 `sharp`가 한다.

경로는 프론트가 이미 쓰는 베이스를 그대로 둔다.

- `POST /functions/v1/rsvp-context`
- `POST /functions/v1/rsvp`
- `GET /v1/invitations`
- `GET /v1/invitations/:slug`
- 에디터는 [`docs/api/editor-api-contract.md`](../docs/api/editor-api-contract.md)

하객 응답 형식은 [`docs/api/guest-data-contract.md`](../docs/api/guest-data-contract.md)가 기준이다.

## 로컬에서 돌리기

의존성:

```bash
cd backend
npm install
```

### Supabase CLI (Docker 가 있을 때)

```bash
npx supabase start
npx supabase status
```

`supabase/config.toml`은 익명 로그인과 manual linking을 켜 둔다. 나온 DB URL·JWT secret을 `.env`에 넣는다. 예시는 `.env.example`.

```bash
npm run db:migrate
npm run seed:demo
npm run dev
```

마이그레이션은 **슈퍼유저**로 적용한다. `security definer` 함수 소유자가 테이블 소유자가 아니면 하객 RPC가 RLS에 막힌다. `ADMIN_DATABASE_URL`이 그 접속이다. 앱 런타임은 `DATABASE_URL`의 `invife_app`(NOINHERIT, RLS 적용)이다.

`supabase/testing/auth-stub.sql`은 순정 Postgres용이다. `auth.uid()`가 이미 있으면 마이그레이션 스크립트가 이 파일을 건너뛴다. 실제 Supabase에 적용하면 `auth.uid()`가 바뀐다.

### Docker 없이 (이 저장소의 자동 테스트와 같은 방법)

Postgres 16과 역할 `invife_app`(로그인, 비밀번호 `invife_app`)만 있으면 된다.

```bash
export ADMIN_DATABASE_URL=postgres://ubuntu@/invife_test?host=/var/run/postgresql
export DATABASE_URL=postgres://invife_app:invife_app@127.0.0.1:5432/invife_test
export SUPABASE_JWT_SECRET=local-dev-jwt-secret-change-me
export INVIFE_LINK_SECRET=local-dev-link-secret-change-me
npm run db:migrate
npm test
npm run dev
```

`npm test`는 `invife_test` 데이터베이스를 지우고 다시 만든다. 로컬 Postgres의 `ubuntu` 슈퍼유저와 유닉스 소켓(`/var/run/postgresql`)을 쓴다.

## 환경 변수

| 이름 | 역할 |
|---|---|
| `DATABASE_URL` | 앱 역할 `invife_app` |
| `ADMIN_DATABASE_URL` | 마이그레이션·시드·보관 작업의 슈퍼유저 |
| `SUPABASE_JWT_SECRET` | Auth 가 서명하는 access token 검증 |
| `INVIFE_LINK_SECRET` | 개인·공용 RSVP 토큰 HMAC. DB에는 SHA-256만 저장 |
| `TURNSTILE_SECRET_KEY` | 비우면 로컬에서 검사를 생략. 운영에서는 필수 |
| `R2_*` | 넷이 모두 있으면 서명 URL. 아니면 `PUT /v1/editor/uploads/:token` |
| `KAKAO_EMAIL_WEBHOOK` | 비우면 삭제 안내 메일은 outbox에 `skipped` |
| `CORS_ORIGINS` | 쉼표로 구분. `Retry-After`를 노출한다 |
| `RATE_LIMIT_*` | 비우면 계약의 기본 횟수 |

토큰·시크릿·하객 이름은 로그에 남기지 않는다. 오류 응답은 `error.code`만 내려 준다.

## 사진

`POST .../photos/:id/complete` 는 `202` 로 바로 돌아오고, 변환은 그 다음 같은 프로세스에서 돈다. 상태는 `GET /v1/editor/invitations/:id/photos` 로 본다. 크롭과 필터는 변종에 구워지며, 다시 만드는 동안 이전 파일을 그대로 준다. 파이프라인은 `src/photos/process.ts`다.

1. 원본을 회전하고 가로 2400 이하의 WebP 마스터로 둔다. 필터는 마스터에 넣지 않는다.
2. 800 / 1200 / 1600 / 썸네일(400) WebP에 `original` · `warm` · `mono`를 적용한다.
3. 16px LQIP data URL을 만든다. 짧은 변이 800 미만이면 `lowQuality`만 표시하고 거절하지는 않는다.
4. 원본 객체는 지운다.

R2가 없으면 파일은 `DATA_DIR` 아래 `inv/{invitationId}/{photoId}/`에 있다. 실패한 건은 `npm run job:photos`가 마스터가 있을 때 변종만 다시 만든다. HEIC는 서버 libvips가 HEIF를 열 수 있을 때만 된다.

## 보관

`npm run job:retention` → `public.run_retention`.

- 안내 시각: 삭제 예정일 `purge_delay_days`(기본 30)에서 `purge_notice_lead_days`(기본 7)일 전. 이미 지났어도 한 번은 안내한 뒤 지운다.
- 기본으로 사진·하객 응답·수신자·회수된 토큰만 지운다.
- `purge_include_host_contact`, `purge_include_accounts`는 기본 `false`. 연락처·계좌를 지울지는 아직 정해지지 않았다.
- 채널 기본값은 `dashboard`, `kakao_email`. 이메일은 `auth.users.email`이 있고 `KAKAO_EMAIL_WEBHOOK`이 있을 때만 보낸다. 카카오 계정은 이메일이 없을 수 있다.
- 초안이 아닌 초대장의 소프트 삭제는 `hard_delete_after_hours`(기본 24) 뒤에 행을 지운다.
- 초안만 가진 익명 사용자는 `anon_draft_ttl_days`(기본 30) 뒤에 지운다.

Supabase에서는 대시보드의 `pg_cron`으로 하루에 한 번 호출한다. 03:00 KST = 18:00 UTC.

```sql
select cron.schedule(
  'invife-retention',
  '0 18 * * *',
  $$select public.run_retention()$$
);
```

객체 스토리지 정리는 SQL이 아니라 `npm run job:retention`이 한다. cron이 SQL만 부르면 R2 객체가 남는다. 운영에서는 이 스크립트를 같은 시각에 돌린다.

## 광고·지출

`showAds = ads_enabled && !admin && plan === 'free'`. `ads_enabled` 기본값은 false라 광고 스크립트는 나가지 않는다. `plan`은 항상 `free`다. 결제는 없다.

`spend_cap_cents`가 null이면 막지 않는다. 값을 두면 월 추정 비용이 상한 이상일 때 초안 생성과 사진 서명이 `503 spend_cap`이다. RSVP는 막지 않는다. 50/80/100%에서 `budget_alerts`에 한 번씩 남긴다. 이 카운터는 클라우드 청구서를 대체하지 않는다. Supabase와 R2 결제 알림을 따로 켠다.

## 테스트

```bash
npm test
npm run typecheck
```

RLS는 `invife_app`으로 `set local role authenticated` 한 뒤 본다. 슈퍼유저는 RLS를 통과하므로 권한 단정에 쓰지 않는다.
