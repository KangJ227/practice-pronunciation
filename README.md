# Atelier de Prononciation

A personal French pronunciation practice web app built with Next.js, Supabase, Azure Speech, and Kimi.

## What it does

- Import French material from pasted text or uploaded audio
- Split the material into sentence-level practice segments
- Review, merge, and auto-split segment boundaries before practice
- Generate per-sentence Azure TTS reference audio, or full-passage ElevenLabs v2 source audio
- Upload or record one-sentence attempts in the browser
- Run Azure pronunciation assessment on each attempt
- Store persistent weak spots and highlight repeated trouble words in red
- Use Kimi for concise coaching summaries and next-drill suggestions

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase Postgres and private Storage with one default app user
- Azure Speech REST + SDK
- ElevenLabs Text to Speech with timing
- Kimi Chat Completions API (`https://api.moonshot.cn/v1`)
- Bundled ffmpeg for server-side audio normalization

## Requirements

- Node 22+ (`.nvmrc` pins `24.14.0`)
- ffmpeg is installed through npm for Vercel/Linux and local development. Set `FFMPEG_PATH` only if you want to force a custom binary.

## Getting started

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL editor.
3. Copy `.env.example` to `.env.local` or create `.env.local`.
4. Fill in the required Supabase environment variables:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET=practice-media
APP_DEFAULT_USER_ID=
APP_DEFAULT_USERNAME=jing
```

5. Fill in `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION`.
6. Optionally fill in `KIMI_API_KEY`.
7. Optionally fill in `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` to generate full-passage source audio with ElevenLabs multilingual v2.
8. Install dependencies:

```bash
npm install
```

9. Start the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Default app user

The app does not show a login screen. It opens directly with a default app user
stored in Supabase tables. Create that user directly in SQL:

```sql
insert into public.app_users (username, password_hash)
values ('jing', extensions.crypt('change-this-password', extensions.gen_salt('bf')));
```

Usernames must be lowercase. `password_hash` is still required by the existing
schema, but it is not used by the app because login is disabled.

If you already have materials from the previous login flow, attach the default
user to that existing `user_id` instead:

```sql
update public.app_users
set username = 'jing',
    password_hash = extensions.crypt('unused-login-disabled', extensions.gen_salt('bf')),
    is_active = true
where id = (
  select user_id
  from public.materials
  order by created_at desc
  limit 1
);
```

Set `APP_DEFAULT_USER_ID` to pin the app to a specific user. If that is not set,
`APP_DEFAULT_USERNAME` is used. If neither is set, the app falls back to the user
who owns the most recent material, then to the first active app user.

## Important behavior

- Text materials still work without Azure credentials, but TTS generation is skipped.
- Text materials can optionally use ElevenLabs v2 to generate one full-passage MP3 with sentence timing. This audio is saved as source audio, so practice mode uses Source clips instead of per-sentence TTS.
- Audio materials are saved even without Azure credentials, but transcription stays unavailable until Azure Speech is configured.
- Login is disabled: pages, APIs, and media use the default app user instead of a session.
- Practice attempts are always stored; if Azure or Kimi is unavailable, the app falls back to degraded feedback instead of dropping the upload.
- Each saved attempt also writes feedback artifacts to Supabase Storage as `.json` and `.md`.
- Weak-word highlighting appears after repeated low scores, or after a single omission/insertion error.

## CI/CD

GitHub Actions contains two workflows:

- `.github/workflows/ci.yml` runs on pull requests and manual dispatch.
- `.github/workflows/deploy.yml` runs on pushes to `master` and manual dispatch. It verifies the app, pushes Supabase migrations, then deploys to Vercel production.

GitHub CI does not receive application runtime secrets. Keep runtime configuration in
Vercel Production Environment Variables so `vercel pull --environment=production`
is the single source for Vercel builds:

```bash
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_STORAGE_BUCKET=practice-media
APP_DEFAULT_USER_ID
APP_DEFAULT_USERNAME=jing
FFMPEG_PATH
AZURE_SPEECH_KEY
AZURE_SPEECH_REGION
AZURE_SPEECH_VOICE=fr-FR-DeniseNeural
ELEVENLABS_API_KEY
ELEVENLABS_VOICE_ID
ELEVENLABS_OUTPUT_FORMAT=mp3_44100_128
KIMI_API_KEY
KIMI_BASE_URL=https://api.moonshot.cn/v1
KIMI_MODEL=kimi-k2.6
DEFAULT_LOCALE=fr-FR
MAX_AUDIO_MINUTES=10
MAX_ATTEMPT_SECONDS=60
```

GitHub Production secrets are only for deployment infrastructure:

```bash
SUPABASE_ACCESS_TOKEN
SUPABASE_PROJECT_ID
SUPABASE_DB_PASSWORD
VERCEL_TOKEN
VERCEL_ORG_ID
VERCEL_PROJECT_ID
```

The first production deploy applies `supabase/migrations/20260501000000_initial_private_practice_app.sql`. Future database changes should be added as new files under `supabase/migrations/`.

## API surface

- `POST /api/materials/text`
- `POST /api/materials/audio`
- `POST /api/materials/audio/upload`
- `POST /api/materials/audio/process`
- `PATCH /api/materials/:id/segments`
- `GET /api/materials/:id/practice`
- `POST /api/materials/:id/highlights/recompute`
- `POST /api/segments/:id/attempts`
- `POST /api/segments/:id/attempts/upload`
- `POST /api/segments/:id/attempts/process`
- `GET /api/media/[...storageKey]`

## Notes

- The app targets `fr-FR` in v1.
- Azure pronunciation assessment is used for pronunciation-only scoring; it does not claim grammar or vocabulary scoring for French.
- Uploaded audio is assumed to be a single-speaker recording.
