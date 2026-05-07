import type {
  EditableSegmentInput,
  PracticeAttempt,
  SentenceSegment,
  StudyMaterial,
  UserSettings,
  WeakPattern,
} from "@/lib/types";
import { appConfig } from "@/lib/config";
import { requireUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createId, jsonParse, jsonStringify, nowIso } from "@/lib/utils";

type Row = Record<string, unknown>;

const emptyAnalysis = {
  summary: "",
  nextDrill: "",
  weakPatterns: [],
  highlightTokens: [],
};

const admin = () => getSupabaseAdmin();

const currentUserId = async () => (await requireUser()).id;

const fail = (message: string, error: unknown): never => {
  const detail =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message)
      : "";
  throw new Error(detail ? `${message}: ${detail}` : message);
};

const rowToMaterial = (row: Row): StudyMaterial => ({
  id: String(row.id),
  kind: row.kind as StudyMaterial["kind"],
  locale: String(row.locale),
  title: String(row.title),
  sourceText: String(row.source_text ?? ""),
  sourceAudioPath: row.source_audio_path ? String(row.source_audio_path) : null,
  status: row.status as StudyMaterial["status"],
  statusDetail: row.status_detail ? String(row.status_detail) : null,
  createdAt: String(row.created_at),
});

const rowToSegment = (row: Row): SentenceSegment => ({
  id: String(row.id),
  materialId: String(row.material_id),
  index: Number(row.idx),
  text: String(row.text),
  normalizedText: String(row.normalized_text),
  startMs: row.start_ms === null ? null : Number(row.start_ms),
  endMs: row.end_ms === null ? null : Number(row.end_ms),
  ttsAudioPath: row.tts_audio_path ? String(row.tts_audio_path) : null,
  starred: Boolean(row.starred),
  source: row.source as SentenceSegment["source"],
  createdAt: String(row.created_at),
});

const rowToAttempt = (row: Row): PracticeAttempt => ({
  id: String(row.id),
  materialId: String(row.material_id),
  segmentId: row.segment_id ? String(row.segment_id) : null,
  attemptAudioPath: String(row.attempt_audio_path),
  feedbackJsonPath: row.feedback_json_path ? String(row.feedback_json_path) : null,
  feedbackMarkdownPath: row.feedback_markdown_path ? String(row.feedback_markdown_path) : null,
  recognizedText: String(row.recognized_text ?? ""),
  pronScore: row.pron_score === null ? null : Number(row.pron_score),
  accuracyScore: row.accuracy_score === null ? null : Number(row.accuracy_score),
  fluencyScore: row.fluency_score === null ? null : Number(row.fluency_score),
  completenessScore:
    row.completeness_score === null ? null : Number(row.completeness_score),
  wordResultsJson: jsonParse(String(row.word_results_json ?? "[]"), []),
  providerRawJson: jsonParse(String(row.provider_raw_json ?? "{}"), {}),
  analysisJson: jsonParse(String(row.analysis_json ?? "{}"), emptyAnalysis),
  createdAt: String(row.created_at),
});

const rowToWeakPattern = (row: Row): WeakPattern => ({
  id: String(row.id),
  patternType: row.pattern_type as WeakPattern["patternType"],
  patternKey: String(row.pattern_key),
  displayText: String(row.display_text),
  severity: Number(row.severity),
  evidenceCount: Number(row.evidence_count),
  lastSeenAt: String(row.last_seen_at),
  lastSegmentText: String(row.last_segment_text),
  notesJson: jsonParse(String(row.notes_json ?? "{}"), {}),
});

const rowToSettings = (row: Row): UserSettings => ({
  userId: String(row.user_id),
  ttsVoice: String(row.tts_voice ?? appConfig.speechVoice),
  updatedAt: String(row.updated_at),
});

export const listMaterials = async () => {
  const userId = await currentUserId();
  const { data, error } = await admin()
    .from("materials")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    fail("Failed to list materials", error);
  }

  return (data ?? []).map(rowToMaterial);
};

export const getMaterial = async (materialId: string) => {
  const userId = await currentUserId();
  const { data, error } = await admin()
    .from("materials")
    .select("*")
    .eq("user_id", userId)
    .eq("id", materialId)
    .maybeSingle();

  if (error) {
    fail("Failed to load material", error);
  }

  return data ? rowToMaterial(data) : null;
};

export const createMaterial = async (input: {
  kind: StudyMaterial["kind"];
  locale: string;
  title: string;
  sourceText?: string;
  sourceAudioPath?: string | null;
  status: StudyMaterial["status"];
  statusDetail?: string | null;
}) => {
  const userId = await currentUserId();
  const id = createId();
  const createdAt = nowIso();
  const { data, error } = await admin()
    .from("materials")
    .insert({
      id,
      user_id: userId,
      kind: input.kind,
      locale: input.locale,
      title: input.title,
      source_text: input.sourceText ?? "",
      source_audio_path: input.sourceAudioPath ?? null,
      status: input.status,
      status_detail: input.statusDetail ?? null,
      created_at: createdAt,
    })
    .select("*")
    .single();

  if (error) {
    fail("Failed to create material", error);
  }

  return rowToMaterial(data);
};

export const updateMaterial = async (
  materialId: string,
  patch: Partial<Pick<StudyMaterial, "title" | "sourceText" | "sourceAudioPath" | "status" | "statusDetail">>,
) => {
  const userId = await currentUserId();
  const material = await getMaterial(materialId);
  if (!material) {
    throw new Error("Material not found.");
  }

  const { data, error } = await admin()
    .from("materials")
    .update({
      title: patch.title ?? material.title,
      source_text: patch.sourceText ?? material.sourceText,
      source_audio_path:
        patch.sourceAudioPath === undefined ? material.sourceAudioPath : patch.sourceAudioPath,
      status: patch.status ?? material.status,
      status_detail:
        patch.statusDetail === undefined ? material.statusDetail : patch.statusDetail,
    })
    .eq("user_id", userId)
    .eq("id", materialId)
    .select("*")
    .single();

  if (error) {
    fail("Failed to update material", error);
  }

  return rowToMaterial(data);
};

export const deleteMaterial = async (materialId: string) => {
  const userId = await currentUserId();
  const material = await getMaterial(materialId);
  if (!material) {
    throw new Error("Material not found.");
  }

  const { error } = await admin()
    .from("materials")
    .delete()
    .eq("user_id", userId)
    .eq("id", materialId);

  if (error) {
    fail("Failed to delete material", error);
  }

  return material;
};

export const getUserSettings = async () => {
  const userId = await currentUserId();
  const { data, error } = await admin()
    .from("user_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    fail("Failed to load settings", error);
  }

  return data
    ? rowToSettings(data)
    : {
        userId,
        ttsVoice: appConfig.speechVoice,
        updatedAt: nowIso(),
      };
};

export const updateUserSettings = async (input: { ttsVoice: string }) => {
  const userId = await currentUserId();
  const now = nowIso();
  const { data, error } = await admin()
    .from("user_settings")
    .upsert(
      {
        user_id: userId,
        tts_voice: input.ttsVoice,
        updated_at: now,
      },
      { onConflict: "user_id" },
    )
    .select("*")
    .single();

  if (error) {
    fail("Failed to save settings", error);
  }

  return rowToSettings(data);
};

export const listSegmentsByMaterial = async (materialId: string) => {
  const userId = await currentUserId();
  const { data, error } = await admin()
    .from("sentence_segments")
    .select("*")
    .eq("user_id", userId)
    .eq("material_id", materialId)
    .order("idx", { ascending: true });

  if (error) {
    fail("Failed to list segments", error);
  }

  return (data ?? []).map(rowToSegment);
};

export const replaceSegments = async (
  materialId: string,
  segments: EditableSegmentInput[],
) => {
  const userId = await currentUserId();
  const existing = await listSegmentsByMaterial(materialId);
  const existingById = new Map(existing.map((segment) => [segment.id, segment]));
  const now = nowIso();
  const keepIds = new Set<string>();
  const result: SentenceSegment[] = [];

  for (const input of segments) {
    const existingSegment = input.id ? existingById.get(input.id) : null;
    const id = existingSegment?.id ?? createId();
    keepIds.add(id);

    const payload = {
      id,
      user_id: userId,
      material_id: materialId,
      idx: input.index,
      text: input.text,
      normalized_text: input.text.toLowerCase(),
      start_ms: input.startMs,
      end_ms: input.endMs,
      tts_audio_path: existingSegment?.ttsAudioPath ?? null,
      starred: input.starred ?? existingSegment?.starred ?? false,
      source: input.source,
      created_at: existingSegment?.createdAt ?? now,
    };

    const { data, error } = await admin()
      .from("sentence_segments")
      .upsert(payload, { onConflict: "id" })
      .select("*")
      .single();

    if (error) {
      fail("Failed to save segment", error);
    }

    result.push(rowToSegment(data));
  }

  const idsToDelete = existing
    .filter((segment) => !keepIds.has(segment.id))
    .map((segment) => segment.id);

  if (idsToDelete.length > 0) {
    const { error } = await admin()
      .from("sentence_segments")
      .delete()
      .eq("user_id", userId)
      .in("id", idsToDelete);

    if (error) {
      fail("Failed to remove deleted segments", error);
    }
  }

  return result.sort((a, b) => a.index - b.index);
};

export const updateSegmentTtsPath = async (segmentId: string, ttsAudioPath: string | null) => {
  const userId = await currentUserId();
  const { error } = await admin()
    .from("sentence_segments")
    .update({ tts_audio_path: ttsAudioPath })
    .eq("user_id", userId)
    .eq("id", segmentId);

  if (error) {
    fail("Failed to update TTS path", error);
  }
};

export const updateSegmentStarred = async (segmentId: string, starred: boolean) => {
  const userId = await currentUserId();
  const { data, error } = await admin()
    .from("sentence_segments")
    .update({ starred })
    .eq("user_id", userId)
    .eq("id", segmentId)
    .select("*")
    .single();

  if (error) {
    fail("Failed to update segment star", error);
  }

  return rowToSegment(data);
};

export const getSegment = async (segmentId: string) => {
  const userId = await currentUserId();
  const { data, error } = await admin()
    .from("sentence_segments")
    .select("*")
    .eq("user_id", userId)
    .eq("id", segmentId)
    .maybeSingle();

  if (error) {
    fail("Failed to load segment", error);
  }

  return data ? rowToSegment(data) : null;
};

export const createAttempt = async (input: {
  id?: string;
  createdAt?: string;
  materialId: string;
  segmentId: string | null;
  attemptAudioPath: string;
  feedbackJsonPath?: string | null;
  feedbackMarkdownPath?: string | null;
  recognizedText: string;
  pronScore: number | null;
  accuracyScore: number | null;
  fluencyScore: number | null;
  completenessScore: number | null;
  wordResultsJson: unknown;
  providerRawJson: unknown;
  analysisJson: unknown;
}) => {
  const userId = await currentUserId();
  const { data, error } = await admin()
    .from("practice_attempts")
    .insert({
      id: input.id ?? createId(),
      user_id: userId,
      material_id: input.materialId,
      segment_id: input.segmentId,
      attempt_audio_path: input.attemptAudioPath,
      feedback_json_path: input.feedbackJsonPath ?? null,
      feedback_markdown_path: input.feedbackMarkdownPath ?? null,
      recognized_text: input.recognizedText,
      pron_score: input.pronScore,
      accuracy_score: input.accuracyScore,
      fluency_score: input.fluencyScore,
      completeness_score: input.completenessScore,
      word_results_json: jsonStringify(input.wordResultsJson),
      provider_raw_json: jsonStringify(input.providerRawJson),
      analysis_json: jsonStringify(input.analysisJson),
      created_at: input.createdAt ?? nowIso(),
    })
    .select("*")
    .single();

  if (error) {
    fail("Failed to create attempt", error);
  }

  return rowToAttempt(data);
};

export const updateAttemptAnalysis = async (
  attemptId: string,
  patch: {
    analysisJson: unknown;
    feedbackJsonPath?: string | null;
    feedbackMarkdownPath?: string | null;
  },
) => {
  const userId = await currentUserId();
  const { data, error } = await admin()
    .from("practice_attempts")
    .update({
      analysis_json: jsonStringify(patch.analysisJson),
      feedback_json_path: patch.feedbackJsonPath ?? null,
      feedback_markdown_path: patch.feedbackMarkdownPath ?? null,
    })
    .eq("user_id", userId)
    .eq("id", attemptId)
    .select("*")
    .single();

  if (error) {
    fail("Failed to update attempt analysis", error);
  }

  return rowToAttempt(data);
};

export const updateAttemptSegment = async (attemptId: string, segmentId: string | null) => {
  const userId = await currentUserId();
  const { data, error } = await admin()
    .from("practice_attempts")
    .update({ segment_id: segmentId })
    .eq("user_id", userId)
    .eq("id", attemptId)
    .select("*")
    .single();

  if (error) {
    fail("Failed to update attempt association", error);
  }

  return rowToAttempt(data);
};

export const deleteAttempt = async (attemptId: string) => {
  const userId = await currentUserId();
  const attempt = await getAttempt(attemptId);
  if (!attempt) {
    throw new Error("Attempt not found.");
  }

  const { error } = await admin()
    .from("practice_attempts")
    .delete()
    .eq("user_id", userId)
    .eq("id", attemptId);

  if (error) {
    fail("Failed to delete attempt", error);
  }

  return attempt;
};

export const getAttempt = async (attemptId: string) => {
  const userId = await currentUserId();
  const { data, error } = await admin()
    .from("practice_attempts")
    .select("*")
    .eq("user_id", userId)
    .eq("id", attemptId)
    .maybeSingle();

  if (error) {
    fail("Failed to load attempt", error);
  }

  return data ? rowToAttempt(data) : null;
};

export const listAttemptsForMaterial = async (materialId: string) => {
  const userId = await currentUserId();
  const { data, error } = await admin()
    .from("practice_attempts")
    .select("*")
    .eq("user_id", userId)
    .eq("material_id", materialId)
    .order("created_at", { ascending: false });

  if (error) {
    fail("Failed to list attempts", error);
  }

  return (data ?? []).map(rowToAttempt);
};

export const listLatestAttemptsBySegment = async (materialId: string) => {
  const attempts = await listAttemptsForMaterial(materialId);
  const latest = new Map<string, PracticeAttempt>();

  for (const attempt of attempts) {
    if (attempt.segmentId && !latest.has(attempt.segmentId)) {
      latest.set(attempt.segmentId, attempt);
    }
  }

  return latest;
};

export const listWeakPatterns = async () => {
  const userId = await currentUserId();
  const { data, error } = await admin()
    .from("weak_patterns")
    .select("*")
    .eq("user_id", userId)
    .order("severity", { ascending: false })
    .order("last_seen_at", { ascending: false });

  if (error) {
    fail("Failed to list weak patterns", error);
  }

  return (data ?? []).map(rowToWeakPattern);
};

export const upsertWeakPattern = async (input: {
  patternType: WeakPattern["patternType"];
  patternKey: string;
  displayText: string;
  severity: number;
  lastSegmentText: string;
  notesJson: Record<string, unknown>;
}) => {
  const userId = await currentUserId();
  const { data: existing, error: existingError } = await admin()
    .from("weak_patterns")
    .select("*")
    .eq("user_id", userId)
    .eq("pattern_type", input.patternType)
    .eq("pattern_key", input.patternKey)
    .maybeSingle();

  if (existingError) {
    fail("Failed to load weak pattern", existingError);
  }

  if (!existing) {
    const { data, error } = await admin()
      .from("weak_patterns")
      .insert({
        id: createId(),
        user_id: userId,
        pattern_type: input.patternType,
        pattern_key: input.patternKey,
        display_text: input.displayText,
        severity: input.severity,
        evidence_count: 1,
        last_seen_at: nowIso(),
        last_segment_text: input.lastSegmentText,
        notes_json: jsonStringify(input.notesJson),
      })
      .select("*")
      .single();

    if (error) {
      fail("Failed to create weak pattern", error);
    }

    return rowToWeakPattern(data);
  }

  const current = rowToWeakPattern(existing);
  const { data, error } = await admin()
    .from("weak_patterns")
    .update({
      display_text: input.displayText,
      severity: Math.max(current.severity, input.severity),
      evidence_count: current.evidenceCount + 1,
      last_seen_at: nowIso(),
      last_segment_text: input.lastSegmentText,
      notes_json: jsonStringify({
        ...current.notesJson,
        ...input.notesJson,
      }),
    })
    .eq("user_id", userId)
    .eq("id", current.id)
    .select("*")
    .single();

  if (error) {
    fail("Failed to update weak pattern", error);
  }

  return rowToWeakPattern(data);
};

export const addWeakPatternEvidence = async (input: {
  weakPatternId: string;
  attemptId: string;
  segmentId: string;
  token: string;
  score: number | null;
  errorType: string | null;
}) => {
  const userId = await currentUserId();
  const { error } = await admin().from("weak_pattern_evidence").insert({
    id: createId(),
    user_id: userId,
    weak_pattern_id: input.weakPatternId,
    attempt_id: input.attemptId,
    segment_id: input.segmentId,
    token: input.token,
    score: input.score,
    error_type: input.errorType,
    created_at: nowIso(),
  });

  if (error) {
    fail("Failed to add weak pattern evidence", error);
  }
};

export const listWeakPatternEvidenceForKey = async (
  patternType: string,
  patternKey: string,
) => {
  const userId = await currentUserId();
  const { data, error } = await admin()
    .from("weak_pattern_evidence")
    .select("*, weak_patterns!inner(pattern_type, pattern_key)")
    .eq("user_id", userId)
    .eq("weak_patterns.pattern_type", patternType)
    .eq("weak_patterns.pattern_key", patternKey)
    .order("created_at", { ascending: false });

  if (error) {
    fail("Failed to list weak pattern evidence", error);
  }

  return data ?? [];
};
