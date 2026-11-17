-- Invife MVP 스키마, RLS, 하객·에디터 함수.
-- 함수 소유자는 마이그레이션을 실행한 슈퍼유저다. security definer 가 RLS 를 넘어서
-- 하객 RPC 가 동작한다. 테이블 소유자가 슈퍼유저가 아니면 하객 조회가 막힌다.
-- 어드민 판별은 auth.jwt() 의 app_metadata.role 만 본다. user_metadata 는 쓰지 않는다.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;

revoke all on schema private from public;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'invife_app') then
    create role invife_app nologin noinherit nobypassrls;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 도우미
-- ---------------------------------------------------------------------------

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
$$;

create or replace function private.is_anonymous()
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
$$;

create or replace function private.is_permanent()
returns boolean
language sql
stable
set search_path = public
as $$
  select auth.uid() is not null and not private.is_anonymous()
$$;

create or replace function public.generate_slug()
returns text
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  candidate text;
  i int;
begin
  for i in 1..8 loop
    candidate := translate(rtrim(encode(gen_random_bytes(9), 'base64'), '='), '+/', '-_');
    if not exists (select 1 from public.invitations where slug = candidate) then
      return candidate;
    end if;
  end loop;
  raise exception 'slug_exhausted' using errcode = '55000';
end
$$;

create or replace function public.ceremony_start(p_date date, p_time time)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select case
    when p_date is null then null
    else (p_date::timestamp + coalesce(p_time, time '23:59:59.999')) at time zone 'Asia/Seoul'
  end
$$;

-- 덮어쓰기가 없으면 예식 전날 23:59:59.999 KST. 그 시각은 포함하고 다음 밀리초부터 닫는다.
create or replace function public.invitation_deadline(p_date date, p_time time, p_override timestamptz)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select coalesce(
    p_override,
    case
      when p_date is null then null
      else ((p_date - 1)::timestamp + time '23:59:59.999') at time zone 'Asia/Seoul'
    end
  )
$$;

-- ---------------------------------------------------------------------------
-- 테이블
-- ---------------------------------------------------------------------------

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  slug text not null unique default public.generate_slug() check (slug ~ '^[A-Za-z0-9_-]{10,16}$'),
  status text not null default 'draft' check (status in ('draft', 'published', 'unpublished', 'deleted')),
  plan text not null default 'free' check (plan = 'free'),
  theme text not null default 'ivory' check (theme in ('ivory', 'sage', 'mist')),
  photo_filter text not null default 'original' check (photo_filter in ('original', 'warm', 'mono')),
  groom_name text not null default '',
  groom_given_name text not null default '',
  groom_phone text not null default '',
  bride_name text not null default '',
  bride_given_name text not null default '',
  bride_phone text not null default '',
  groom_relation text not null default '',
  bride_relation text not null default '',
  ceremony_date date,
  ceremony_time time,
  venue_name text not null default '',
  hall text not null default '',
  address text not null default '',
  address_detail text not null default '',
  lat double precision,
  lng double precision,
  greeting text not null default '',
  transport_parking text not null default '',
  transport_subway text not null default '',
  transport_bus text not null default '',
  transport_other text not null default '',
  accounts_note text not null default '',
  rsvp_deadline_override timestamptz,
  shared_link_version int not null default 1,
  shared_rsvp_token_hash bytea unique,
  published_document jsonb,
  published_at timestamptz,
  published_revision int,
  revision int not null default 1,
  purge_notice_sent_at timestamptz,
  purged_at timestamptz,
  delete_after timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(groom_name) <= 10),
  check (char_length(bride_name) <= 10),
  check (char_length(groom_given_name) <= 10),
  check (char_length(bride_given_name) <= 10),
  check (char_length(venue_name) <= 30),
  check (char_length(hall) <= 20),
  check (char_length(address) <= 120),
  check (char_length(address_detail) <= 40),
  check (char_length(greeting) <= 300),
  check (char_length(transport_parking) <= 100),
  check (char_length(transport_subway) <= 100),
  check (char_length(transport_bus) <= 100),
  check (char_length(transport_other) <= 100),
  check (char_length(accounts_note) <= 80),
  check (char_length(groom_relation) <= 6),
  check (char_length(bride_relation) <= 6),
  check (lat is null or lat between -90 and 90),
  check (lng is null or lng between -180 and 180)
);

create index invitations_owner_idx on public.invitations (owner_id);
create index invitations_purge_idx on public.invitations (status, ceremony_date);

create or replace function public.invitations_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_start timestamptz;
begin
  if new.rsvp_deadline_override is not null and new.ceremony_date is not null then
    v_start := public.ceremony_start(new.ceremony_date, new.ceremony_time);
    if new.rsvp_deadline_override > v_start then
      raise exception 'deadline_after_ceremony' using errcode = '23514';
    end if;
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end
$$;

create trigger invitations_before_write
  before insert or update on public.invitations
  for each row execute function public.invitations_before_write();

create table public.invitation_families (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.invitations (id) on delete cascade,
  side text not null check (side in ('groom', 'bride')),
  role text not null check (role in ('father', 'mother')),
  name text not null default '',
  phone text not null default '',
  deceased boolean not null default false,
  deceased_style text check (deceased_style is null or deceased_style in ('hanja', 'hangul')),
  unique (invitation_id, side, role),
  check (char_length(name) <= 10),
  check (deceased_style is null or deceased)
);

create table public.invitation_photos (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.invitations (id) on delete cascade,
  sort smallint not null check (sort between 0 and 9),
  status text not null default 'pending' check (status in ('pending', 'processing', 'ready', 'failed')),
  content_type text,
  byte_size int check (byte_size is null or (byte_size > 0 and byte_size <= 20971520)),
  width int,
  height int,
  focal_x real not null default 0.5 check (focal_x >= 0 and focal_x <= 1),
  focal_y real not null default 0.4 check (focal_y >= 0 and focal_y <= 1),
  crop_x real not null default 0,
  crop_y real not null default 0,
  crop_w real not null default 1,
  crop_h real not null default 1,
  color_filter text not null default 'original' check (color_filter in ('original', 'warm', 'mono')),
  check (crop_x >= 0 and crop_y >= 0 and crop_w > 0 and crop_h > 0),
  check (crop_x <= 1 and crop_y <= 1 and crop_w <= 1 and crop_h <= 1),
  check (crop_x + crop_w <= 1.001 and crop_y + crop_h <= 1.001),
  low_quality boolean not null default false,
  lqip text,
  filter_applied text check (filter_applied is null or filter_applied in ('original', 'warm', 'mono')),
  upload_token_hash bytea,
  upload_expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index photos_invitation_idx on public.invitation_photos (invitation_id, sort);

create or replace function public.photos_limit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (select count(*) from public.invitation_photos where invitation_id = new.invitation_id) > 10 then
    raise exception 'too_many_photos' using errcode = '23514';
  end if;
  return new;
end
$$;

create trigger photos_limit
  after insert on public.invitation_photos
  for each row execute function public.photos_limit();

create table public.invitation_accounts (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.invitations (id) on delete cascade,
  side text not null check (side in ('groom', 'bride')),
  sort smallint not null check (sort between 0 and 2),
  relation text not null default '',
  holder text not null default '',
  bank text not null default '',
  account_number text not null default '',
  unique (invitation_id, side, sort),
  check (char_length(holder) <= 20),
  check (char_length(relation) <= 20)
);

create index accounts_invitation_idx on public.invitation_accounts (invitation_id, sort);

create table public.recipients (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.invitations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 20),
  token_hash bytea not null unique,
  token_version int not null default 1,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index recipients_invitation_idx on public.recipients (invitation_id) where revoked_at is null;

create table public.revoked_tokens (
  token_hash bytea primary key,
  invitation_id uuid not null references public.invitations (id) on delete cascade,
  recipient_id uuid references public.recipients (id) on delete cascade,
  revoked_at timestamptz not null default now()
);

create index revoked_tokens_invitation_idx on public.revoked_tokens (invitation_id);

create table public.rsvp_responses (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.invitations (id) on delete cascade,
  recipient_id uuid references public.recipients (id) on delete cascade,
  channel text not null check (channel in ('personal', 'invite', 'rsvp_link')),
  name text,
  attending boolean not null,
  companions smallint not null default 0 check (companions between 0 and 10),
  edit_key_hash bytea,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (attending or companions = 0),
  check (name is null or char_length(name) between 1 and 20),
  check (
    (channel = 'personal' and recipient_id is not null and edit_key_hash is null)
    or (
      channel in ('invite', 'rsvp_link')
      and recipient_id is null
      and name is not null
      and edit_key_hash is not null
    )
  )
);

create unique index rsvp_one_recipient on public.rsvp_responses (recipient_id) where recipient_id is not null;
create index rsvp_invitation_idx on public.rsvp_responses (invitation_id, channel);

create table public.host_notices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  invitation_id uuid references public.invitations (id) on delete cascade,
  kind text not null check (kind in ('purge_soon')),
  purge_at timestamptz,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notices_owner_idx on public.host_notices (owner_id, created_at desc);

-- 퍼지 범위·알림 채널·광고·지출 상한. 연락처/계좌를 지울지는 미정이라 기본 false.
create table private.app_settings (
  id int primary key default 1 check (id = 1),
  ads_enabled boolean not null default false,
  spend_cap_cents int,
  estimate_cents_per_mb int not null default 0,
  estimate_cents_per_draft int not null default 0,
  purge_notice_lead_days int not null default 7 check (purge_notice_lead_days >= 0),
  purge_delay_days int not null default 30 check (purge_delay_days >= 0),
  purge_include_host_contact boolean not null default false,
  purge_include_accounts boolean not null default false,
  purge_notice_channels text[] not null default array['dashboard', 'kakao_email'],
  anon_draft_ttl_days int not null default 30,
  hard_delete_after_hours int not null default 24
);

insert into private.app_settings (id) values (1);

create table private.rate_limits (
  bucket text not null,
  window_start timestamptz not null,
  hits int not null default 1,
  primary key (bucket, window_start)
);

create table private.claim_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_hash bytea not null unique,
  anon_user_id uuid not null,
  invitation_ids uuid[] not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table private.notice_outbox (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid,
  owner_id uuid,
  channel text not null,
  to_address text,
  body text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'skipped', 'failed')),
  created_at timestamptz not null default now()
);

create table private.usage_monthly (
  month date primary key,
  drafts int not null default 0,
  photo_bytes bigint not null default 0,
  rsvp_submits int not null default 0,
  estimated_cents int not null default 0
);

create table private.budget_alerts (
  id uuid primary key default gen_random_uuid(),
  month date not null,
  threshold_pct int not null,
  created_at timestamptz not null default now(),
  unique (month, threshold_pct)
);

comment on table private.app_settings is
  'ads_enabled 기본 false. purge_include_host_contact·purge_include_accounts 는 미정(기본 제외). purge_notice_channels 기본 dashboard,kakao_email. 카카오 이메일은 비즈앱이 없으면 발송하지 않는다.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.invitations enable row level security;
alter table public.invitations force row level security;
alter table public.invitation_families enable row level security;
alter table public.invitation_families force row level security;
alter table public.invitation_photos enable row level security;
alter table public.invitation_photos force row level security;
alter table public.invitation_accounts enable row level security;
alter table public.invitation_accounts force row level security;
alter table public.recipients enable row level security;
alter table public.recipients force row level security;
alter table public.revoked_tokens enable row level security;
alter table public.revoked_tokens force row level security;
alter table public.rsvp_responses enable row level security;
alter table public.rsvp_responses force row level security;
alter table public.host_notices enable row level security;
alter table public.host_notices force row level security;

grant usage on schema public to anon, authenticated, invife_app;
grant usage on schema private to authenticated, invife_app;
grant usage on schema auth to anon, authenticated, invife_app;
grant execute on all functions in schema auth to anon, authenticated, invife_app;

-- 테이블 단위 UPDATE 는 컬럼 REVOKE 로 좁혀지지 않는다. 내용 컬럼만 준다.
grant select on public.invitations to authenticated;
grant insert (
  theme, photo_filter,
  groom_name, groom_given_name, groom_phone,
  bride_name, bride_given_name, bride_phone,
  groom_relation, bride_relation,
  ceremony_date, ceremony_time, venue_name, hall, address, address_detail, lat, lng,
  greeting, transport_parking, transport_subway, transport_bus, transport_other,
  accounts_note, rsvp_deadline_override
) on public.invitations to authenticated;
grant update (
  theme, photo_filter,
  groom_name, groom_given_name, groom_phone,
  bride_name, bride_given_name, bride_phone,
  groom_relation, bride_relation,
  ceremony_date, ceremony_time, venue_name, hall, address, address_detail, lat, lng,
  greeting, transport_parking, transport_subway, transport_bus, transport_other,
  accounts_note, rsvp_deadline_override, revision
) on public.invitations to authenticated;

grant select, insert, update, delete on public.invitation_families to authenticated;
grant select, delete on public.invitation_photos to authenticated;
grant update (sort, focal_x, focal_y, crop_x, crop_y, crop_w, crop_h, color_filter) on public.invitation_photos to authenticated;
grant select, insert, update, delete on public.invitation_accounts to authenticated;
grant select on public.recipients to authenticated;
grant select on public.rsvp_responses to authenticated;
grant select on public.host_notices to authenticated;

create policy invitations_select on public.invitations
  for select to authenticated
  using (owner_id = (select auth.uid()) or (select private.is_admin()));

create policy invitations_insert on public.invitations
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and status = 'draft');

create policy invitations_update on public.invitations
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy families_all on public.invitation_families
  for all to authenticated
  using (
    exists (
      select 1 from public.invitations i
      where i.id = invitation_id and i.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.invitations i
      where i.id = invitation_id and i.owner_id = (select auth.uid())
    )
  );

create policy photos_all on public.invitation_photos
  for all to authenticated
  using (
    exists (
      select 1 from public.invitations i
      where i.id = invitation_id and i.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.invitations i
      where i.id = invitation_id and i.owner_id = (select auth.uid())
    )
  );

create policy accounts_all on public.invitation_accounts
  for all to authenticated
  using (
    exists (
      select 1 from public.invitations i
      where i.id = invitation_id and i.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.invitations i
      where i.id = invitation_id and i.owner_id = (select auth.uid())
    )
  );

create policy recipients_select on public.recipients
  for select to authenticated
  using (
    (select private.is_permanent())
    and exists (
      select 1 from public.invitations i
      where i.id = invitation_id and (i.owner_id = (select auth.uid()) or (select private.is_admin()))
    )
  );

create policy rsvp_select on public.rsvp_responses
  for select to authenticated
  using (
    exists (
      select 1 from public.invitations i
      where i.id = invitation_id and (i.owner_id = (select auth.uid()) or (select private.is_admin()))
    )
  );

create policy notices_select on public.host_notices
  for select to authenticated
  using (owner_id = (select auth.uid()) or (select private.is_admin()));

-- anon 과 authenticated 는 private 테이블에 권한이 없다. revoked_tokens 도 직접 접근 없음.

-- ---------------------------------------------------------------------------
-- 하객
-- ---------------------------------------------------------------------------

create or replace function private.rate_limit_take(p_bucket text, p_window_seconds int, p_limit int)
returns table (allowed boolean, retry_after int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz;
  v_hits int;
begin
  v_window := to_timestamp(floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds);
  insert into private.rate_limits as rl (bucket, window_start, hits)
  values (p_bucket, v_window, 1)
  on conflict (bucket, window_start)
  do update set hits = rl.hits + 1
  returning hits into v_hits;
  allowed := v_hits <= p_limit;
  retry_after := greatest(1, ceil(extract(epoch from (v_window + make_interval(secs => p_window_seconds) - clock_timestamp())))::int);
  return next;
end
$$;

create or replace function private.rsvp_context(p_slug text, p_token_hash bytea, p_now timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.invitations%rowtype;
  v_recipient public.recipients%rowtype;
  v_rsvp public.rsvp_responses%rowtype;
  v_deadline timestamptz;
  v_status text;
  v_link text;
begin
  select * into v_inv
  from public.invitations
  where slug = p_slug and status = 'published' and purged_at is null;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  v_deadline := public.invitation_deadline(v_inv.ceremony_date, v_inv.ceremony_time, v_inv.rsvp_deadline_override);
  v_status := case when v_deadline is null or p_now > v_deadline then 'closed' else 'open' end;

  if p_token_hash is null then
    return jsonb_build_object(
      'ok', true,
      'context', jsonb_build_object(
        'status', v_status,
        'deadline', v_deadline,
        'link', 'invite'
      )
    );
  end if;

  select * into v_recipient from public.recipients where token_hash = p_token_hash;
  if found and v_recipient.invitation_id = v_inv.id then
    if v_recipient.revoked_at is not null then
      return jsonb_build_object(
        'ok', true,
        'context', jsonb_build_object(
          'status', v_status,
          'deadline', v_deadline,
          'link', 'personal',
          'revoked', true
        )
      );
    end if;
    select * into v_rsvp from public.rsvp_responses where recipient_id = v_recipient.id;
    return jsonb_build_object(
      'ok', true,
      'context', jsonb_strip_nulls(jsonb_build_object(
        'status', v_status,
        'deadline', v_deadline,
        'link', 'personal',
        'prefillName', v_recipient.name,
        'response', case when v_rsvp.id is null then null else jsonb_build_object(
          'id', v_rsvp.id,
          'attending', v_rsvp.attending,
          'companions', v_rsvp.companions,
          'name', coalesce(v_rsvp.name, v_recipient.name),
          'updatedAt', v_rsvp.updated_at
        ) end
      ))
    );
  end if;

  if exists (
    select 1 from public.revoked_tokens
    where token_hash = p_token_hash and invitation_id = v_inv.id
  ) then
    return jsonb_build_object(
      'ok', true,
      'context', jsonb_build_object(
        'status', v_status,
        'deadline', v_deadline,
        'link', 'personal',
        'revoked', true
      )
    );
  end if;

  if v_inv.shared_rsvp_token_hash is not null and v_inv.shared_rsvp_token_hash = p_token_hash then
    v_link := 'rsvp_link';
    return jsonb_build_object(
      'ok', true,
      'context', jsonb_build_object(
        'status', v_status,
        'deadline', v_deadline,
        'link', v_link
      )
    );
  end if;

  return jsonb_build_object('ok', false, 'code', 'not_found');
end
$$;

create or replace function private.apply_rsvp(
  p_slug text,
  p_channel text,
  p_token_hash bytea,
  p_name text,
  p_attending boolean,
  p_companions smallint,
  p_response_id uuid,
  p_edit_key_hash bytea,
  p_new_edit_key_hash bytea,
  p_now timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.invitations%rowtype;
  v_recipient public.recipients%rowtype;
  v_rsvp public.rsvp_responses%rowtype;
  v_deadline timestamptz;
  v_edited boolean := false;
begin
  if p_channel not in ('personal', 'invite', 'rsvp_link') then
    return jsonb_build_object('ok', false, 'code', 'validation', 'field', 'channel', 'reason', 'invalid');
  end if;

  select * into v_inv
  from public.invitations
  where slug = p_slug and status = 'published' and purged_at is null
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  v_deadline := public.invitation_deadline(v_inv.ceremony_date, v_inv.ceremony_time, v_inv.rsvp_deadline_override);
  if v_deadline is null or p_now > v_deadline then
    return jsonb_build_object('ok', false, 'code', 'closed');
  end if;

  if p_channel = 'personal' then
    if p_token_hash is null then
      return jsonb_build_object('ok', false, 'code', 'validation', 'field', 'token', 'reason', 'required');
    end if;
    select * into v_recipient from public.recipients where token_hash = p_token_hash for update;
    if not found or v_recipient.invitation_id <> v_inv.id then
      if exists (
        select 1 from public.revoked_tokens
        where token_hash = p_token_hash and invitation_id = v_inv.id
      ) then
        return jsonb_build_object('ok', false, 'code', 'revoked');
      end if;
      return jsonb_build_object('ok', false, 'code', 'not_found');
    end if;
    if v_recipient.revoked_at is not null then
      return jsonb_build_object('ok', false, 'code', 'revoked');
    end if;

    select * into v_rsvp from public.rsvp_responses where recipient_id = v_recipient.id for update;
    if found then
      update public.rsvp_responses
      set name = p_name, attending = p_attending, companions = p_companions, updated_at = p_now
      where id = v_rsvp.id
      returning * into v_rsvp;
      v_edited := true;
    else
      insert into public.rsvp_responses (invitation_id, recipient_id, channel, name, attending, companions, created_at, updated_at)
      values (v_inv.id, v_recipient.id, 'personal', p_name, p_attending, p_companions, p_now, p_now)
      returning * into v_rsvp;
    end if;
  else
    if p_channel = 'rsvp_link' and (
      p_token_hash is null or v_inv.shared_rsvp_token_hash is distinct from p_token_hash
    ) then
      return jsonb_build_object('ok', false, 'code', 'not_found');
    end if;

    if p_response_id is not null then
      select * into v_rsvp
      from public.rsvp_responses
      where id = p_response_id and invitation_id = v_inv.id and channel = p_channel
      for update;
      if not found or v_rsvp.edit_key_hash is distinct from p_edit_key_hash or p_edit_key_hash is null then
        return jsonb_build_object('ok', false, 'code', 'edit_forbidden');
      end if;
      update public.rsvp_responses
      set name = p_name, attending = p_attending, companions = p_companions, updated_at = p_now
      where id = v_rsvp.id
      returning * into v_rsvp;
      v_edited := true;
    else
      if p_new_edit_key_hash is null then
        return jsonb_build_object('ok', false, 'code', 'validation', 'field', 'editKey', 'reason', 'required');
      end if;
      insert into public.rsvp_responses (
        invitation_id, channel, name, attending, companions, edit_key_hash, created_at, updated_at
      ) values (
        v_inv.id, p_channel, p_name, p_attending, p_companions, p_new_edit_key_hash, p_now, p_now
      ) returning * into v_rsvp;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'edited', v_edited,
    'response', jsonb_build_object(
      'id', v_rsvp.id,
      'attending', v_rsvp.attending,
      'companions', v_rsvp.companions,
      'name', coalesce(v_rsvp.name, ''),
      'updatedAt', v_rsvp.updated_at
    )
  );
end
$$;

create or replace function private.public_slugs()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('slug', slug) order by published_at), '[]'::jsonb)
  from public.invitations
  where status = 'published' and purged_at is null
$$;

create or replace function private.public_invitation(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select published_document
  from public.invitations
  where slug = p_slug and status = 'published' and purged_at is null
$$;

create or replace function private.photo_upload_target(p_token_hash bytea)
returns table (
  invitation_id uuid,
  photo_id uuid,
  content_type text,
  byte_size int,
  expires_at timestamptz,
  status text
)
language sql
stable
security definer
set search_path = public
as $$
  select invitation_id, id, content_type, byte_size, upload_expires_at, status
  from public.invitation_photos
  where upload_token_hash = p_token_hash
$$;

-- ---------------------------------------------------------------------------
-- 에디터 RPC (영구 사용자·소유자 확인은 함수 안에서)
-- ---------------------------------------------------------------------------

create or replace function private.assert_publishable(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.invitations%rowtype;
begin
  select * into inv from public.invitations where id = p_id;
  if inv.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if char_length(btrim(inv.groom_name)) < 2 then
    raise exception 'groom.name' using errcode = '23514';
  end if;
  if char_length(btrim(inv.bride_name)) < 2 then
    raise exception 'bride.name' using errcode = '23514';
  end if;
  if char_length(btrim(inv.groom_given_name)) < 1 then
    raise exception 'groom.givenName' using errcode = '23514';
  end if;
  if char_length(btrim(inv.bride_given_name)) < 1 then
    raise exception 'bride.givenName' using errcode = '23514';
  end if;
  if inv.ceremony_date is null then
    raise exception 'ceremony.date' using errcode = '23514';
  end if;
  if inv.ceremony_time is null then
    raise exception 'ceremony.time' using errcode = '23514';
  end if;
  if char_length(btrim(inv.venue_name)) < 2 then
    raise exception 'ceremony.venueName' using errcode = '23514';
  end if;
  if char_length(btrim(inv.address)) < 1 then
    raise exception 'ceremony.address' using errcode = '23514';
  end if;
  if not exists (
    select 1
    from public.invitation_photos ph
    where ph.invitation_id = p_id
      and ph.status = 'ready'
      and ph.sort = (select min(sort) from public.invitation_photos where invitation_id = p_id)
  ) then
    raise exception 'photos.cover' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.invitation_families f
    where f.invitation_id = p_id
      and f.deceased
      and char_length(btrim(f.name)) > 0
      and f.deceased_style is null
  ) then
    raise exception 'deceased_style' using errcode = '23514';
  end if;
end
$$;

create or replace function public.publish_invitation(p_id uuid, p_document jsonb, p_shared_hash bytea)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.invitations%rowtype;
begin
  if not private.is_permanent() then
    raise exception 'login_required' using errcode = '42501';
  end if;
  select * into inv from public.invitations where id = p_id and owner_id = auth.uid();
  if not found or inv.status = 'deleted' then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if inv.status = 'published' then
    raise exception 'already_published' using errcode = '23514';
  end if;
  if inv.status not in ('draft', 'unpublished') then
    raise exception 'bad_status' using errcode = '23514';
  end if;
  perform private.assert_publishable(p_id);
  update public.invitations
  set status = 'published',
      published_document = p_document,
      published_at = coalesce(inv.published_at, now()),
      published_revision = revision,
      shared_rsvp_token_hash = coalesce(shared_rsvp_token_hash, p_shared_hash)
  where id = p_id;
end
$$;

create or replace function public.apply_invitation(p_id uuid, p_document jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.invitations%rowtype;
begin
  if not private.is_permanent() then
    raise exception 'login_required' using errcode = '42501';
  end if;
  select * into inv from public.invitations where id = p_id and owner_id = auth.uid();
  if not found or inv.status = 'deleted' then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if inv.status <> 'published' then
    raise exception 'not_published' using errcode = '23514';
  end if;
  perform private.assert_publishable(p_id);
  update public.invitations
  set published_document = p_document,
      published_revision = revision
  where id = p_id;
end
$$;

create or replace function public.unpublish_invitation(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.invitations%rowtype;
begin
  if not private.is_permanent() then
    raise exception 'login_required' using errcode = '42501';
  end if;
  select * into inv from public.invitations where id = p_id and owner_id = auth.uid();
  if not found or inv.status = 'deleted' then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if inv.status <> 'published' then
    raise exception 'not_published' using errcode = '23514';
  end if;
  update public.invitations set status = 'unpublished' where id = p_id;
end
$$;

create or replace function public.soft_delete_invitation(p_id uuid, p_now timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.invitations%rowtype;
  v_hours int;
begin
  select * into inv from public.invitations where id = p_id and owner_id = auth.uid();
  if not found or inv.status = 'deleted' then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select hard_delete_after_hours into v_hours from private.app_settings where id = 1;
  update public.invitations
  set status = 'deleted',
      delete_after = p_now + make_interval(hours => v_hours)
  where id = p_id;
end
$$;

create or replace function public.issue_claim_ticket(p_invitation_ids uuid[], p_ticket_hash bytea)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expires timestamptz := now() + interval '15 minutes';
  v_count int;
begin
  if auth.uid() is null or not private.is_anonymous() then
    raise exception 'not_anonymous' using errcode = '42501';
  end if;
  if p_invitation_ids is null or cardinality(p_invitation_ids) < 1 then
    raise exception 'invitationIds' using errcode = '23514';
  end if;
  select count(*) into v_count
  from public.invitations
  where id = any (p_invitation_ids)
    and owner_id = auth.uid()
    and status <> 'deleted';
  if v_count <> cardinality(p_invitation_ids) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  insert into private.claim_tickets (ticket_hash, anon_user_id, invitation_ids, expires_at)
  values (p_ticket_hash, auth.uid(), p_invitation_ids, v_expires);
  return v_expires;
end
$$;

create or replace function public.claim_drafts(p_ticket_hash bytea)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket private.claim_tickets%rowtype;
  v_count int;
begin
  if not private.is_permanent() then
    raise exception 'login_required' using errcode = '42501';
  end if;
  select * into v_ticket from private.claim_tickets where ticket_hash = p_ticket_hash for update;
  if not found or v_ticket.used_at is not null or v_ticket.expires_at <= now() then
    raise exception 'claim_invalid' using errcode = '28000';
  end if;
  select count(*) into v_count
  from public.invitations
  where id = any (v_ticket.invitation_ids)
    and owner_id = v_ticket.anon_user_id
    and status <> 'deleted';
  if v_count <> cardinality(v_ticket.invitation_ids) then
    raise exception 'claim_invalid' using errcode = '28000';
  end if;
  update public.invitations
  set owner_id = auth.uid()
  where id = any (v_ticket.invitation_ids)
    and owner_id = v_ticket.anon_user_id;
  update private.claim_tickets set used_at = now() where id = v_ticket.id;
  return (
    select jsonb_build_object(
      'invitations',
      coalesce(jsonb_agg(jsonb_build_object('id', id, 'slug', slug)), '[]'::jsonb)
    )
    from public.invitations
    where id = any (v_ticket.invitation_ids)
  );
end
$$;

create or replace function public.add_recipients(
  p_invitation_id uuid,
  p_ids uuid[],
  p_names text[],
  p_hashes text[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  i int;
  inv public.invitations%rowtype;
begin
  if not private.is_permanent() then
    raise exception 'login_required' using errcode = '42501';
  end if;
  if p_ids is null or cardinality(p_ids) < 1 or cardinality(p_ids) > 300
     or cardinality(p_ids) <> cardinality(p_names)
     or cardinality(p_ids) <> cardinality(p_hashes) then
    raise exception 'names' using errcode = '23514';
  end if;
  select * into inv from public.invitations where id = p_invitation_id and owner_id = auth.uid();
  if not found or inv.status = 'deleted' then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  for i in 1..cardinality(p_ids) loop
    if char_length(p_names[i]) < 1 or char_length(p_names[i]) > 20 then
      raise exception 'name' using errcode = '23514';
    end if;
    insert into public.recipients (id, invitation_id, name, token_hash)
    values (p_ids[i], p_invitation_id, p_names[i], decode(p_hashes[i], 'hex'));
  end loop;
end
$$;

create or replace function public.rename_recipient(p_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if not private.is_permanent() then
    raise exception 'login_required' using errcode = '42501';
  end if;
  if char_length(p_name) < 1 or char_length(p_name) > 20 then
    raise exception 'name' using errcode = '23514';
  end if;
  update public.recipients r
  set name = p_name
  where r.id = p_id
    and exists (
      select 1 from public.invitations i
      where i.id = r.invitation_id and i.owner_id = auth.uid() and i.status <> 'deleted'
    );
  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
end
$$;

create or replace function public.revoke_recipient(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.recipients%rowtype;
begin
  if not private.is_permanent() then
    raise exception 'login_required' using errcode = '42501';
  end if;
  select r.* into rec
  from public.recipients r
  join public.invitations i on i.id = r.invitation_id
  where r.id = p_id and i.owner_id = auth.uid() and i.status <> 'deleted'
  for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  insert into public.revoked_tokens (token_hash, invitation_id, recipient_id)
  values (rec.token_hash, rec.invitation_id, rec.id)
  on conflict (token_hash) do nothing;
  update public.recipients set revoked_at = coalesce(revoked_at, now()) where id = p_id;
end
$$;

create or replace function public.reissue_recipient(p_id uuid, p_new_hash bytea)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.recipients%rowtype;
begin
  if not private.is_permanent() then
    raise exception 'login_required' using errcode = '42501';
  end if;
  select r.* into rec
  from public.recipients r
  join public.invitations i on i.id = r.invitation_id
  where r.id = p_id and i.owner_id = auth.uid() and i.status <> 'deleted'
  for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  insert into public.revoked_tokens (token_hash, invitation_id, recipient_id)
  values (rec.token_hash, rec.invitation_id, rec.id)
  on conflict (token_hash) do nothing;
  update public.recipients
  set token_hash = p_new_hash,
      token_version = token_version + 1,
      revoked_at = null
  where id = p_id;
end
$$;

-- ---------------------------------------------------------------------------
-- 보관·사용량
-- ---------------------------------------------------------------------------

create or replace function private.app_flags()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'adsEnabled', ads_enabled,
    'spendCapCents', spend_cap_cents,
    'purgeDelayDays', purge_delay_days
  )
  from private.app_settings
  where id = 1
$$;

create or replace function private.usage_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_month date := (date_trunc('month', (now() at time zone 'Asia/Seoul')))::date;
  v_settings private.app_settings%rowtype;
  v_cents int := 0;
begin
  select * into v_settings from private.app_settings where id = 1;
  select estimated_cents into v_cents from private.usage_monthly where month = v_month;
  v_cents := coalesce(v_cents, 0);
  return jsonb_build_object(
    'estimatedCents', v_cents,
    'capCents', v_settings.spend_cap_cents,
    'blocked', v_settings.spend_cap_cents is not null and v_cents >= v_settings.spend_cap_cents
  );
end
$$;

create or replace function private.add_usage(p_drafts int, p_photo_bytes bigint, p_rsvps int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month date := (date_trunc('month', (now() at time zone 'Asia/Seoul')))::date;
  v_settings private.app_settings%rowtype;
  v_usage private.usage_monthly%rowtype;
  v_cents int;
  v_pct int;
begin
  select * into v_settings from private.app_settings where id = 1;
  insert into private.usage_monthly as u (month, drafts, photo_bytes, rsvp_submits)
  values (v_month, greatest(p_drafts, 0), greatest(p_photo_bytes, 0), greatest(p_rsvps, 0))
  on conflict (month) do update
    set drafts = u.drafts + excluded.drafts,
        photo_bytes = u.photo_bytes + excluded.photo_bytes,
        rsvp_submits = u.rsvp_submits + excluded.rsvp_submits
  returning * into v_usage;

  v_cents := floor(v_usage.photo_bytes / 1000000.0 * v_settings.estimate_cents_per_mb)::int
    + v_usage.drafts * v_settings.estimate_cents_per_draft;
  update private.usage_monthly set estimated_cents = v_cents where month = v_month;

  if v_settings.spend_cap_cents is not null and v_settings.spend_cap_cents > 0 then
    v_pct := floor(v_cents * 100.0 / v_settings.spend_cap_cents)::int;
    if v_pct >= 50 then
      insert into private.budget_alerts (month, threshold_pct) values (v_month, 50) on conflict do nothing;
    end if;
    if v_pct >= 80 then
      insert into private.budget_alerts (month, threshold_pct) values (v_month, 80) on conflict do nothing;
    end if;
    if v_pct >= 100 then
      insert into private.budget_alerts (month, threshold_pct) values (v_month, 100) on conflict do nothing;
    end if;
  end if;

  return jsonb_build_object(
    'estimatedCents', v_cents,
    'capCents', v_settings.spend_cap_cents,
    'blocked', v_settings.spend_cap_cents is not null and v_cents >= v_settings.spend_cap_cents
  );
end
$$;

create or replace function public.run_retention(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s private.app_settings%rowtype;
  v_noticed int := 0;
  v_purged uuid[] := '{}';
  v_hard uuid[] := '{}';
  v_anon_inv uuid[] := '{}';
  v_anon_users uuid[] := '{}';
  r record;
  v_purge_at timestamptz;
  v_email text;
begin
  select * into s from private.app_settings where id = 1;

  for r in
    select i.*
    from public.invitations i
    where i.ceremony_date is not null
      and i.purged_at is null
      and i.purge_notice_sent_at is null
      and i.status in ('published', 'unpublished')
  loop
    v_purge_at := ((r.ceremony_date + s.purge_delay_days)::timestamp) at time zone 'Asia/Seoul';
    if p_now >= v_purge_at - make_interval(days => s.purge_notice_lead_days) then
      insert into public.host_notices (owner_id, invitation_id, kind, purge_at, message)
      values (
        r.owner_id,
        r.id,
        'purge_soon',
        v_purge_at,
        to_char(v_purge_at at time zone 'Asia/Seoul', 'YYYY"년" FMMM"월" FMDD"일"')
          || '에 사진과 하객 정보가 자동으로 지워져요'
      );
      if 'kakao_email' = any (s.purge_notice_channels) then
        select u.email into v_email from auth.users u where u.id = r.owner_id;
        insert into private.notice_outbox (invitation_id, owner_id, channel, to_address, body, status)
        values (
          r.id,
          r.owner_id,
          'kakao_email',
          v_email,
          '사진과 하객 정보가 곧 삭제됩니다. 대시보드에서 날짜를 확인해 주세요.',
          case when v_email is null or length(btrim(v_email)) = 0 then 'skipped' else 'pending' end
        );
      end if;
      update public.invitations set purge_notice_sent_at = p_now where id = r.id;
      v_noticed := v_noticed + 1;
    end if;
  end loop;

  select coalesce(array_agg(i.id), '{}') into v_purged
  from public.invitations i
  where i.ceremony_date is not null
    and i.purged_at is null
    and i.status in ('published', 'unpublished')
    and p_now >= (((i.ceremony_date + s.purge_delay_days)::timestamp) at time zone 'Asia/Seoul');

  if cardinality(v_purged) > 0 then
    delete from public.rsvp_responses where invitation_id = any (v_purged);
    delete from public.revoked_tokens where invitation_id = any (v_purged);
    delete from public.recipients where invitation_id = any (v_purged);
    delete from public.invitation_photos where invitation_id = any (v_purged);
    if s.purge_include_accounts then
      delete from public.invitation_accounts where invitation_id = any (v_purged);
    end if;
    if s.purge_include_host_contact then
      update public.invitations
      set groom_phone = '', bride_phone = ''
      where id = any (v_purged);
      update public.invitation_families set phone = '' where invitation_id = any (v_purged);
    end if;
    update public.invitations set purged_at = p_now where id = any (v_purged);
  end if;

  select coalesce(array_agg(id), '{}') into v_hard
  from public.invitations
  where status = 'deleted' and delete_after is not null and delete_after <= p_now;

  if cardinality(v_hard) > 0 then
    delete from public.invitations where id = any (v_hard);
  end if;

  select coalesce(array_agg(u.id), '{}') into v_anon_users
  from auth.users u
  where coalesce(u.is_anonymous, false)
    and u.created_at < p_now - make_interval(days => s.anon_draft_ttl_days)
    and not exists (
      select 1 from public.invitations i
      where i.owner_id = u.id and i.status <> 'draft'
    );

  if cardinality(v_anon_users) > 0 then
    select coalesce(array_agg(id), '{}') into v_anon_inv
    from public.invitations
    where owner_id = any (v_anon_users);

    begin
      if to_regclass('auth.identities') is not null then
        delete from auth.identities where user_id = any (v_anon_users);
      end if;
    exception when others then
      raise notice 'auth.identities cleanup skipped: %', sqlerrm;
    end;

    begin
      if to_regclass('auth.sessions') is not null then
        delete from auth.sessions where user_id = any (v_anon_users);
      end if;
    exception when others then
      raise notice 'auth.sessions cleanup skipped: %', sqlerrm;
    end;

    delete from auth.users where id = any (v_anon_users);
  end if;

  delete from private.rate_limits where window_start < p_now - interval '2 days';

  return jsonb_build_object(
    'noticed', v_noticed,
    'purgedInvitationIds', to_jsonb(v_purged),
    'hardDeletedInvitationIds', to_jsonb(v_hard),
    'expiredDraftInvitationIds', to_jsonb(v_anon_inv)
  );
end
$$;

comment on function public.run_retention is
  '매일 03:00 KST. pg_cron 이 있으면 select cron.schedule(''invife-retention'', ''0 18 * * *'', $cron$select public.run_retention()$cron$); 18:00 UTC = 03:00 KST.';

create or replace function private.pull_notice_outbox(p_limit int default 50)
returns table (
  id uuid,
  invitation_id uuid,
  owner_id uuid,
  channel text,
  to_address text,
  body text
)
language sql
security definer
set search_path = public
as $$
  select o.id, o.invitation_id, o.owner_id, o.channel, o.to_address, o.body
  from private.notice_outbox o
  where o.status = 'pending'
  order by o.created_at
  limit p_limit
$$;

create or replace function private.mark_notice_outbox(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('sent', 'skipped', 'failed') then
    raise exception 'bad_status' using errcode = '23514';
  end if;
  update private.notice_outbox set status = p_status where id = p_id;
end
$$;

-- 사용자가 고친 내용만으로 버전을 만든다. 변환 상태·변종 URL·LQIP 는 넣지 않는다.
create or replace function public.invitation_etag(p_id uuid)
returns text
language sql
stable
security definer
set search_path = public, extensions
as $$
  select encode(extensions.digest(convert_to(payload::text, 'UTF8'), 'sha256'::text), 'hex'::text)
  from (
    select jsonb_build_object(
      'theme', i.theme,
      'photoFilter', i.photo_filter,
      'groomName', i.groom_name,
      'groomGivenName', i.groom_given_name,
      'groomPhone', i.groom_phone,
      'brideName', i.bride_name,
      'brideGivenName', i.bride_given_name,
      'bridePhone', i.bride_phone,
      'groomRelation', i.groom_relation,
      'brideRelation', i.bride_relation,
      'ceremonyDate', i.ceremony_date,
      'ceremonyTime', to_char(i.ceremony_time, 'HH24:MI'),
      'venueName', i.venue_name,
      'hall', i.hall,
      'address', i.address,
      'addressDetail', i.address_detail,
      'lat', i.lat,
      'lng', i.lng,
      'greeting', i.greeting,
      'transportParking', i.transport_parking,
      'transportSubway', i.transport_subway,
      'transportBus', i.transport_bus,
      'transportOther', i.transport_other,
      'accountsNote', i.accounts_note,
      'rsvpDeadline', i.rsvp_deadline_override,
      'families', coalesce((
        select jsonb_agg(jsonb_build_object(
          'side', f.side,
          'role', f.role,
          'name', f.name,
          'phone', f.phone,
          'deceased', f.deceased,
          'deceasedStyle', f.deceased_style
        ) order by f.side, f.role)
        from public.invitation_families f
        where f.invitation_id = i.id
      ), '[]'::jsonb),
      'accounts', coalesce((
        select jsonb_agg(jsonb_build_object(
          'side', a.side,
          'sort', a.sort,
          'relation', a.relation,
          'holder', a.holder,
          'bank', a.bank,
          'number', a.account_number
        ) order by a.side, a.sort)
        from public.invitation_accounts a
        where a.invitation_id = i.id
      ), '[]'::jsonb),
      'photos', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', p.id,
          'sort', p.sort,
          'focalX', p.focal_x,
          'focalY', p.focal_y,
          'cropX', p.crop_x,
          'cropY', p.crop_y,
          'cropW', p.crop_w,
          'cropH', p.crop_h,
          'filter', p.color_filter
        ) order by p.sort, p.id)
        from public.invitation_photos p
        where p.invitation_id = i.id
      ), '[]'::jsonb)
    ) as payload
    from public.invitations i
    where i.id = p_id
      and (i.owner_id = (select auth.uid()) or (select private.is_admin()))
  ) snapshot
$$;

create or replace function public.mark_photo_processing(p_photo_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if auth.uid() is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  update public.invitation_photos ph
  set status = 'processing'
  where ph.id = p_photo_id
    and ph.status in ('pending', 'ready', 'failed', 'processing')
    and exists (
      select 1 from public.invitations i
      where i.id = ph.invitation_id and i.owner_id = auth.uid() and i.status <> 'deleted'
    );
  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
end
$$;

create or replace function private.storage_keys_for_retry()
returns table (
  invitation_id uuid,
  photo_id uuid,
  photo_filter text,
  crop_x real,
  crop_y real,
  crop_w real,
  crop_h real
)
language sql
security definer
set search_path = public
as $$
  select ph.invitation_id, ph.id, ph.color_filter, ph.crop_x, ph.crop_y, ph.crop_w, ph.crop_h
  from public.invitation_photos ph
  where ph.status in ('processing', 'failed')
    and ph.created_at < now() - interval '2 minutes'
$$;

create or replace function private.mark_photo_status(p_photo_id uuid, p_status text, p_filter text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.invitation_photos
  set status = p_status,
      filter_applied = coalesce(p_filter, filter_applied)
  where id = p_photo_id;
end
$$;

create or replace function public.prepare_photo(
  p_invitation_id uuid,
  p_content_type text,
  p_byte_size int,
  p_token_hash bytea,
  p_expires timestamptz
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid();
  v_sort int;
  v_count int;
begin
  if auth.uid() is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.invitations
    where id = p_invitation_id and owner_id = auth.uid() and status <> 'deleted'
  ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform 1 from public.invitations where id = p_invitation_id for update;
  select count(*) into v_count from public.invitation_photos where invitation_id = p_invitation_id;
  if v_count >= 10 then
    raise exception 'too_many_photos' using errcode = '23514';
  end if;
  select coalesce(max(sort) + 1, 0) into v_sort
  from public.invitation_photos where invitation_id = p_invitation_id;
  insert into public.invitation_photos (
    id, invitation_id, sort, status, content_type, byte_size, upload_token_hash, upload_expires_at
  ) values (
    v_id, p_invitation_id, v_sort, 'pending', p_content_type, p_byte_size, p_token_hash, p_expires
  );
  return v_id;
end
$$;

create or replace function public.finish_photo(
  p_photo_id uuid,
  p_width int,
  p_height int,
  p_low_quality boolean,
  p_lqip text,
  p_filter text,
  p_status text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if auth.uid() is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if p_status not in ('ready', 'failed', 'processing') then
    raise exception 'bad_status' using errcode = '23514';
  end if;
  update public.invitation_photos ph
  set status = p_status,
      width = coalesce(p_width, width),
      height = coalesce(p_height, height),
      low_quality = coalesce(p_low_quality, low_quality),
      lqip = coalesce(p_lqip, lqip),
      filter_applied = coalesce(p_filter, filter_applied),
      upload_token_hash = null,
      upload_expires_at = null
  where ph.id = p_photo_id
    and exists (
      select 1 from public.invitations i
      where i.id = ph.invitation_id and i.owner_id = auth.uid() and i.status <> 'deleted'
    );
  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 실행 권한. public 기본 EXECUTE 를 걷어 낸다.
-- ---------------------------------------------------------------------------

revoke all on all functions in schema public from public;
revoke all on all functions in schema private from public;

grant execute on function private.is_admin() to authenticated;
grant execute on function private.is_anonymous() to authenticated;
grant execute on function private.is_permanent() to authenticated;
grant execute on function private.app_flags() to authenticated;
grant execute on function private.usage_status() to authenticated;
grant execute on function private.add_usage(int, bigint, int) to authenticated;

grant execute on function public.generate_slug() to authenticated;
grant execute on function public.invitation_etag(uuid) to authenticated;
grant execute on function public.invitations_before_write() to authenticated;
grant execute on function public.photos_limit() to authenticated;
grant execute on function public.ceremony_start(date, time) to authenticated, invife_app;
grant execute on function public.invitation_deadline(date, time, timestamptz) to authenticated, invife_app;
grant execute on function public.publish_invitation(uuid, jsonb, bytea) to authenticated;
grant execute on function public.apply_invitation(uuid, jsonb) to authenticated;
grant execute on function public.unpublish_invitation(uuid) to authenticated;
grant execute on function public.soft_delete_invitation(uuid, timestamptz) to authenticated;
grant execute on function public.issue_claim_ticket(uuid[], bytea) to authenticated;
grant execute on function public.claim_drafts(bytea) to authenticated;
grant execute on function public.add_recipients(uuid, uuid[], text[], text[]) to authenticated;
grant execute on function public.rename_recipient(uuid, text) to authenticated;
grant execute on function public.revoke_recipient(uuid) to authenticated;
grant execute on function public.reissue_recipient(uuid, bytea) to authenticated;
grant execute on function public.prepare_photo(uuid, text, int, bytea, timestamptz) to authenticated;
grant execute on function public.finish_photo(uuid, int, int, boolean, text, text, text) to authenticated;
grant execute on function public.mark_photo_processing(uuid) to authenticated;
grant execute on function public.run_retention(timestamptz) to invife_app;

grant execute on all functions in schema private to invife_app;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant usage on schema public, private to service_role;
    grant execute on all functions in schema private to service_role;
    grant execute on function public.run_retention(timestamptz) to service_role;
  end if;
end
$$;

grant authenticated to invife_app;
