create table if not exists public.user_settings (
  user_id uuid primary key references public.app_users(id) on delete cascade,
  tts_voice text not null default 'fr-FR-DeniseNeural',
  updated_at timestamptz not null default now(),
  constraint user_settings_tts_voice_present check (length(trim(tts_voice)) > 0)
);

alter table public.user_settings enable row level security;

drop policy if exists "user settings are private" on public.user_settings;
create policy "user settings are private"
  on public.user_settings
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
