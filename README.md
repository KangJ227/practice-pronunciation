# Atelier de Prononciation

A private French pronunciation practice web app built with Next.js, Supabase, Azure Speech, and Kimi.

## What it does

- Import French material from pasted text or uploaded audio
- Split the material into sentence-level practice segments
- Review, merge, and auto-split segment boundaries before practice
- Generate per-sentence Azure TTS reference audio
- Upload or record one-sentence attempts in the browser
- Run Azure pronunciation assessment on each attempt
- Store persistent weak spots and highlight repeated trouble words in red
- Use Kimi for concise coaching summaries and next-drill suggestions

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase Auth, Postgres, and private Storage
- Azure Speech REST + SDK
- Kimi Chat Completions API (`https://api.moonshot.cn/v1`)

## Requirements

- Node 22+ (`.nvmrc` pins `24.14.0`)
- `ffmpeg` and `ffprobe` available at `/opt/homebrew/bin`

## Getting started

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL editor.
3. Copy `.env.example` to `.env.local` or create `.env.local`.
4. Fill in the required Supabase environment variables:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
APP_SESSION_SECRET=
SUPABASE_STORAGE_BUCKET=practice-media
```

5. Fill in `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION`.
6. Optionally fill in `KIMI_API_KEY`.
7. Install dependencies:

```bash
npm install
```

8. Start the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Accounts

The app uses local username/password accounts stored in Supabase tables. Create an
account directly in SQL:

```sql
insert into public.app_users (username, password_hash)
values ('jing', crypt('change-this-password', gen_salt('bf')));
```

Usernames must be lowercase. Passwords are checked with Postgres `pgcrypto`
`crypt()`, so do not store plaintext passwords.

If you already have materials from the previous Supabase Auth login, attach the
new login to that existing `user_id` instead:

```sql
update public.app_users
set username = 'jing',
    password_hash = crypt('change-this-password', gen_salt('bf')),
    is_active = true
where id = (
  select user_id
  from public.materials
  order by created_at desc
  limit 1
);
```

## Important behavior

- Text materials still work without Azure credentials, but TTS generation is skipped.
- Audio materials are saved even without Azure credentials, but transcription stays unavailable until Azure Speech is configured.
- The app is private: pages, APIs, and media require a valid app account session.
- Practice attempts are always stored; if Azure or Kimi is unavailable, the app falls back to degraded feedback instead of dropping the upload.
- Each saved attempt also writes feedback artifacts to Supabase Storage as `.json` and `.md`.
- Weak-word highlighting appears after repeated low scores, or after a single omission/insertion error.

## CI/CD

GitHub Actions contains two workflows:

- `.github/workflows/ci.yml` runs on pull requests and manual dispatch.
- `.github/workflows/deploy.yml` runs on pushes to `main` and manual dispatch. It verifies the app, pushes Supabase migrations, then deploys to Vercel production.

Add these GitHub repository secrets:

```bash
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
APP_SESSION_SECRET
SUPABASE_ACCESS_TOKEN
SUPABASE_PROJECT_ID
SUPABASE_DB_PASSWORD
VERCEL_TOKEN
VERCEL_ORG_ID
VERCEL_PROJECT_ID
AZURE_SPEECH_KEY
AZURE_SPEECH_REGION
KIMI_API_KEY
```

Recommended GitHub repository variables:

```bash
SUPABASE_STORAGE_BUCKET=practice-media
AZURE_SPEECH_VOICE=fr-FR-DeniseNeural
KIMI_BASE_URL=https://api.moonshot.cn/v1
KIMI_MODEL=kimi-k2.5
DEFAULT_LOCALE=fr-FR
MAX_AUDIO_MINUTES=10
MAX_ATTEMPT_SECONDS=20
```

The first production deploy applies `supabase/migrations/20260501000000_initial_private_practice_app.sql`. Future database changes should be added as new files under `supabase/migrations/`.

## API surface

- `POST /api/materials/text`
- `POST /api/materials/audio`
- `PATCH /api/materials/:id/segments`
- `GET /api/materials/:id/practice`
- `POST /api/materials/:id/highlights/recompute`
- `POST /api/segments/:id/attempts`
- `GET /api/media/[...storageKey]`

## Notes

- The app targets `fr-FR` in v1.
- Azure pronunciation assessment is used for pronunciation-only scoring; it does not claim grammar or vocabulary scoring for French.
- Uploaded audio is assumed to be a single-speaker recording.
