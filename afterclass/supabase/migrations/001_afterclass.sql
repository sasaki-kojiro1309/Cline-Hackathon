create extension if not exists pgcrypto;

create table if not exists public.reflections (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  reflection_text text not null check (char_length(reflection_text) between 20 and 1500),
  analysis jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists reflections_session_created_idx on public.reflections(session_id,created_at desc);
create table if not exists public.opportunity_feedback (
  id uuid primary key default gen_random_uuid(), session_id uuid not null,
  opportunity_id text not null, status text not null check(status in ('saved','not_interested','completed')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(session_id,opportunity_id)
);
create table if not exists public.student_profiles (
  owner_id uuid primary key, display_name text not null default '' check(char_length(display_name)<=60),
  consent_at timestamptz, updated_at timestamptz not null default now()
);
create table if not exists public.request_limits (
  key text primary key, window_start timestamptz not null, hits integer not null
);
alter table public.reflections enable row level security;
alter table public.opportunity_feedback enable row level security;
alter table public.student_profiles enable row level security;
alter table public.request_limits enable row level security;
-- No browser policies: server-only service-role access, always owner filtered.
revoke all on public.reflections, public.opportunity_feedback, public.student_profiles, public.request_limits from anon, authenticated;
grant all on public.reflections, public.opportunity_feedback, public.student_profiles, public.request_limits to service_role;

create or replace function public.delete_student_data(p_owner uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
  delete from reflections where session_id=p_owner;
  delete from opportunity_feedback where session_id=p_owner;
  delete from student_profiles where owner_id=p_owner;
end; $$;

create or replace function public.claim_anonymous_data(p_anonymous uuid,p_user uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
  if p_anonymous=p_user then return; end if;
  -- These IDs are provided only by verified server identity, never by browser input.
  update reflections set session_id=p_user where session_id=p_anonymous;
  insert into opportunity_feedback(session_id,opportunity_id,status,created_at,updated_at)
  select p_user,opportunity_id,status,created_at,updated_at from opportunity_feedback where session_id=p_anonymous
  on conflict(session_id,opportunity_id) do update set status=excluded.status, updated_at=excluded.updated_at
  where opportunity_feedback.updated_at < excluded.updated_at;
  delete from opportunity_feedback where session_id=p_anonymous;
  insert into student_profiles(owner_id,display_name,consent_at)
  select p_user,display_name,consent_at from student_profiles where owner_id=p_anonymous
  on conflict(owner_id) do update set consent_at=coalesce(student_profiles.consent_at,excluded.consent_at);
  delete from student_profiles where owner_id=p_anonymous;
end; $$;

create or replace function public.consume_request_limit(p_key text,p_limit integer,p_seconds integer) returns boolean
language plpgsql security definer set search_path=public as $$
declare current_hits integer;
begin
  if p_limit<1 or p_seconds<1 then raise exception 'Invalid request limit'; end if;
  insert into request_limits(key,window_start,hits) values(p_key,now(),1)
  on conflict(key) do update set
    hits=case when request_limits.window_start <= now()-make_interval(secs=>p_seconds) then 1 else request_limits.hits+1 end,
    window_start=case when request_limits.window_start <= now()-make_interval(secs=>p_seconds) then now() else request_limits.window_start end
  returning hits into current_hits;
  delete from request_limits where window_start < now()-interval '2 days';
  return current_hits<=p_limit;
end; $$;
revoke all on function public.delete_student_data(uuid), public.claim_anonymous_data(uuid,uuid), public.consume_request_limit(text,integer,integer) from public, anon, authenticated;
grant execute on function public.delete_student_data(uuid), public.claim_anonymous_data(uuid,uuid), public.consume_request_limit(text,integer,integer) to service_role;