"use client";

import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";
import type { ReactNode } from "react";

export function CreateMaterialForms() {
  const router = useRouter();
  const [textPending, setTextPending] = useState(false);
  const [audioPending, setAudioPending] = useState(false);
  const [textError, setTextError] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);

  return (
    <div className="grid gap-6">
      <form
        className="rounded-[30px] border border-black/10 bg-white/85 p-6 shadow-card"
        onSubmit={async (event) => {
          event.preventDefault();
          setTextPending(true);
          setTextError(null);
          const formData = new FormData(event.currentTarget);

          try {
            const response = await fetch("/api/materials/text", {
              method: "POST",
              body: formData,
            });
            const payload = (await response.json()) as { error?: string; redirectTo?: string };
            if (!response.ok) {
              throw new Error(payload.error || "Failed to create text material.");
            }

            startTransition(() => {
              router.push(payload.redirectTo ?? "/");
              router.refresh();
            });
          } catch (error) {
            setTextError(error instanceof Error ? error.message : "Failed to create text material.");
          } finally {
            setTextPending(false);
          }
        }}
      >
        <SectionHeader
          eyebrow="Text Practice"
          title="Paste text or upload a script"
          body="The app will split French sentences, create an editable segment list, and prepare reference audio when Azure TTS is available."
        />
        <div className="mt-5 grid gap-4">
          <label className="grid gap-2 text-sm text-ink/75">
            Title
            <input
              name="title"
              className="rounded-2xl border border-black/10 bg-paper/70 px-4 py-3 outline-none transition focus:border-berry/40 focus:ring-2 focus:ring-berry/10"
              placeholder="Leçon du soir"
            />
          </label>
          <label className="grid gap-2 text-sm text-ink/75">
            Text
            <textarea
              name="text"
              className="min-h-40 rounded-3xl border border-black/10 bg-paper/70 px-4 py-4 outline-none transition focus:border-berry/40 focus:ring-2 focus:ring-berry/10"
              placeholder="Collez ici votre texte français…"
            />
          </label>
          <label className="grid gap-2 text-sm text-ink/75">
            Optional `.txt` / `.md`
            <input
              name="file"
              type="file"
              accept=".txt,.md,text/plain,text/markdown"
              className="rounded-2xl border border-dashed border-black/10 bg-paper/50 px-4 py-3"
            />
          </label>
        </div>
        {textError ? <ErrorText>{textError}</ErrorText> : null}
        <button
          type="submit"
          className="mt-5 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={textPending}
        >
          {textPending ? "Preparing text…" : "Create Text Material"}
        </button>
      </form>

      <form
        className="rounded-[30px] border border-black/10 bg-paper/95 p-6 shadow-card"
        onSubmit={async (event) => {
          event.preventDefault();
          setAudioPending(true);
          setAudioError(null);
          const formData = new FormData(event.currentTarget);

          try {
            const response = await fetch("/api/materials/audio", {
              method: "POST",
              body: formData,
            });
            const payload = (await response.json()) as { error?: string; redirectTo?: string };
            if (!response.ok) {
              throw new Error(payload.error || "Failed to create audio material.");
            }

            startTransition(() => {
              router.push(payload.redirectTo ?? "/");
              router.refresh();
            });
          } catch (error) {
            setAudioError(
              error instanceof Error ? error.message : "Failed to create audio material.",
            );
          } finally {
            setAudioPending(false);
          }
        }}
      >
        <SectionHeader
          eyebrow="Audio Practice"
          title="Upload a single-speaker recording"
          body="The app saves the source audio, asks Azure for a transcript with timestamps, then lets you merge or split each line before practice."
        />
        <div className="mt-5 grid gap-4">
          <label className="grid gap-2 text-sm text-ink/75">
            Title
            <input
              name="title"
              className="rounded-2xl border border-black/10 bg-white/75 px-4 py-3 outline-none transition focus:border-berry/40 focus:ring-2 focus:ring-berry/10"
              placeholder="Podcast extrait"
            />
          </label>
          <label className="grid gap-2 text-sm text-ink/75">
            Audio file
            <input
              name="file"
              type="file"
              required
              accept=".wav,.mp3,.m4a,.webm,.ogg,audio/*"
              className="rounded-2xl border border-dashed border-black/10 bg-white/70 px-4 py-3"
            />
          </label>
          <p className="text-xs leading-5 text-ink/60">
            Limit: one speaker, up to 10 minutes. Supported formats: WAV, MP3, M4A, WebM, OGG.
          </p>
        </div>
        {audioError ? <ErrorText>{audioError}</ErrorText> : null}
        <button
          type="submit"
          className="mt-5 rounded-full bg-berry px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={audioPending}
        >
          {audioPending ? "Uploading audio…" : "Create Audio Material"}
        </button>
      </form>
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brass">{eyebrow}</p>
      <h2 className="mt-2 font-display text-3xl text-ink">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-ink/70">{body}</p>
    </div>
  );
}

function ErrorText({ children }: { children: ReactNode }) {
  return <p className="mt-4 rounded-2xl bg-berry/10 px-4 py-3 text-sm text-berry">{children}</p>;
}
