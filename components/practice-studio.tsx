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
import { getPreviewUrlToRevoke } from "@/lib/local-attempt-preview";
import {
  uploadToSignedStorage,
  type SignedStorageUpload,
} from "@/lib/supabase/upload";

const mediaUrl = (storageKey: string | null | undefined) =>
  storageKey ? `/api/media/${storageKey}` : null;

type LocalAttemptPreview = {
  segmentId: string;
  url: string;
  file: File;
  fileName: string;
  createdAt: string;
  status: "scoring" | "saved" | "failed";
  error: string | null;
};

export function PracticeStudio({
  initialPractice,
}: {
  initialPractice: PracticeMaterialView;
}) {
  const router = useRouter();
  const [practice, setPractice] = useState(initialPractice);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(
    initialPractice.segments[0]?.id ?? null,
  );
  const [pending, setPending] = useState(false);
  const [aiPendingId, setAiPendingId] = useState<string | null>(null);
  const [deletingAttemptId, setDeletingAttemptId] = useState<string | null>(null);
  const [starPendingId, setStarPendingId] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [message, setMessage] = useState<string | null>(practice.material.statusDetail);
  const [loopClip, setLoopClip] = useState(false);
  const [showStarredOnly, setShowStarredOnly] = useState(false);
  const [localAttemptPreview, setLocalAttemptPreview] = useState<LocalAttemptPreview | null>(null);
  const [selectedAttemptIds, setSelectedAttemptIds] = useState<Record<string, string>>({});
  const sourceAudioRef = useRef<HTMLAudioElement | null>(null);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const previousPreviewUrlRef = useRef<string | null>(null);

  const queueSegments = showStarredOnly
    ? practice.segments.filter((item) => item.starred)
    : practice.segments;
  const hasSegments = practice.segments.length > 0;
  const filteredEmpty = hasSegments && queueSegments.length === 0;
  const segment =
    queueSegments.find((item) => item.id === selectedSegmentId) ??
    queueSegments[0] ??
    null;
  const selectedIndex = segment
    ? queueSegments.findIndex((item) => item.id === segment.id)
    : -1;
  const currentAttempt = segment
    ? getCurrentAttempt(segment, selectedAttemptIds[segment.id] ?? null)
    : null;

  useEffect(() => {
    setPractice(initialPractice);
  }, [initialPractice]);

  useEffect(() => {
    setSelectedSegmentId((current) => {
      if (current && queueSegments.some((item) => item.id === current)) {
        return current;
      }

      return queueSegments[0]?.id ?? null;
    });
  }, [queueSegments]);

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
    const currentPreviewUrl = localAttemptPreview?.url ?? null;
    const urlToRevoke = getPreviewUrlToRevoke(previousPreviewUrlRef.current, currentPreviewUrl);

    if (urlToRevoke) {
      URL.revokeObjectURL(urlToRevoke);
    }

    previousPreviewUrlRef.current = currentPreviewUrl;
  }, [localAttemptPreview?.url]);

  useEffect(() => {
    return () => {
      if (previousPreviewUrlRef.current) {
        URL.revokeObjectURL(previousPreviewUrlRef.current);
      }
    };
  }, []);

  if (!hasSegments) {
    return (
      <div className="rounded-[30px] border border-black/10 bg-white/85 p-6 shadow-card">
        No segments yet. Go back to the editor and save at least one sentence first.
      </div>
    );
  }

  const sourceAudioUrl = segment ? mediaUrl(practice.material.sourceAudioPath) : null;
  const ttsUrl = segment ? mediaUrl(segment.ttsAudioPath) : null;

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
    try {
      await loadAudioMetadata(audio, sourceAudioUrl);
      audio.currentTime = segment.startMs / 1000;
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "This browser could not prepare the source audio clip.",
      );
      return;
    }

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

    try {
      await audio.play();
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Source audio playback failed.");
    }
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
    try {
      audio.src = ttsUrl;
      await audio.play();
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Reference TTS playback failed.");
    }
  };

  const submitFile = async (file: File) => {
    const previewUrl = URL.createObjectURL(file);
    setLocalAttemptPreview({
      segmentId: segment.id,
      url: previewUrl,
      file,
      fileName: file.name,
      createdAt: new Date().toISOString(),
      status: "scoring",
      error: null,
    });
    setPending(true);
    setMessage("Uploading your attempt audio...");

    try {
      const uploadResponse = await fetch(`/api/segments/${segment.id}/attempts/upload`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          filename: file.name,
        }),
      });
      const uploadPayload = (await uploadResponse.json()) as {
        error?: string;
        upload?: SignedStorageUpload & { storageKey: string };
      };
      if (!uploadResponse.ok || !uploadPayload.upload) {
        throw new Error(uploadPayload.error || "Failed to prepare attempt upload.");
      }

      await uploadToSignedStorage(uploadPayload.upload, file);
      setMessage("Running Azure scoring for your attempt...");

      const response = await fetch(`/api/segments/${segment.id}/attempts/process`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          storageKey: uploadPayload.upload.storageKey,
          filename: file.name,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        attempt?: PracticeAttempt;
        practice?: PracticeMaterialView;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Failed to score your attempt.");
      }

      if (payload.practice) {
        setPractice(payload.practice);
      }
      if (payload.attempt?.segmentId) {
        const savedAttempt = payload.attempt;
        const segmentId = savedAttempt.segmentId;
        if (segmentId) {
          setSelectedAttemptIds((current) => ({
            ...current,
            [segmentId]: savedAttempt.id,
          }));
        }
      }

      const scoringStatus = String(payload.attempt?.providerRawJson.status ?? "");
      if (scoringStatus === "error" || scoringStatus === "degraded") {
        const errorMessage =
          typeof payload.attempt?.providerRawJson.message === "string"
            ? payload.attempt.providerRawJson.message
            : "Azure scoring did not complete for this audio.";
        setLocalAttemptPreview((current) =>
          current?.url === previewUrl
            ? { ...current, status: "failed", error: errorMessage }
            : current,
        );
        setMessage(`${errorMessage} The audio was saved, and you can retry or upload another take.`);
        startTransition(() => router.refresh());
        return;
      }

      setLocalAttemptPreview((current) =>
        current?.url === previewUrl ? { ...current, status: "saved", error: null } : current,
      );
      setMessage("Azure scoring saved. Generate AI feedback when you want coaching notes.");
      startTransition(() => router.refresh());
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to score your attempt.";
      setLocalAttemptPreview((current) =>
        current?.url === previewUrl ? { ...current, status: "failed", error: errorMessage } : current,
      );
      setMessage(`${errorMessage} You can retry this audio or upload another take.`);
    } finally {
      setPending(false);
    }
  };

  const analyzeAttempt = async (attemptId: string) => {
    setAiPendingId(attemptId);
    setMessage("Generating AI feedback...");

    try {
      const response = await fetch(`/api/attempts/${attemptId}/analysis`, {
        method: "POST",
      });
      const payload = (await response.json()) as {
        error?: string;
        practice?: PracticeMaterialView;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Failed to generate AI feedback.");
      }

      if (payload.practice) {
        setPractice(payload.practice);
      }
      setSelectedAttemptIds((current) => ({
        ...current,
        [segment.id]: attemptId,
      }));

      setMessage("AI feedback saved.");
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to generate AI feedback.");
    } finally {
      setAiPendingId(null);
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

  const selectAttempt = (segmentId: string, attemptId: string) => {
    setSelectedAttemptIds((current) => ({
      ...current,
      [segmentId]: attemptId,
    }));
  };

  const deleteAttemptRecord = async (attempt: PracticeAttempt) => {
    const confirmed = window.confirm("Delete this recording history and its saved feedback files?");
    if (!confirmed) {
      return;
    }

    setDeletingAttemptId(attempt.id);
    setMessage("Deleting recording history...");

    try {
      const response = await fetch(`/api/attempts/${attempt.id}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as {
        error?: string;
        attempt?: PracticeAttempt;
        practice?: PracticeMaterialView;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Failed to delete recording history.");
      }

      if (payload.practice) {
        setPractice(payload.practice);
        const updatedSegment = payload.practice.segments.find((item) => item.id === attempt.segmentId);
        setSelectedAttemptIds((current) => {
          const next = { ...current };
          if (attempt.segmentId) {
            next[attempt.segmentId] = updatedSegment?.latestAttempt?.id ?? "";
            if (!next[attempt.segmentId]) {
              delete next[attempt.segmentId];
            }
          }
          return next;
        });
      }

      setMessage("Recording history deleted.");
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to delete recording history.");
    } finally {
      setDeletingAttemptId(null);
    }
  };

  const toggleSegmentStar = async (targetSegment: PracticeSegmentView) => {
    setStarPendingId(targetSegment.id);

    try {
      const response = await fetch(`/api/segments/${targetSegment.id}/star`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          starred: !targetSegment.starred,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        practice?: PracticeMaterialView;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Failed to update difficult sentence star.");
      }

      if (payload.practice) {
        setPractice(payload.practice);
      }

      setMessage(
        targetSegment.starred
          ? "Removed difficult-sentence star."
          : "Marked this sentence as difficult.",
      );
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Failed to update difficult sentence star.",
      );
    } finally {
      setStarPendingId(null);
    }
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
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 rounded-full bg-paper px-3 py-2 text-xs font-semibold text-ink/75">
              <input
                type="checkbox"
                checked={showStarredOnly}
                onChange={(event) => setShowStarredOnly(event.target.checked)}
              />
              Hard only
            </label>
            <span className="rounded-full bg-paper px-3 py-1 text-xs font-semibold text-ink/75">
              {queueSegments.length}/{practice.segments.length} lines
            </span>
          </div>
        </div>

        <div className="space-y-3">
          {queueSegments.length > 0 ? (
            queueSegments.map((item, index) => (
              <button
                key={item.id}
                type="button"
                className={`w-full rounded-[22px] border px-4 py-4 text-left transition ${
                  index === selectedIndex
                    ? "border-berry/30 bg-berry/10 shadow-sm"
                    : "border-black/10 bg-paper/70 hover:bg-paper"
                }`}
                onClick={() => setSelectedSegmentId(item.id)}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/60">
                      Sentence {item.index + 1}
                    </span>
                    {item.starred ? (
                      <span
                        className="rounded-full bg-brass/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-brass"
                      >
                        Hard
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    {item.latestAttempt?.pronScore !== null &&
                    item.latestAttempt?.pronScore !== undefined ? (
                      <span className="rounded-full bg-white/80 px-2.5 py-1 text-xs font-semibold text-ink/70">
                        {item.latestAttempt.pronScore}/100
                      </span>
                    ) : null}
                    <button
                      type="button"
                      className="rounded-full border border-black/10 bg-white/75 px-3 py-1 text-xs font-semibold text-ink/70 transition hover:bg-white disabled:opacity-60"
                      disabled={starPendingId === item.id}
                      onClick={(event) => {
                        event.stopPropagation();
                        void toggleSegmentStar(item);
                      }}
                      aria-label={item.starred ? "Unmark difficult sentence" : "Mark difficult sentence"}
                      title={item.starred ? "Unmark difficult sentence" : "Mark difficult sentence"}
                    >
                      {starPendingId === item.id ? "..." : item.starred ? "★" : "☆"}
                    </button>
                  </div>
                </div>
                <p className="mt-2 text-sm leading-6 text-ink/80">{item.text}</p>
              </button>
            ))
          ) : (
            <p className="rounded-[22px] border border-dashed border-black/10 bg-paper/60 p-4 text-sm leading-6 text-ink/65">
              No difficult sentences starred yet. Turn off `Hard only` or star a sentence to build this list.
            </p>
          )}
        </div>
      </div>

      <div className="rounded-[30px] border border-black/10 bg-paper/90 p-5 shadow-card md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brass">
              Current Sentence
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h2 className="font-display text-3xl text-ink">
                {segment.index + 1}. Follow, record, refine
              </h2>
              <button
                type="button"
                onClick={() => void toggleSegmentStar(segment)}
                disabled={starPendingId === segment.id}
                className="rounded-full border border-black/10 bg-white/75 px-4 py-2 text-sm font-semibold text-ink/75 transition hover:bg-white disabled:opacity-60"
              >
                {starPendingId === segment.id
                  ? "Updating..."
                  : segment.starred
                    ? "★ Difficult sentence"
                    : "☆ Mark as difficult"}
              </button>
            </div>
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
          {segment ? (
            <>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brass">
                Target Text
              </p>
              <HighlightedSentence text={segment.text} highlights={segment.highlights} />
            </>
          ) : (
            <>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brass">
                Hard Only
              </p>
              <p className="mt-3 text-sm leading-6 text-ink/70">
                No difficult sentences starred yet. Star a sentence from the queue or turn off the
                filter to keep practicing all lines.
              </p>
            </>
          )}
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <ActionButton
            onClick={() =>
              setSelectedSegmentId(
                queueSegments[Math.max(0, selectedIndex - 1)]?.id ?? segment?.id ?? null,
              )
            }
            disabled={!segment || filteredEmpty}
          >
            Previous
          </ActionButton>
          <ActionButton
            onClick={() =>
              setSelectedSegmentId(
                queueSegments[Math.min(queueSegments.length - 1, selectedIndex + 1)]?.id ??
                  segment?.id ??
                  null,
              )
            }
            disabled={!segment || filteredEmpty}
          >
            Next
          </ActionButton>
          <ActionButton
            onClick={playSourceClip}
            disabled={!segment || !sourceAudioUrl || segment.startMs === null}
          >
            Play Source
          </ActionButton>
          <ActionButton onClick={playTts} disabled={!segment || !ttsUrl}>
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
                  disabled={pending || !segment}
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
              disabled={pending || !segment}
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

        {segment ? (
          <AttemptPanel
            segment={segment}
            currentAttempt={currentAttempt}
            localAttemptPreview={
              localAttemptPreview?.segmentId === segment.id ? localAttemptPreview : null
            }
            pending={pending}
            aiPendingId={aiPendingId}
            deletingAttemptId={deletingAttemptId}
            onRetryLocalAttempt={(file) => void submitFile(file)}
            onAnalyzeAttempt={(attemptId) => void analyzeAttempt(attemptId)}
            onSelectAttempt={(attemptId) => selectAttempt(segment.id, attemptId)}
            onDeleteAttempt={(attempt) => void deleteAttemptRecord(attempt)}
          />
        ) : (
          <div className="mt-6 rounded-[28px] border border-dashed border-black/10 bg-white/75 p-5 text-sm leading-6 text-ink/70">
            No starred recordings to review yet because no sentence is marked as difficult.
          </div>
        )}
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
            <li>Azure scoring runs after upload; AI coaching is generated only when you ask for it.</li>
          </ul>
        </div>
      </aside>
    </section>
  );
}

const loadAudioMetadata = async (audio: HTMLAudioElement, url: string) => {
  if (audio.src !== new URL(url, window.location.href).href) {
    audio.src = url;
    audio.load();
  }

  if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("error", onError);
    };
    const onLoadedMetadata = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("This browser could not load the source audio metadata."));
    };

    audio.addEventListener("loadedmetadata", onLoadedMetadata, { once: true });
    audio.addEventListener("error", onError, { once: true });
  });
};

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
  currentAttempt,
  localAttemptPreview,
  pending,
  aiPendingId,
  deletingAttemptId,
  onRetryLocalAttempt,
  onAnalyzeAttempt,
  onSelectAttempt,
  onDeleteAttempt,
}: {
  segment: PracticeSegmentView;
  currentAttempt: PracticeAttempt | null;
  localAttemptPreview: LocalAttemptPreview | null;
  pending: boolean;
  aiPendingId: string | null;
  deletingAttemptId: string | null;
  onRetryLocalAttempt: (file: File) => void;
  onAnalyzeAttempt: (attemptId: string) => void;
  onSelectAttempt: (attemptId: string) => void;
  onDeleteAttempt: (attempt: PracticeAttempt) => void;
}) {
  const attempt = currentAttempt;

  return (
    <div className="mt-6 rounded-[28px] border border-black/10 bg-white/75 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brass">Current Feedback</p>
      {localAttemptPreview ? (
        <div className="mt-4 rounded-[22px] border border-dashed border-black/10 bg-paper/70 p-4">
          <p className="text-sm font-semibold text-ink">Latest local capture</p>
          <p className="mt-1 text-xs uppercase tracking-[0.16em] text-brass">
            {formatAttemptTime(localAttemptPreview.createdAt)}
          </p>
          <p className="mt-2 text-sm leading-6 text-ink/70">
            {localAttemptPreview.status === "failed"
              ? localAttemptPreview.error || "Scoring failed. You can retry this same audio."
              : localAttemptPreview.status === "saved"
                ? "Azure scoring finished for this audio."
                : "Replay the exact file you just recorded or uploaded while scoring finishes."}
          </p>
          <audio
            controls
            preload="metadata"
            src={localAttemptPreview.url}
            className="mt-3 w-full"
          />
          <p className="mt-2 text-xs text-ink/60">{localAttemptPreview.fileName}</p>
          {localAttemptPreview.status === "failed" ? (
            <button
              type="button"
              className="mt-3 rounded-full bg-berry px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={pending}
              onClick={() => onRetryLocalAttempt(localAttemptPreview.file)}
            >
              {pending ? "Retrying..." : "Retry Azure Scoring"}
            </button>
          ) : null}
        </div>
      ) : null}
      {attempt ? (
        <>
          <p className="mt-4 text-xs uppercase tracking-[0.16em] text-brass">
            Showing recording from {formatAttemptTime(attempt.createdAt)}
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <ScoreCard label="Pron" value={attempt.pronScore} />
            <ScoreCard label="Accuracy" value={attempt.accuracyScore} />
            <ScoreCard label="Fluency" value={attempt.fluencyScore} />
            <ScoreCard label="Completeness" value={attempt.completenessScore} />
          </div>
          <div className="mt-5 grid gap-4">
            <InfoBlock
              label="Recognized text"
              value={attempt.recognizedText || "No transcript returned."}
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
                <AttemptHistoryCard
                  key={item.id}
                  attempt={item}
                  selected={item.id === attempt.id}
                  pending={aiPendingId === item.id}
                  deleting={deletingAttemptId === item.id}
                  onAnalyze={() => onAnalyzeAttempt(item.id)}
                  onSelect={() => onSelectAttempt(item.id)}
                  onDelete={() => onDeleteAttempt(item)}
                />
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

function AttemptHistoryCard({
  attempt,
  selected,
  pending,
  deleting,
  onAnalyze,
  onSelect,
  onDelete,
}: {
  attempt: PracticeAttempt;
  selected: boolean;
  pending: boolean;
  deleting: boolean;
  onAnalyze: () => void;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const hasAiFeedback = hasAttemptAnalysis(attempt);

  return (
    <div className="rounded-[22px] border border-black/10 bg-paper/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">Saved attempt</p>
          <p className="mt-1 text-xs uppercase tracking-[0.16em] text-brass">
            {formatAttemptTime(attempt.createdAt)}
          </p>
        </div>
        {selected ? (
          <span className="rounded-full bg-ink px-3 py-1 text-xs font-semibold text-white">
            Current
          </span>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <MetricPill label="Pron" value={attempt.pronScore} />
        <MetricPill label="Accuracy" value={attempt.accuracyScore} />
        <MetricPill label="Fluency" value={attempt.fluencyScore} />
        <MetricPill label="Completeness" value={attempt.completenessScore} />
      </div>
      <p className="mt-3 text-sm leading-6 text-ink/75">
        {hasAiFeedback ? attempt.analysisJson.summary : "Azure score saved. AI feedback not generated yet."}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-full border border-black/10 bg-white/80 px-4 py-2 text-sm font-semibold text-ink/75 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          onClick={onSelect}
          disabled={selected}
        >
          {selected ? "Viewing" : "View Feedback"}
        </button>
        <details className="group">
          <summary className="cursor-pointer list-none rounded-full border border-black/10 bg-white/80 px-4 py-2 text-sm font-semibold text-ink/70 transition hover:bg-white">
            More
          </summary>
          <div className="mt-2">
            <button
              type="button"
              className="rounded-full bg-berry px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={onDelete}
              disabled={deleting || pending}
            >
              {deleting ? "Deleting..." : "Delete Recording"}
            </button>
          </div>
        </details>
      </div>
      <AiFeedbackButton
        className="mt-3"
        disabled={pending}
        hasAiFeedback={hasAiFeedback}
        onClick={onAnalyze}
      />
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

function AiFeedbackButton({
  disabled,
  hasAiFeedback,
  onClick,
  className = "",
}: {
  disabled: boolean;
  hasAiFeedback: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      disabled={disabled}
      onClick={onClick}
    >
      {disabled ? "Generating..." : hasAiFeedback ? "Regenerate AI Feedback" : "Generate AI Feedback"}
    </button>
  );
}

function hasAttemptAnalysis(attempt: PracticeAttempt) {
  return Boolean(
    attempt.feedbackJsonPath ||
      attempt.feedbackMarkdownPath ||
      attempt.analysisJson.summary ||
      attempt.analysisJson.nextDrill ||
      attempt.analysisJson.weakPatterns.length > 0,
  );
}

function getCurrentAttempt(
  segment: PracticeSegmentView,
  selectedAttemptId: string | null,
) {
  if (selectedAttemptId) {
    const selected = segment.attempts.find((attempt) => attempt.id === selectedAttemptId);
    if (selected) {
      return selected;
    }
  }

  return segment.latestAttempt;
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
