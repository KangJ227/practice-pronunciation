create extension if not exists pgcrypto with schema extensions;

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_users_username_normalized check (username = lower(trim(username))),
  constraint app_users_password_hash_present check (length(password_hash) > 0)
);

create or replace function public.verify_app_user_password(
  p_username text,
  p_password text
)
returns table(id uuid, username text)
language sql
security definer
set search_path = public
as $$
  select app_users.id, app_users.username
  from public.app_users
  where app_users.username = lower(trim(p_username))
    and app_users.is_active = true
    and app_users.password_hash = extensions.crypt(p_password, app_users.password_hash)
  limit 1;
$$;

insert into public.app_users (id, username, password_hash, is_active)
select
  auth.users.id,
  concat('legacy-', replace(auth.users.id::text, '-', '')),
  extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')),
  false
from auth.users
where not exists (
  select 1
  from public.app_users
  where app_users.id = auth.users.id
);

alter table public.materials
  drop constraint if exists materials_user_id_fkey,
  add constraint materials_user_id_fkey
    foreign key (user_id) references public.app_users(id) on delete cascade;

alter table public.sentence_segments
  drop constraint if exists sentence_segments_user_id_fkey,
  add constraint sentence_segments_user_id_fkey
    foreign key (user_id) references public.app_users(id) on delete cascade;

alter table public.practice_attempts
  drop constraint if exists practice_attempts_user_id_fkey,
  add constraint practice_attempts_user_id_fkey
    foreign key (user_id) references public.app_users(id) on delete cascade;

alter table public.weak_patterns
  drop constraint if exists weak_patterns_user_id_fkey,
  add constraint weak_patterns_user_id_fkey
    foreign key (user_id) references public.app_users(id) on delete cascade;

alter table public.weak_pattern_evidence
  drop constraint if exists weak_pattern_evidence_user_id_fkey,
  add constraint weak_pattern_evidence_user_id_fkey
    foreign key (user_id) references public.app_users(id) on delete cascade;
