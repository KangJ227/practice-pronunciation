"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { startTransition, useState } from "react";
import { autoSplitSegment } from "@/lib/text";
import type { EditableSegmentInput, SentenceSegment, StudyMaterial } from "@/lib/types";

type SegmentRow = EditableSegmentInput;

export function SegmentEditor({
  material,
  initialSegments,
  sourceAudioUrl,
}: {
  material: StudyMaterial;
  initialSegments: SentenceSegment[];
  sourceAudioUrl: string | null;
}) {
  const router = useRouter();
  const [segments, setSegments] = useState<SegmentRow[]>(
    initialSegments.map((segment) => ({
      id: segment.id,
      index: segment.index,
      text: segment.text,
      startMs: segment.startMs,
      endMs: segment.endMs,
      source: segment.source,
    })),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const updateSegment = (index: number, patch: Partial<SegmentRow>) => {
    setSegments((current) =>
      current.map((segment, currentIndex) =>
        currentIndex === index ? { ...segment, ...patch, source: "manual" } : segment,
      ),
    );
  };

  const mergeWithNext = (index: number) => {
    setSegments((current) => {
      if (index >= current.length - 1) {
        return current;
      }

      const first = current[index];
      const second = current[index + 1];
      const merged: SegmentRow = {
        ...first,
        text: `${first.text} ${second.text}`.trim(),
        endMs: second.endMs ?? first.endMs,
        source: "manual",
      };

      return normalizeRows([
        ...current.slice(0, index),
        merged,
        ...current.slice(index + 2),
      ]);
    });
  };

  const autoSplit = (index: number) => {
    setSegments((current) => {
      const target = current[index];
      const parts = autoSplitSegment(target.text);
      if (parts.length <= 1) {
        return current;
      }

      const replacement = parts.map((part, partIndex) => ({
        ...target,
        id: partIndex === 0 ? target.id : undefined,
        text: part,
        source: "manual" as const,
      }));

      return normalizeRows([
        ...current.slice(0, index),
        ...replacement,
        ...current.slice(index + 1),
      ]);
    });
  };

  const insertAfter = (index: number) => {
    setSegments((current) =>
      normalizeRows([
        ...current.slice(0, index + 1),
        {
          index: index + 1,
          text: "",
          startMs: current[index]?.endMs ?? null,
          endMs: null,
          source: "manual",
        },
        ...current.slice(index + 1),
      ]),
    );
  };

  const removeAt = (index: number) => {
    setSegments((current) => {
      if (current.length <= 1) {
        return current;
      }

      return normalizeRows(current.filter((_, currentIndex) => currentIndex !== index));
    });
  };

  return (
    <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      <div className="rounded-[30px] border border-black/10 bg-white/90 p-5 shadow-card md:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brass">
              Sentence List
            </p>
            <h2 className="mt-2 font-display text-3xl text-ink">Review every line</h2>
          </div>
          <button
            type="button"
            className="rounded-full bg-berry px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            disabled={pending}
            onClick={async () => {
              setPending(true);
              setError(null);
              setStatus(null);

              try {
                const response = await fetch(`/api/materials/${material.id}/segments`, {
                  method: "PATCH",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    segments,
                  }),
                });
                const payload = (await response.json()) as { error?: string };
                if (!response.ok) {
                  throw new Error(payload.error || "Failed to save segments.");
                }

                setStatus("Segments saved. Reference audio will be refreshed where available.");
                startTransition(() => router.refresh());
              } catch (saveError) {
                setError(
                  saveError instanceof Error ? saveError.message : "Failed to save segments.",
                );
              } finally {
                setPending(false);
              }
            }}
          >
            {pending ? "Saving…" : "Save Segments"}
          </button>
        </div>

        <div className="space-y-4">
          {segments.map((segment, index) => (
            <article
              key={segment.id ?? `draft-${index}`}
              className="rounded-[26px] border border-black/10 bg-paper/85 p-4"
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-ink/75">
                  <span className="rounded-full bg-white/80 px-3 py-1">
                    Sentence {index + 1}
                  </span>
                  {segment.startMs !== null || segment.endMs !== null ? (
                    <span className="rounded-full bg-white/80 px-3 py-1 text-xs">
                      {formatMs(segment.startMs)} - {formatMs(segment.endMs)}
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <EditorButton onClick={() => autoSplit(index)}>Auto Split</EditorButton>
                  <EditorButton onClick={() => mergeWithNext(index)} disabled={index === segments.length - 1}>
                    Merge Next
                  </EditorButton>
                  <EditorButton onClick={() => insertAfter(index)}>Insert Below</EditorButton>
                  <EditorButton
                    onClick={() => removeAt(index)}
                    disabled={segments.length === 1}
                    tone="danger"
                  >
                    Delete
                  </EditorButton>
                </div>
              </div>

              <textarea
                value={segment.text}
                onChange={(event) => updateSegment(index, { text: event.target.value })}
                className="min-h-28 w-full rounded-[22px] border border-black/10 bg-white/70 px-4 py-4 text-base leading-7 outline-none transition focus:border-berry/40 focus:ring-2 focus:ring-berry/10"
              />
            </article>
          ))}
        </div>

        {error ? <Message tone="error">{error}</Message> : null}
        {status ? <Message tone="success">{status}</Message> : null}
      </div>

      <aside className="space-y-6">
        <div className="rounded-[30px] border border-black/10 bg-paper/85 p-5 shadow-card md:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brass">
            Review Tips
          </p>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-ink/75">
            <li>Prefer one practice-worthy sentence per row.</li>
            <li>Keep punctuation in place so the TTS rhythm stays natural.</li>
            <li>Use “Merge Next” for split ideas and “Auto Split” for long paragraphs.</li>
            <li>When the transcript looks right, save once and jump into practice mode.</li>
          </ul>
        </div>

        {sourceAudioUrl ? (
          <div className="rounded-[30px] border border-black/10 bg-white/85 p-5 shadow-card md:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brass">
              Source Audio
            </p>
            <h2 className="mt-2 font-display text-2xl text-ink">Original recording</h2>
            <p className="mt-3 text-sm leading-6 text-ink/70">
              Listen to the full upload while you check the transcript.
            </p>
            <audio controls src={sourceAudioUrl} className="mt-4" />
          </div>
        ) : null}

        {material.statusDetail ? (
          <div className="rounded-[30px] border border-black/10 bg-white/85 p-5 shadow-card md:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brass">
              Status
            </p>
            <p className="mt-3 text-sm leading-6 text-ink/75">{material.statusDetail}</p>
          </div>
        ) : null}
      </aside>
    </section>
  );
}

function EditorButton({
  children,
  onClick,
  disabled,
  tone = "default",
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
        tone === "danger"
          ? "bg-berry/10 text-berry"
          : "bg-white/80 text-ink/75 hover:bg-white"
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {children}
    </button>
  );
}

function Message({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "error" | "success";
}) {
  return (
    <p
      className={`mt-4 rounded-2xl px-4 py-3 text-sm ${
        tone === "error" ? "bg-berry/10 text-berry" : "bg-moss/10 text-moss"
      }`}
    >
      {children}
    </p>
  );
}

const normalizeRows = (segments: SegmentRow[]) =>
  segments.map((segment, index) => ({
    ...segment,
    index,
  }));

const formatMs = (value: number | null) => {
  if (value === null) {
    return "--:--";
  }

  const totalSeconds = Math.round(value / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};
