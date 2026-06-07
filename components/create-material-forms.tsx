"use client";

import { useRouter } from "next/navigation";
import { startTransition, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  uploadToSignedStorage,
  type SignedStorageUpload,
} from "@/lib/supabase/upload";

export function CreateMaterialForms() {
  const router = useRouter();
  const [textPending, setTextPending] = useState(false);
  const [audioPending, setAudioPending] = useState(false);
  const [recordingPending, setRecordingPending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingTitle, setRecordingTitle] = useState("");
  const [textError, setTextError] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const processRecordedFile = async (file: File) => {
    setRecordingPending(true);
    setRecordingError(null);

    try {
      const uploadResponse = await fetch("/api/materials/recording/upload", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          title: recordingTitle,
          filename: file.name,
        }),
      });
      const uploadPayload = (await uploadResponse.json()) as {
        error?: string;
        material?: { id: string };
        upload?: SignedStorageUpload & { storageKey: string };
      };
      if (!uploadResponse.ok || !uploadPayload.upload || !uploadPayload.material) {
        throw new Error(uploadPayload.error || "Failed to prepare recording upload.");
      }

      await uploadToSignedStorage(uploadPayload.upload, file);

      const processResponse = await fetch("/api/materials/recording/process", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          materialId: uploadPayload.material.id,
          storageKey: uploadPayload.upload.storageKey,
          filename: file.name,
        }),
      });
      const payload = (await processResponse.json()) as {
        error?: string;
        redirectTo?: string;
      };
      if (!processResponse.ok) {
        throw new Error(payload.error || "Failed to process recording.");
      }

      startTransition(() => {
        router.push(payload.redirectTo ?? "/");
        router.refresh();
      });
    } catch (error) {
      setRecordingError(error instanceof Error ? error.message : "Failed to process recording.");
    } finally {
      setRecordingPending(false);
    }
  };

  const startDirectRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setRecordingError("This browser does not support microphone capture.");
      return;
    }

    try {
      setRecordingError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        recorder.stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        if (blob.size > 0) {
          void processRecordedFile(
            new File([blob], `direct-recording-${Date.now()}.webm`, {
              type: blob.type,
            }),
          );
        }
      };

      recorder.start();
      setRecording(true);
    } catch (error) {
      setRecordingError(
        error instanceof Error ? error.message : "Could not start microphone recording.",
      );
    }
  };

  const stopDirectRecording = () => {
    recorderRef.current?.stop();
  };

  return (
    <div className="grid gap-6">
      <section className="rounded-[30px] border border-black/10 bg-white/90 p-6 shadow-card">
        <SectionHeader
          eyebrow="Direct Recording"
          title="Record, transcribe, score"
          body="Speak a short French line. The app will transcribe it, save the first score, then let you correct the text and generate TTS."
        />
        <div className="mt-5 grid gap-4">
          <label className="grid gap-2 text-sm text-ink/75">
            Title
            <input
              value={recordingTitle}
              onChange={(event) => setRecordingTitle(event.target.value)}
              className="rounded-2xl border border-black/10 bg-paper/70 px-4 py-3 outline-none transition focus:border-berry/40 focus:ring-2 focus:ring-berry/10"
              placeholder="Phrase enregistrée"
            />
          </label>
          <div className="flex flex-wrap gap-3">
            {!recording ? (
              <button
                type="button"
                className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={recordingPending}
                onClick={() => void startDirectRecording()}
              >
                {recordingPending ? "Processing recording..." : "Start Recording"}
              </button>
            ) : (
              <button
                type="button"
                className="rounded-full bg-berry px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90"
                onClick={stopDirectRecording}
              >
                Stop and Process
              </button>
            )}
          </div>
          <p className="text-xs leading-5 text-ink/60">
            Keep direct recordings short. After the transcript opens, edit it to the correct version
            and save to refresh TTS.
          </p>
        </div>
        {recordingError ? <ErrorText>{recordingError}</ErrorText> : null}
      </section>

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
          body="The app will split French sentences, create an editable segment list, and prepare reference audio."
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
          <label className="flex items-start gap-3 rounded-2xl border border-black/10 bg-white/65 px-4 py-3 text-sm text-ink/75">
            <input
              name="referenceMode"
              type="checkbox"
              value="elevenlabs-source"
              className="mt-1"
            />
            <span>
              <span className="block font-semibold text-ink">
                ElevenLabs v2 source audio
              </span>
              <span className="mt-1 block leading-5 text-ink/65">
                Generate one full-passage reference and practice sentence clips from Source.
              </span>
            </span>
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
          const file = formData.get("file");

          try {
            if (!(file instanceof File)) {
              throw new Error("Please upload an audio file.");
            }

            const uploadResponse = await fetch("/api/materials/audio/upload", {
              method: "POST",
              headers: {
                "content-type": "application/json",
              },
              body: JSON.stringify({
                title: String(formData.get("title") ?? ""),
                filename: file.name,
              }),
            });
            const uploadPayload = (await uploadResponse.json()) as {
              error?: string;
              material?: { id: string };
              upload?: SignedStorageUpload & { storageKey: string };
            };
            if (!uploadResponse.ok || !uploadPayload.upload || !uploadPayload.material) {
              throw new Error(uploadPayload.error || "Failed to prepare audio upload.");
            }

            await uploadToSignedStorage(uploadPayload.upload, file);

            const processResponse = await fetch("/api/materials/audio/process", {
              method: "POST",
              headers: {
                "content-type": "application/json",
              },
              body: JSON.stringify({
                materialId: uploadPayload.material.id,
                storageKey: uploadPayload.upload.storageKey,
                filename: file.name,
              }),
            });
            const payload = (await processResponse.json()) as {
              error?: string;
              redirectTo?: string;
            };
            if (!processResponse.ok) {
              throw new Error(payload.error || "Failed to process audio material.");
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
