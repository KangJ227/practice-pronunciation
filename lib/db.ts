import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { mkdirSync } from "node:fs";
import type {
  EditableSegmentInput,
  PracticeAttempt,
  SentenceSegment,
  StudyMaterial,
  WeakPattern,
} from "@/lib/types";
import { createId, jsonParse, jsonStringify, nowIso } from "@/lib/utils";

const storageDir = path.join(process.cwd(), "storage");
mkdirSync(storageDir, { recursive: true });

const dbPath = path.join(storageDir, "app.sqlite");

const globalForDb = globalThis as unknown as {
  pronunciationDb?: DatabaseSync;
};

const ensureColumnExists = (
  db: DatabaseSync,
  tableName: string,
  columnName: string,
  definition: string,
) => {
  const columns = db
    .prepare(`PRAGMA table_info(${tableName})`)
    .all() as Array<Record<string, unknown>>;

  if (columns.some((column) => String(column.name) === columnName)) {
    return;
  }

  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
};

const initDb = () => {
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS materials (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      locale TEXT NOT NULL,
      title TEXT NOT NULL,
      source_text TEXT NOT NULL DEFAULT '',
      source_audio_path TEXT,
      status TEXT NOT NULL,
      status_detail TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sentence_segments (
      id TEXT PRIMARY KEY,
      material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
      idx INTEGER NOT NULL,
      text TEXT NOT NULL,
      normalized_text TEXT NOT NULL,
      start_ms INTEGER,
      end_ms INTEGER,
      tts_audio_path TEXT,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sentence_segments_material_idx
      ON sentence_segments (material_id, idx);

    CREATE TABLE IF NOT EXISTS practice_attempts (
      id TEXT PRIMARY KEY,
      segment_id TEXT NOT NULL REFERENCES sentence_segments(id) ON DELETE CASCADE,
      attempt_audio_path TEXT NOT NULL,
      recognized_text TEXT NOT NULL DEFAULT '',
      pron_score REAL,
      accuracy_score REAL,
      fluency_score REAL,
      completeness_score REAL,
      word_results_json TEXT NOT NULL,
      provider_raw_json TEXT NOT NULL,
      analysis_json TEXT NOT NULL,
      feedback_json_path TEXT,
      feedback_markdown_path TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_practice_attempts_segment_created
      ON practice_attempts (segment_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS weak_patterns (
      id TEXT PRIMARY KEY,
      pattern_type TEXT NOT NULL,
      pattern_key TEXT NOT NULL,
      display_text TEXT NOT NULL,
      severity INTEGER NOT NULL,
      evidence_count INTEGER NOT NULL,
      last_seen_at TEXT NOT NULL,
      last_segment_text TEXT NOT NULL,
      notes_json TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_weak_patterns_key
      ON weak_patterns (pattern_type, pattern_key);

    CREATE TABLE IF NOT EXISTS weak_pattern_evidence (
      id TEXT PRIMARY KEY,
      weak_pattern_id TEXT NOT NULL REFERENCES weak_patterns(id) ON DELETE CASCADE,
      attempt_id TEXT NOT NULL REFERENCES practice_attempts(id) ON DELETE CASCADE,
      segment_id TEXT NOT NULL REFERENCES sentence_segments(id) ON DELETE CASCADE,
      token TEXT NOT NULL,
      score REAL,
      error_type TEXT,
      created_at TEXT NOT NULL
      );
  `);
  ensureColumnExists(db, "practice_attempts", "feedback_json_path", "TEXT");
  ensureColumnExists(db, "practice_attempts", "feedback_markdown_path", "TEXT");
  return db;
};

export const getDb = () => {
  if (!globalForDb.pronunciationDb) {
    globalForDb.pronunciationDb = initDb();
  }

  return globalForDb.pronunciationDb;
};

const rowToMaterial = (row: Record<string, unknown>): StudyMaterial => ({
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

const rowToSegment = (row: Record<string, unknown>): SentenceSegment => ({
  id: String(row.id),
  materialId: String(row.material_id),
  index: Number(row.idx),
  text: String(row.text),
  normalizedText: String(row.normalized_text),
  startMs: row.start_ms === null ? null : Number(row.start_ms),
  endMs: row.end_ms === null ? null : Number(row.end_ms),
  ttsAudioPath: row.tts_audio_path ? String(row.tts_audio_path) : null,
  source: row.source as SentenceSegment["source"],
  createdAt: String(row.created_at),
});

const rowToAttempt = (row: Record<string, unknown>): PracticeAttempt => ({
  id: String(row.id),
  segmentId: String(row.segment_id),
  attemptAudioPath: String(row.attempt_audio_path),
  feedbackJsonPath: row.feedback_json_path ? String(row.feedback_json_path) : null,
  feedbackMarkdownPath: row.feedback_markdown_path ? String(row.feedback_markdown_path) : null,
  recognizedText: String(row.recognized_text ?? ""),
  pronScore: row.pron_score === null ? null : Number(row.pron_score),
  accuracyScore: row.accuracy_score === null ? null : Number(row.accuracy_score),
  fluencyScore: row.fluency_score === null ? null : Number(row.fluency_score),
  completenessScore:
    row.completeness_score === null ? null : Number(row.completeness_score),
  wordResultsJson: jsonParse(row.word_results_json as string, []),
  providerRawJson: jsonParse(row.provider_raw_json as string, {}),
  analysisJson: jsonParse(row.analysis_json as string, {
    summary: "",
    nextDrill: "",
    weakPatterns: [],
    highlightTokens: [],
  }),
  createdAt: String(row.created_at),
});

const rowToWeakPattern = (row: Record<string, unknown>): WeakPattern => ({
  id: String(row.id),
  patternType: row.pattern_type as WeakPattern["patternType"],
  patternKey: String(row.pattern_key),
  displayText: String(row.display_text),
  severity: Number(row.severity),
  evidenceCount: Number(row.evidence_count),
  lastSeenAt: String(row.last_seen_at),
  lastSegmentText: String(row.last_segment_text),
  notesJson: jsonParse(row.notes_json as string, {}),
});

export const listMaterials = () => {
  const rows = getDb()
    .prepare(
      `
        SELECT *
        FROM materials
        ORDER BY datetime(created_at) DESC
      `,
    )
    .all() as Record<string, unknown>[];

  return rows.map(rowToMaterial);
};

export const getMaterial = (materialId: string) => {
  const row = getDb()
    .prepare("SELECT * FROM materials WHERE id = ?")
    .get(materialId) as Record<string, unknown> | undefined;

  return row ? rowToMaterial(row) : null;
};

export const createMaterial = (input: {
  kind: StudyMaterial["kind"];
  locale: string;
  title: string;
  sourceText?: string;
  sourceAudioPath?: string | null;
  status: StudyMaterial["status"];
  statusDetail?: string | null;
}) => {
  const id = createId();
  const createdAt = nowIso();

  getDb()
    .prepare(
      `
        INSERT INTO materials (
          id, kind, locale, title, source_text, source_audio_path, status, status_detail, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      id,
      input.kind,
      input.locale,
      input.title,
      input.sourceText ?? "",
      input.sourceAudioPath ?? null,
      input.status,
      input.statusDetail ?? null,
      createdAt,
    );

  return getMaterial(id)!;
};

export const updateMaterial = (
  materialId: string,
  patch: Partial<Pick<StudyMaterial, "title" | "sourceText" | "sourceAudioPath" | "status" | "statusDetail">>,
) => {
  const material = getMaterial(materialId);
  if (!material) {
    throw new Error("Material not found.");
  }

  getDb()
    .prepare(
      `
        UPDATE materials
        SET title = ?,
            source_text = ?,
            source_audio_path = ?,
            status = ?,
            status_detail = ?
        WHERE id = ?
      `,
    )
    .run(
      patch.title ?? material.title,
      patch.sourceText ?? material.sourceText,
      patch.sourceAudioPath ?? material.sourceAudioPath,
      patch.status ?? material.status,
      patch.statusDetail ?? material.statusDetail,
      materialId,
    );

  return getMaterial(materialId)!;
};

export const deleteMaterial = (materialId: string) => {
  const material = getMaterial(materialId);
  if (!material) {
    throw new Error("Material not found.");
  }

  getDb().prepare("DELETE FROM materials WHERE id = ?").run(materialId);

  return material;
};

export const listSegmentsByMaterial = (materialId: string) => {
  const rows = getDb()
    .prepare(
      `
        SELECT *
        FROM sentence_segments
        WHERE material_id = ?
        ORDER BY idx ASC, datetime(created_at) ASC
      `,
    )
    .all(materialId) as Record<string, unknown>[];

  return rows.map(rowToSegment);
};

export const replaceSegments = (
  materialId: string,
  segments: EditableSegmentInput[],
  defaultCreatedAt = nowIso(),
) => {
  const db = getDb();
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM sentence_segments WHERE material_id = ?").run(materialId);

    const stmt = db.prepare(
      `
        INSERT INTO sentence_segments (
          id, material_id, idx, text, normalized_text, start_ms, end_ms, tts_audio_path, source, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    );

    for (const segment of segments) {
      stmt.run(
        segment.id ?? createId(),
        materialId,
        segment.index,
        segment.text,
        segment.text.trim().toLowerCase(),
        segment.startMs,
        segment.endMs,
        null,
        segment.source,
        defaultCreatedAt,
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return listSegmentsByMaterial(materialId);
};

export const updateSegmentTtsPath = (segmentId: string, ttsAudioPath: string | null) => {
  getDb()
    .prepare("UPDATE sentence_segments SET tts_audio_path = ? WHERE id = ?")
    .run(ttsAudioPath, segmentId);
};

export const getSegment = (segmentId: string) => {
  const row = getDb()
    .prepare("SELECT * FROM sentence_segments WHERE id = ?")
    .get(segmentId) as Record<string, unknown> | undefined;

  return row ? rowToSegment(row) : null;
};

export const createAttempt = (input: {
  id?: string;
  createdAt?: string;
  segmentId: string;
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
  const id = input.id ?? createId();
  const createdAt = input.createdAt ?? nowIso();

  getDb()
    .prepare(
      `
        INSERT INTO practice_attempts (
          id, segment_id, attempt_audio_path, recognized_text, pron_score, accuracy_score,
          fluency_score, completeness_score, word_results_json, provider_raw_json, analysis_json,
          feedback_json_path, feedback_markdown_path, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      id,
      input.segmentId,
      input.attemptAudioPath,
      input.recognizedText,
      input.pronScore,
      input.accuracyScore,
      input.fluencyScore,
      input.completenessScore,
      jsonStringify(input.wordResultsJson),
      jsonStringify(input.providerRawJson),
      jsonStringify(input.analysisJson),
      input.feedbackJsonPath ?? null,
      input.feedbackMarkdownPath ?? null,
      createdAt,
    );

  return getAttempt(id)!;
};

export const updateAttemptAnalysis = (
  attemptId: string,
  patch: Pick<PracticeAttempt, "analysisJson" | "feedbackJsonPath" | "feedbackMarkdownPath">,
) => {
  const attempt = getAttempt(attemptId);
  if (!attempt) {
    throw new Error("Attempt not found.");
  }

  getDb()
    .prepare(
      `
        UPDATE practice_attempts
        SET analysis_json = ?,
            feedback_json_path = ?,
            feedback_markdown_path = ?
        WHERE id = ?
      `,
    )
    .run(
      jsonStringify(patch.analysisJson),
      patch.feedbackJsonPath,
      patch.feedbackMarkdownPath,
      attemptId,
    );

  return getAttempt(attemptId)!;
};

export const getAttempt = (attemptId: string) => {
  const row = getDb()
    .prepare("SELECT * FROM practice_attempts WHERE id = ?")
    .get(attemptId) as Record<string, unknown> | undefined;

  return row ? rowToAttempt(row) : null;
};

export const listAttemptsForMaterial = (materialId: string) => {
  const rows = getDb()
    .prepare(
      `
        SELECT pa.*
        FROM practice_attempts pa
        INNER JOIN sentence_segments ss ON ss.id = pa.segment_id
        WHERE ss.material_id = ?
        ORDER BY datetime(pa.created_at) DESC
      `,
    )
    .all(materialId) as Record<string, unknown>[];

  return rows.map(rowToAttempt);
};

export const listLatestAttemptsBySegment = (materialId: string) => {
  const rows = getDb()
    .prepare(
      `
        SELECT pa.*
        FROM practice_attempts pa
        INNER JOIN sentence_segments ss ON ss.id = pa.segment_id
        INNER JOIN (
          SELECT segment_id, MAX(datetime(created_at)) AS latest_created
          FROM practice_attempts
          GROUP BY segment_id
        ) latest
          ON latest.segment_id = pa.segment_id
         AND latest.latest_created = datetime(pa.created_at)
        WHERE ss.material_id = ?
      `,
    )
    .all(materialId) as Record<string, unknown>[];

  return rows.map(rowToAttempt);
};

export const listWeakPatterns = () => {
  const rows = getDb()
    .prepare(
      `
        SELECT *
        FROM weak_patterns
        ORDER BY severity DESC, evidence_count DESC, datetime(last_seen_at) DESC
      `,
    )
    .all() as Record<string, unknown>[];

  return rows.map(rowToWeakPattern);
};

export const upsertWeakPattern = (input: {
  patternType: WeakPattern["patternType"];
  patternKey: string;
  displayText: string;
  severity: number;
  lastSegmentText: string;
  notesJson?: Record<string, unknown>;
}) => {
  const db = getDb();
  const existing = db
    .prepare(
      "SELECT * FROM weak_patterns WHERE pattern_type = ? AND pattern_key = ?",
    )
    .get(input.patternType, input.patternKey) as Record<string, unknown> | undefined;

  if (!existing) {
    const id = createId();
    const lastSeenAt = nowIso();

    db.prepare(
      `
        INSERT INTO weak_patterns (
          id, pattern_type, pattern_key, display_text, severity, evidence_count,
          last_seen_at, last_segment_text, notes_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
      id,
      input.patternType,
      input.patternKey,
      input.displayText,
      input.severity,
      1,
      lastSeenAt,
      input.lastSegmentText,
      jsonStringify(input.notesJson ?? {}),
    );

    return listWeakPatterns().find((pattern) => pattern.id === id)!;
  }

  const current = rowToWeakPattern(existing);
  db.prepare(
    `
      UPDATE weak_patterns
      SET display_text = ?,
          severity = ?,
          evidence_count = ?,
          last_seen_at = ?,
          last_segment_text = ?,
          notes_json = ?
      WHERE id = ?
    `,
  ).run(
    input.displayText,
    Math.max(current.severity, input.severity),
    current.evidenceCount + 1,
    nowIso(),
    input.lastSegmentText,
    jsonStringify({
      ...current.notesJson,
      ...(input.notesJson ?? {}),
    }),
    current.id,
  );

  return listWeakPatterns().find((pattern) => pattern.id === current.id)!;
};

export const addWeakPatternEvidence = (input: {
  weakPatternId: string;
  attemptId: string;
  segmentId: string;
  token: string;
  score: number | null;
  errorType: string | null;
}) => {
  getDb()
    .prepare(
      `
        INSERT INTO weak_pattern_evidence (
          id, weak_pattern_id, attempt_id, segment_id, token, score, error_type, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      createId(),
      input.weakPatternId,
      input.attemptId,
      input.segmentId,
      input.token,
      input.score,
      input.errorType,
      nowIso(),
    );
};

export const listWeakPatternEvidenceForKey = (patternType: string, patternKey: string) => {
  const rows = getDb()
    .prepare(
      `
        SELECT wpe.*
        FROM weak_pattern_evidence wpe
        INNER JOIN weak_patterns wp ON wp.id = wpe.weak_pattern_id
        WHERE wp.pattern_type = ? AND wp.pattern_key = ?
        ORDER BY datetime(wpe.created_at) DESC
      `,
    )
    .all(patternType, patternKey) as Record<string, unknown>[];

  return rows;
};
