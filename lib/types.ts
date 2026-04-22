export type MaterialKind = "text" | "audio";
export type MaterialStatus = "draft" | "ready" | "needs-review" | "needs-config" | "error";
export type SegmentSource = "text" | "transcription" | "manual";
export type WeakPatternType =
  | "word_pronunciation"
  | "liaison_elision"
  | "nasal_vowel"
  | "vowel_quality"
  | "silent_letter"
  | "fluency_pause"
  | "omission_insertion";

export type StudyMaterial = {
  id: string;
  kind: MaterialKind;
  locale: string;
  title: string;
  sourceText: string;
  sourceAudioPath: string | null;
  status: MaterialStatus;
  statusDetail: string | null;
  createdAt: string;
};

export type SentenceSegment = {
  id: string;
  materialId: string;
  index: number;
  text: string;
  normalizedText: string;
  startMs: number | null;
  endMs: number | null;
  ttsAudioPath: string | null;
  source: SegmentSource;
  createdAt: string;
};

export type WordAssessment = {
  word: string;
  accuracyScore: number | null;
  errorType: string | null;
  syllables?: Array<{
    syllable: string;
    accuracyScore: number | null;
  }>;
  phonemes?: Array<{
    phoneme: string;
    accuracyScore: number | null;
  }>;
};

export type KimiAnalysis = {
  summary: string;
  nextDrill: string;
  weakPatterns: Array<{
    type: WeakPatternType;
    key: string;
    displayText: string;
    severity: number;
    reason: string;
  }>;
  highlightTokens: string[];
};

export type PracticeAttempt = {
  id: string;
  segmentId: string;
  attemptAudioPath: string;
  feedbackJsonPath: string | null;
  feedbackMarkdownPath: string | null;
  recognizedText: string;
  pronScore: number | null;
  accuracyScore: number | null;
  fluencyScore: number | null;
  completenessScore: number | null;
  wordResultsJson: WordAssessment[];
  providerRawJson: Record<string, unknown>;
  analysisJson: KimiAnalysis;
  createdAt: string;
};

export type WeakPattern = {
  id: string;
  patternType: WeakPatternType;
  patternKey: string;
  displayText: string;
  severity: number;
  evidenceCount: number;
  lastSeenAt: string;
  lastSegmentText: string;
  notesJson: Record<string, unknown>;
};

export type EditableSegmentInput = {
  id?: string;
  index: number;
  text: string;
  startMs: number | null;
  endMs: number | null;
  source: SegmentSource;
};

export type HighlightToken = {
  token: string;
  normalized: string;
  severity: number;
  reason: string;
};

export type PracticeSegmentView = SentenceSegment & {
  latestAttempt: PracticeAttempt | null;
  attempts: PracticeAttempt[];
  highlights: HighlightToken[];
};

export type PracticeMaterialView = {
  material: StudyMaterial;
  segments: PracticeSegmentView[];
  focusItems: Array<{
    patternType: WeakPatternType;
    displayText: string;
    severity: number;
    reason: string;
  }>;
};

export type FastTranscriptionResult = {
  fullText: string;
  durationMilliseconds: number | null;
  phrases: Array<{
    text: string;
    offsetMilliseconds: number | null;
    durationMilliseconds: number | null;
    confidence: number | null;
    words: Array<{
      text: string;
      offsetMilliseconds: number | null;
      durationMilliseconds: number | null;
    }>;
  }>;
  raw: Record<string, unknown>;
};

export type PronunciationResult = {
  recognizedText: string;
  pronScore: number | null;
  accuracyScore: number | null;
  fluencyScore: number | null;
  completenessScore: number | null;
  words: WordAssessment[];
  raw: Record<string, unknown>;
};
