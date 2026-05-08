alter table public.sentence_segments
  add column if not exists is_read boolean not null default false;
