-- 4주차: 정적 재생성 큐, 어드민 광고 스위치.
-- 호스트는 자기 초대장의 큐만 읽고, 어드민(app_metadata.role)은 전부 본다.
-- 넣는 일은 security definer 뿐이다.

create table public.static_rebuilds (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.invitations (id) on delete cascade,
  owner_id uuid not null,
  slug text not null,
  action text not null check (action in ('publish', 'apply', 'unpublish', 'delete')),
  revision int not null,
  page_path text not null,
  document_path text not null,
  created_at timestamptz not null default now(),
  acked_at timestamptz
);

create index static_rebuilds_owner_idx on public.static_rebuilds (owner_id, created_at desc);
create index static_rebuilds_pending_idx on public.static_rebuilds (created_at) where acked_at is null;

comment on table public.static_rebuilds is
  '발행·반영·발행 취소·삭제가 만든 정적 페이지 재생성 요청. 평문 토큰과 하객 이름은 없다. DB 가 죽어도 이미 구운 HTML 은 CDN 에 남는다.';

alter table public.static_rebuilds enable row level security;
alter table public.static_rebuilds force row level security;

grant select on public.static_rebuilds to authenticated;

create policy static_rebuilds_select on public.static_rebuilds
  for select to authenticated
  using (owner_id = (select auth.uid()) or (select private.is_admin()));

create or replace function public.record_static_rebuild(p_id uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.invitations%rowtype;
  v_id uuid;
  v_page text;
  v_document text;
begin
  if not private.is_permanent() then
    raise exception 'login_required' using errcode = '42501';
  end if;
  if p_action not in ('publish', 'apply', 'unpublish', 'delete') then
    raise exception 'action' using errcode = '23514';
  end if;
  select * into inv from public.invitations where id = p_id and owner_id = auth.uid();
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_page := '/i/' || inv.slug || '/';
  v_document := '/v1/invitations/' || inv.slug;
  insert into public.static_rebuilds (invitation_id, owner_id, slug, action, revision, page_path, document_path)
  values (inv.id, inv.owner_id, inv.slug, p_action, inv.revision, v_page, v_document)
  returning id into v_id;
  return jsonb_build_object(
    'id', v_id,
    'action', p_action,
    'slug', inv.slug,
    'revision', inv.revision,
    'pagePath', v_page,
    'documentPath', v_document
  );
end
$$;

create or replace function public.set_ads_enabled(p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not private.is_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if p_enabled is null then
    raise exception 'adsEnabled' using errcode = '23514';
  end if;
  update private.app_settings set ads_enabled = p_enabled where id = 1;
end
$$;

create or replace function private.list_static_rebuilds(p_limit int)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', q.id,
        'action', q.action,
        'slug', q.slug,
        'revision', q.revision,
        'pagePath', q.page_path,
        'documentPath', q.document_path,
        'createdAt', q.created_at
      )
      order by q.created_at
    ),
    '[]'::jsonb
  )
  from (
    select *
    from public.static_rebuilds
    where acked_at is null
    order by created_at
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
  ) q
$$;

create or replace function private.ack_static_rebuilds(p_ids uuid[])
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  update public.static_rebuilds
  set acked_at = now()
  where acked_at is null
    and id = any (coalesce(p_ids, array[]::uuid[]));
  get diagnostics v_count = row_count;
  return v_count;
end
$$;

revoke all on function public.record_static_rebuild(uuid, text) from public;
revoke all on function public.set_ads_enabled(boolean) from public;
revoke all on function private.list_static_rebuilds(int) from public;
revoke all on function private.ack_static_rebuilds(uuid[]) from public;

grant execute on function public.record_static_rebuild(uuid, text) to authenticated;
grant execute on function public.set_ads_enabled(boolean) to authenticated;
grant execute on function private.list_static_rebuilds(int) to invife_app;
grant execute on function private.ack_static_rebuilds(uuid[]) to invife_app;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function private.list_static_rebuilds(int) to service_role;
    grant execute on function private.ack_static_rebuilds(uuid[]) to service_role;
  end if;
end
$$;
