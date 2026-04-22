"use client";

import { useRouter } from "next/navigation";
import {
  startTransition,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import type {
  HighlightToken,
  PracticeAttempt,
  PracticeMaterialView,
  PracticeSegmentView,
} from "@/lib/types";

const mediaUrl = (storageKey: string | null | undefined) =>
  storageKey ? `/api/media/${storageKey}` : null;

type LocalAttemptPreview = {
  segmentId: string;
  url: string;
  fileName: string;
  createdAt: string;
};

export function PracticeStudio({
  initialPractice,
}: {
  initialPractice: PracticeMaterialView;
}) {
  const router = useRouter();
  const [practice, setPractice] = useState(initialPractice);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [pending, setPending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [message, setMessage] = useState<string | null>(practice.material.statusDetail);
  const [loopClip, setLoopClip] = useState(false);
  const [localAttemptPreview, setLocalAttemptPreview] = useState<LocalAttemptPreview | null>(null);
  const sourceAudioRef = useRef<HTMLAudioElement | null>(null);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const segment = practice.segments[selectedIndex] ?? practice.segments[0];

  useEffect(() => {
    setPractice(initialPractice);
  }, [initialPractice]);

  useEffect(() => {
    setSelectedIndex((current) => Math.min(current, Math.max(practice.segments.length - 1, 0)));
  }, [practice.segments.length]);

  useEffect(() => {
    if (!sourceAudioRef.current) {
      sourceAudioRef.current = new Audio();
    }

    if (!ttsAudioRef.current) {
      ttsAudioRef.current = new Audio();
    }

    return () => {
      sourceAudioRef.current?.pause();
      ttsAudioRef.current?.pause();
      recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    return () => {
      if (localAttemptPreview?.url) {
        URL.revokeObjectURL(localAttemptPreview.url);
      }
    };
  }, [localAttemptPreview]);

  if (!segment) {
    return (
      <div className="rounded-[30px] border border-black/10 bg-white/85 p-6 shadow-card">
        No segments yet. Go back to the editor and save at least one sentence first.
      </div>
    );
  }

  const sourceAudioUrl = mediaUrl(practice.material.sourceAudioPath);
  const ttsUrl = mediaUrl(segment.ttsAudioPath);

  const playSourceClip = async () => {
    if (!sourceAudioUrl || segment.startMs === null || segment.endMs === null) {
      setMessage("This sentence does not have a source-audio clip yet.");
      return;
    }

    const audio = sourceAudioRef.current;
    if (!audio) {
      return;
    }

    audio.pause();
    audio.src = sourceAudioUrl;
    audio.currentTime = segment.startMs / 1000;

    const stopAt = segment.endMs / 1000;
    audio.ontimeupdate = () => {
      if (audio.currentTime >= stopAt) {
        if (loopClip) {
          audio.currentTime = segment.startMs! / 1000;
          void audio.play();
        } else {
          audio.pause();
          audio.ontimeupdate = null;
        }
      }
    };

    await audio.play();
    setMessage(null);
  };

  const playTts = async () => {
    if (!ttsUrl) {
      setMessage("Reference TTS is not available for this sentence yet.");
      return;
    }

    const audio = ttsAudioRef.current;
    if (!audio) {
      return;
    }

    audio.pause();
    audio.src = ttsUrl;
    await audio.play();
    setMessage(null);
  };

  const submitFile = async (file: File) => {
    setLocalAttemptPreview({
      segmentId: segment.id,
      url: URL.createObjectURL(file),
      fileName: file.name,
      createdAt: new Date().toISOString(),
    });
    setPending(true);
    setMessage("Scoring your attempt…");

    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`/api/segments/${segment.id}/attempts`, {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as {
        error?: string;
        practice?: PracticeMaterialView;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Failed to score your attempt.");
      }

      if (payload.practice) {
        setPractice(payload.practice);
      }

      setMessage("Attempt saved. Review the feedback and record again.");
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to score your attempt.");
    } finally {
      setPending(false);
    }
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage("This browser does not support microphone capture.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const file = new File([blob], `attempt-${segment.id}.webm`, {
          type: blob.type,
        });
        recorder.stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        if (blob.size > 0) {
          await submitFile(file);
        }
      };

      recorder.start();
      setRecording(true);
      setMessage("Recording… speak the sentence, then stop.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Microphone access failed.");
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
  };

  return (
    <section className="grid gap-6 xl:grid-cols-[0.75fr_1.25fr_0.8fr]">
      <div className="rounded-[30px] border border-black/10 bg-white/88 p-4 shadow-card md:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brass">
              Sentence Queue
            </p>
            <h2 className="mt-2 font-display text-2xl text-ink">Practice line by line</h2>
          </div>
          <span className="rounded-full bg-paper px-3 py-1 text-xs font-semibold text-ink/75">
            {practice.segments.length} lines
          </span>
        </div>

        <div className="space-y-3">
          {practice.segments.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={`w-full rounded-[22px] border px-4 py-4 text-left transition ${
                index === selectedIndex
                  ? "border-berry/30 bg-berry/10 shadow-sm"
                  : "border-black/10 bg-paper/70 hover:bg-paper"
              }`}
              onClick={() => setSelectedIndex(index)}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/60">
                  Sentence {index + 1}
                </span>
                {item.latestAttempt?.pronScore !== null && item.latestAttempt?.pronScore !== undefined ? (
                  <span className="rounded-full bg-white/80 px-2.5 py-1 text-xs font-semibold text-ink/70">
                    {item.latestAttempt.pronScore}/100
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-sm leading-6 text-ink/80">{item.text}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-[30px] border border-black/10 bg-paper/90 p-5 shadow-card md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brass">
              Current Sentence
            </p>
            <h2 className="mt-2 font-display text-3xl text-ink">
              {selectedIndex + 1}. Follow, record, refine
            </h2>
          </div>
          <label className="flex items-center gap-2 rounded-full bg-white/70 px-3 py-2 text-sm font-semibold text-ink/75">
            <input
              type="checkbox"
              checked={loopClip}
              onChange={(event) => setLoopClip(event.target.checked)}
            />
            Loop source clip
          </label>
        </div>

        <div className="mt-6 rounded-[28px] bg-white/70 p-5">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brass">
            Target Text
          </p>
          <HighlightedSentence text={segment.text} highlights={segment.highlights} />
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <ActionButton onClick={() => setSelectedIndex((current) => Math.max(0, current - 1))}>
            Previous
          </ActionButton>
          <ActionButton
            onClick={() =>
              setSelectedIndex((current) =>
                Math.min(practice.segments.length - 1, current + 1),
              )
            }
          >
            Next
          </ActionButton>
          <ActionButton onClick={playSourceClip} disabled={!sourceAudioUrl || segment.startMs === null}>
            Play Source
          </ActionButton>
          <ActionButton onClick={playTts} disabled={!ttsUrl}>
            Play TTS
          </ActionButton>
        </div>

        <div className="mt-6 rounded-[28px] border border-black/10 bg-white/75 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brass">
                Submit Attempt
              </p>
              <h3 className="mt-2 font-display text-2xl text-ink">Microphone or file upload</h3>
            </div>
            <div className="flex gap-3">
              {!recording ? (
                <button
                  type="button"
                  onClick={startRecording}
                  disabled={pending}
                  className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  Start Recording
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopRecording}
                  className="rounded-full bg-berry px-4 py-2 text-sm font-semibold text-white"
                >
                  Stop Recording
                </button>
              )}
            </div>
          </div>

          <label className="mt-4 grid gap-2 text-sm text-ink/75">
            Or upload one sentence as audio
            <input
              type="file"
              accept=".wav,.mp3,.m4a,.webm,.ogg,audio/*"
              className="rounded-2xl border border-dashed border-black/10 bg-paper/60 px-4 py-3"
              disabled={pending}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) {
                  return;
                }

                await submitFile(file);
                event.currentTarget.value = "";
              }}
            />
          </label>

          {message ? (
            <p className="mt-4 rounded-2xl bg-white/80 px-4 py-3 text-sm leading-6 text-ink/75">
              {message}
            </p>
          ) : null}
        </div>

        <AttemptPanel
          segment={segment}
          localAttemptPreview={
            localAttemptPreview?.segmentId === segment.id ? localAttemptPreview : null
          }
        />
      </div>

      <aside className="space-y-6">
        <div className="rounded-[30px] border border-black/10 bg-white/88 p-5 shadow-card md:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brass">
            This Round
          </p>
          <h2 className="mt-2 font-display text-2xl text-ink">Focus items</h2>
          <div className="mt-4 space-y-3">
            {practice.focusItems.length > 0 ? (
              practice.focusItems.map((item) => (
                <div
                  key={`${item.patternType}-${item.displayText}`}
                  className="rounded-[22px] border border-black/10 bg-paper/75 p-4"
                >
                  <p className="text-sm font-semibold text-ink">{item.displayText}</p>
                  <p className="mt-2 text-xs uppercase tracking-[0.16em] text-brass">
                    {item.patternType.replaceAll("_", " ")}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-ink/70">{item.reason}</p>
                </div>
              ))
            ) : (
              <p className="rounded-[22px] border border-dashed border-black/10 bg-paper/60 p-4 text-sm leading-6 text-ink/65">
                No persistent weak spots yet. Once the app sees repeated trouble words or patterns,
                they will show up here and inside the sentence text in red.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-[30px] border border-black/10 bg-paper/88 p-5 shadow-card md:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brass">
            Practice Notes
          </p>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-ink/75">
            <li>Keep each attempt under 20 seconds so scoring stays sentence-level.</li>
            <li>Red words reflect repeated low-score words or persistent pronunciation patterns.</li>
            <li>If Azure or Kimi is missing, the app still stores your attempts and shows fallback guidance.</li>
          </ul>
        </div>
      </aside>
    </section>
  );
}

function HighlightedSentence({
  text,
  highlights,
}: {
  text: string;
  highlights: HighlightToken[];
}) {
  const highlightMap = new Map(highlights.map((item) => [item.normalized, item]));
  const parts = text.split(/(\s+)/);

  return (
    <p className="mt-3 text-2xl leading-[1.8] text-ink">
      {parts.map((part, index) => {
        const normalized = part.toLowerCase().replace(/^[^\p{L}\p{M}]+|[^\p{L}\p{M}]+$/gu, "");
        const highlight = highlightMap.get(normalized);
        if (!highlight) {
          return <span key={`${part}-${index}`}>{part}</span>;
        }

        return (
          <span
            key={`${part}-${index}`}
            title={highlight.reason}
            className="rounded-lg bg-berry/12 px-1 text-berry"
          >
            {part}
          </span>
        );
      })}
    </p>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void | Promise<void>;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => void onClick()}
      disabled={disabled}
      className="rounded-full border border-black/10 bg-white/80 px-4 py-2 text-sm font-semibold text-ink/75 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function AttemptPanel({
  segment,
  localAttemptPreview,
}: {
  segment: PracticeSegmentView;
  localAttemptPreview: LocalAttemptPreview | null;
}) {
  const attempt = segment.latestAttempt;

  return (
    <div className="mt-6 rounded-[28px] border border-black/10 bg-white/75 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brass">
        Latest Feedback
      </p>
      {localAttemptPreview ? (
        <div className="mt-4 rounded-[22px] border border-dashed border-black/10 bg-paper/70 p-4">
          <p className="text-sm font-semibold text-ink">Latest local capture</p>
          <p className="mt-1 text-xs uppercase tracking-[0.16em] text-brass">
            {formatAttemptTime(localAttemptPreview.createdAt)}
          </p>
          <p className="mt-2 text-sm leading-6 text-ink/70">
            Replay the exact file you just recorded or uploaded while scoring finishes.
          </p>
          <audio
            controls
            preload="metadata"
            src={localAttemptPreview.url}
            className="mt-3 w-full"
          />
          <p className="mt-2 text-xs text-ink/60">{localAttemptPreview.fileName}</p>
        </div>
      ) : null}
      {attempt ? (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <ScoreCard label="Pron" value={attempt.pronScore} />
            <ScoreCard label="Accuracy" value={attempt.accuracyScore} />
            <ScoreCard label="Fluency" value={attempt.fluencyScore} />
            <ScoreCard label="Completeness" value={attempt.completenessScore} />
          </div>
          <div className="mt-5 grid gap-4">
            <div className="rounded-[22px] bg-paper/80 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brass">
                Saved attempt audio
              </p>
              <audio
                controls
                preload="metadata"
                src={mediaUrl(attempt.attemptAudioPath) ?? undefined}
                className="mt-3 w-full"
              />
              <FeedbackFileLinks attempt={attempt} />
            </div>
            <InfoBlock
              label="Recognized text"
              value={attempt.recognizedText || "No transcript returned."}
            />
            <InfoBlock label="Summary" value={attempt.analysisJson.summary || "No summary yet."} />
            <InfoBlock
              label="Next drill"
              value={attempt.analysisJson.nextDrill || "Repeat once more with the reference audio."}
            />
            {attempt.wordResultsJson.length > 0 ? (
              <div>
                <p className="text-sm font-semibold text-ink">Word-level flags</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {attempt.wordResultsJson.map((word) => (
                    <span
                      key={`${word.word}-${word.errorType}`}
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        (word.accuracyScore ?? 100) < 75 ||
                        /omission|insertion/i.test(word.errorType ?? "")
                          ? "bg-berry/10 text-berry"
                          : "bg-paper text-ink/70"
                      }`}
                    >
                      {word.word} {word.accuracyScore !== null ? `${word.accuracyScore}` : "n/a"}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <div className="mt-6">
            <p className="text-sm font-semibold text-ink">Attempt history</p>
            <div className="mt-3 space-y-3">
              {segment.attempts.map((item) => (
                <AttemptHistoryCard key={item.id} attempt={item} />
              ))}
            </div>
          </div>
        </>
      ) : (
        <p className="mt-3 text-sm leading-6 text-ink/70">
          No attempts yet for this sentence. Record or upload one to start scoring.
        </p>
      )}
    </div>
  );
}

function AttemptHistoryCard({ attempt }: { attempt: PracticeAttempt }) {
  return (
    <div className="rounded-[22px] border border-black/10 bg-paper/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-ink">Saved attempt</p>
        <p className="text-xs uppercase tracking-[0.16em] text-brass">
          {formatAttemptTime(attempt.createdAt)}
        </p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <MetricPill label="Pron" value={attempt.pronScore} />
        <MetricPill label="Accuracy" value={attempt.accuracyScore} />
        <MetricPill label="Fluency" value={attempt.fluencyScore} />
        <MetricPill label="Completeness" value={attempt.completenessScore} />
      </div>
      <p className="mt-3 text-sm leading-6 text-ink/75">
        {attempt.analysisJson.summary || "No summary returned."}
      </p>
      <audio
        controls
        preload="metadata"
        src={mediaUrl(attempt.attemptAudioPath) ?? undefined}
        className="mt-3 w-full"
      />
      <FeedbackFileLinks attempt={attempt} />
    </div>
  );
}

function FeedbackFileLinks({ attempt }: { attempt: PracticeAttempt }) {
  const feedbackJsonUrl = mediaUrl(attempt.feedbackJsonPath);
  const feedbackMarkdownUrl = mediaUrl(attempt.feedbackMarkdownPath);

  if (!feedbackJsonUrl && !feedbackMarkdownUrl) {
    return null;
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {feedbackJsonUrl ? (
        <a
          href={feedbackJsonUrl}
          target="_blank"
          rel="noreferrer"
          className="rounded-full border border-black/10 bg-white/80 px-3 py-1 text-xs font-semibold text-ink/75 transition hover:bg-white"
        >
          Open JSON
        </a>
      ) : null}
      {feedbackMarkdownUrl ? (
        <a
          href={feedbackMarkdownUrl}
          target="_blank"
          rel="noreferrer"
          className="rounded-full border border-black/10 bg-white/80 px-3 py-1 text-xs font-semibold text-ink/75 transition hover:bg-white"
        >
          Open Markdown
        </a>
      ) : null}
    </div>
  );
}

function MetricPill({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  return (
    <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-ink/70">
      {label} {value ?? "—"}
    </span>
  );
}

function ScoreCard({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  return (
    <div className="rounded-[22px] bg-paper/80 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brass">{label}</p>
      <p className="mt-3 font-display text-4xl text-ink">{value ?? "—"}</p>
    </div>
  );
}

function InfoBlock({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[22px] bg-paper/80 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brass">{label}</p>
      <p className="mt-2 text-sm leading-6 text-ink/75">{value}</p>
    </div>
  );
}

function formatAttemptTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return value;
  }

  return parsed.toLocaleString();
}
