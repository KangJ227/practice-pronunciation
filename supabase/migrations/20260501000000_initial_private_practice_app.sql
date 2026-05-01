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

create table if not exists public.materials (
  id text primary key,
  user_id uuid not null references public.app_users(id) on delete cascade,
  kind text not null check (kind in ('text', 'audio')),
  locale text not null,
  title text not null,
  source_text text not null default '',
  source_audio_path text,
  status text not null check (status in ('draft', 'ready', 'needs-review', 'needs-config', 'error')),
  status_detail text,
  created_at timestamptz not null
);

create table if not exists public.sentence_segments (
  id text primary key,
  user_id uuid not null references public.app_users(id) on delete cascade,
  material_id text not null references public.materials(id) on delete cascade,
  idx integer not null,
  text text not null,
  normalized_text text not null,
  start_ms integer,
  end_ms integer,
  tts_audio_path text,
  starred boolean not null default false,
  source text not null check (source in ('text', 'transcription', 'manual')),
  created_at timestamptz not null
);

create table if not exists public.practice_attempts (
  id text primary key,
  user_id uuid not null references public.app_users(id) on delete cascade,
  material_id text not null references public.materials(id) on delete cascade,
  segment_id text references public.sentence_segments(id) on delete set null,
  attempt_audio_path text not null,
  feedback_json_path text,
  feedback_markdown_path text,
  recognized_text text not null default '',
  pron_score real,
  accuracy_score real,
  fluency_score real,
  completeness_score real,
  word_results_json text not null,
  provider_raw_json text not null,
  analysis_json text not null,
  created_at timestamptz not null
);

create table if not exists public.weak_patterns (
  id text primary key,
  user_id uuid not null references public.app_users(id) on delete cascade,
  pattern_type text not null,
  pattern_key text not null,
  display_text text not null,
  severity integer not null,
  evidence_count integer not null,
  last_seen_at timestamptz not null,
  last_segment_text text not null,
  notes_json text not null,
  unique (user_id, pattern_type, pattern_key)
);

create table if not exists public.weak_pattern_evidence (
  id text primary key,
  user_id uuid not null references public.app_users(id) on delete cascade,
  weak_pattern_id text not null references public.weak_patterns(id) on delete cascade,
  attempt_id text not null references public.practice_attempts(id) on delete cascade,
  segment_id text not null references public.sentence_segments(id) on delete cascade,
  token text not null,
  score real,
  error_type text,
  created_at timestamptz not null
);

create index if not exists idx_materials_user_created
  on public.materials (user_id, created_at desc);

create index if not exists idx_sentence_segments_material_idx
  on public.sentence_segments (user_id, material_id, idx);

create index if not exists idx_practice_attempts_segment_created
  on public.practice_attempts (user_id, segment_id, created_at desc);

create index if not exists idx_practice_attempts_material_created
  on public.practice_attempts (user_id, material_id, created_at desc);

alter table public.materials enable row level security;
alter table public.sentence_segments enable row level security;
alter table public.practice_attempts enable row level security;
alter table public.weak_patterns enable row level security;
alter table public.weak_pattern_evidence enable row level security;

drop policy if exists "materials are private" on public.materials;
create policy "materials are private"
  on public.materials
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "segments are private" on public.sentence_segments;
create policy "segments are private"
  on public.sentence_segments
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "attempts are private" on public.practice_attempts;
create policy "attempts are private"
  on public.practice_attempts
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "weak patterns are private" on public.weak_patterns;
create policy "weak patterns are private"
  on public.weak_patterns
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "weak pattern evidence is private" on public.weak_pattern_evidence;
create policy "weak pattern evidence is private"
  on public.weak_pattern_evidence
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('practice-media', 'practice-media', false)
on conflict (id) do nothing;

drop policy if exists "users can read own practice media" on storage.objects;
create policy "users can read own practice media"
  on storage.objects
  for select
  using (
    bucket_id = 'practice-media'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "users can write own practice media" on storage.objects;
create policy "users can write own practice media"
  on storage.objects
  for insert
  with check (
    bucket_id = 'practice-media'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "users can update own practice media" on storage.objects;
create policy "users can update own practice media"
  on storage.objects
  for update
  using (
    bucket_id = 'practice-media'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'practice-media'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "users can delete own practice media" on storage.objects;
create policy "users can delete own practice media"
  on storage.objects
  for delete
  using (
    bucket_id = 'practice-media'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
