# Atelier de Prononciation

A local-first French pronunciation practice web app built with Next.js, Azure Speech, and Kimi.

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
- SQLite via Node `node:sqlite`
- Local filesystem storage under `storage/`
- Azure Speech REST + SDK
- Kimi Chat Completions API (`https://api.moonshot.cn/v1`)

## Requirements

- Node 22+ (`.nvmrc` pins `24.14.0`)
- `ffmpeg` and `ffprobe` available at `/opt/homebrew/bin`

## Getting started

1. Copy `.env.example` to `.env.local`
2. Fill in `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION`
3. Optionally fill in `KIMI_API_KEY`
4. Install dependencies:

```bash
npm install
```

5. Start the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Important behavior

- Text materials still work without Azure credentials, but TTS generation is skipped.
- Audio materials are saved even without Azure credentials, but transcription stays unavailable until Azure Speech is configured.
- Practice attempts are always stored; if Azure or Kimi is unavailable, the app falls back to degraded feedback instead of dropping the upload.
- Each saved attempt also writes feedback artifacts to `storage/attempts/<segment-id>/feedback/` as `.json` and `.md`.
- Weak-word highlighting appears after repeated low scores, or after a single omission/insertion error.

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
