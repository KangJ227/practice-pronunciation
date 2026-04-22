import path from "node:path";
import { getAttemptFeedbackPaths, writeAttemptFeedbackArtifacts } from "@/lib/attempt-feedback";
import { appConfig, isAzureSpeechConfigured } from "@/lib/config";
import {
  addWeakPatternEvidence,
  createAttempt,
  createMaterial,
  getMaterial,
  getSegment,
  listAttemptsForMaterial,
  listMaterials,
  listSegmentsByMaterial,
  listWeakPatternEvidenceForKey,
  listWeakPatterns,
  replaceSegments,
  updateMaterial,
  updateSegmentTtsPath,
  upsertWeakPattern,
} from "@/lib/db";
import {
  autoSplitSegment,
  inferWeakPatternTypeForToken,
  joinSegmentsText,
  normalizeSentenceText,
  normalizeWhitespace,
  splitFrenchSentences,
} from "@/lib/text";
import {
  computeSegmentHighlights,
  buildFocusItems,
} from "@/lib/highlights";
import {
  assessPronunciation,
  fastTranscribeAudio,
  synthesizeSentenceAudio,
} from "@/lib/providers/azure";
import { analyzeAttemptWithKimi } from "@/lib/providers/kimi";
import type {
  EditableSegmentInput,
  FastTranscriptionResult,
  KimiAnalysis,
  PracticeAttempt,
  PracticeMaterialView,
  PronunciationResult,
  SentenceSegment,
  StudyMaterial,
  WeakPattern,
  WordAssessment,
} from "@/lib/types";
import {
  convertToMonoWav,
  ensureAttemptAudioLimit,
  ensureMaterialAudioLimit,
  saveUploadedFile,
} from "@/lib/audio";
import { resolveStoragePath, storageUrl, writeBuffer } from "@/lib/storage";
import { createId, nowIso } from "@/lib/utils";

const ttsErrorMessage =
  "Azure Speech is not configured, so reference TTS audio could not be generated yet.";

const normalizeSegments = (segments: EditableSegmentInput[]) =>
  segments
    .map((segment, index) => ({
      ...segment,
      index,
      text: normalizeSentenceText(segment.text),
    }))
    .filter((segment) => segment.text);

export const getDashboardMaterials = () =>
  listMaterials().map((material) => ({
    ...material,
    practiceHref: `/materials/${material.id}/practice`,
    editHref: `/materials/${material.id}/edit`,
  }));

export const createTextMaterialWorkflow = async (input: {
  title: string;
  text: string;
  locale?: string;
}) => {
  const locale = input.locale ?? appConfig.locale;
  const sourceText = normalizeWhitespace(input.text);
  const sentences = splitFrenchSentences(sourceText);

  if (sentences.length === 0) {
    throw new Error("Please provide some French text to practice.");
  }

  const material = createMaterial({
    kind: "text",
    locale,
    title: input.title.trim() || inferTitle(sentences[0]),
    sourceText,
    status: "needs-review",
    statusDetail: null,
  });

  const segments = replaceSegments(
    material.id,
    sentences.map((sentence, index) => ({
      index,
      text: sentence,
      startMs: null,
      endMs: null,
      source: "text" as const,
    })),
  );

  await generateReferenceAudio(material, segments);

  return {
    material: getMaterial(material.id)!,
    segments: listSegmentsByMaterial(material.id),
  };
};

export const createAudioMaterialWorkflow = async (input: {
  title: string;
  file: File;
  locale?: string;
}) => {
  const locale = input.locale ?? appConfig.locale;
  const material = createMaterial({
    kind: "audio",
    locale,
    title: input.title.trim() || stripExtension(input.file.name),
    sourceText: "",
    status: "draft",
    statusDetail: null,
  });

  const saved = await saveUploadedFile(input.file, `materials/${material.id}/source`, "source");
  await ensureMaterialAudioLimit(saved.fullPath);
  updateMaterial(material.id, { sourceAudioPath: saved.storageKey });

  if (!isAzureSpeechConfigured()) {
    return {
      material: updateMaterial(material.id, {
        status: "needs-config",
        statusDetail:
          "Azure Speech is required to transcribe uploaded audio. The source audio is saved and can be processed once credentials are configured.",
      }),
      segments: [],
      transcription: null,
    };
  }

  try {
    const transcription = await fastTranscribeAudio(saved.fullPath, input.file.name, locale);
    const initialSegments = buildSegmentsFromTranscription(transcription);
    const persistedSegments = replaceSegments(material.id, initialSegments);

    await updateMaterial(material.id, {
      sourceText: transcription.fullText || joinSegmentsText(persistedSegments),
      status: "needs-review",
      statusDetail:
        "Review the transcript and merge or split any lines before starting practice.",
    });

    await generateReferenceAudio(getMaterial(material.id)!, persistedSegments);

    return {
      material: getMaterial(material.id)!,
      segments: listSegmentsByMaterial(material.id),
      transcription,
    };
  } catch (error) {
    return {
      material: updateMaterial(material.id, {
        status: "error",
        statusDetail: error instanceof Error ? error.message : "Audio transcription failed.",
      }),
      segments: [],
      transcription: null,
    };
  }
};

export const updateMaterialSegmentsWorkflow = async (
  materialId: string,
  segments: EditableSegmentInput[],
) => {
  const material = getMaterial(materialId);
  if (!material) {
    throw new Error("Material not found.");
  }

  const normalized = normalizeSegments(segments);
  if (normalized.length === 0) {
    throw new Error("At least one sentence is required.");
  }

  const persisted = replaceSegments(materialId, normalized);
  const sourceText = joinSegmentsText(persisted);
  updateMaterial(materialId, {
    sourceText,
    status: "ready",
    statusDetail: "Segments saved. You can start practice now.",
  });

  await generateReferenceAudio(getMaterial(materialId)!, persisted);

  return {
    material: getMaterial(materialId)!,
    segments: listSegmentsByMaterial(materialId),
  };
};

export const getMaterialEditorView = (materialId: string) => {
  const material = getMaterial(materialId);
  if (!material) {
    throw new Error("Material not found.");
  }

  return {
    material,
    segments: listSegmentsByMaterial(materialId),
  };
};

export const getPracticeMaterialView = (materialId: string): PracticeMaterialView => {
  const material = getMaterial(materialId);
  if (!material) {
    throw new Error("Material not found.");
  }

  const segments = listSegmentsByMaterial(materialId);
  const attemptsBySegment = new Map<string, PracticeAttempt[]>();
  for (const attempt of listAttemptsForMaterial(materialId)) {
    const current = attemptsBySegment.get(attempt.segmentId);
    if (current) {
      current.push(attempt);
      continue;
    }

    attemptsBySegment.set(attempt.segmentId, [attempt]);
  }
  const weakPatterns = listWeakPatterns();

  return {
    material,
    segments: segments.map((segment) => {
      const attempts = attemptsBySegment.get(segment.id) ?? [];
      return {
        ...segment,
        latestAttempt: attempts[0] ?? null,
        attempts,
        highlights: computeSegmentHighlights(segment, weakPatterns),
      };
    }),
    focusItems: buildFocusItems(weakPatterns),
  };
};

export const recomputeHighlightsWorkflow = (materialId: string) => {
  const view = getPracticeMaterialView(materialId);

  return {
    highlightMap: Object.fromEntries(
      view.segments.map((segment) => [segment.id, segment.highlights]),
    ),
    focusItems: view.focusItems,
  };
};

export const submitAttemptWorkflow = async (input: {
  segmentId: string;
  file: File;
}) => {
  const segment = getSegment(input.segmentId);
  if (!segment) {
    throw new Error("Segment not found.");
  }

  const material = getMaterial(segment.materialId);
  if (!material) {
    throw new Error("Parent material not found.");
  }

  const saved = await saveUploadedFile(
    input.file,
    `attempts/${segment.id}/raw`,
    "attempt",
  );
  await ensureAttemptAudioLimit(saved.fullPath);

  const wavStorageKey = path.posix.join(
    "attempts",
    segment.id,
    "normalized",
    `${path.basename(saved.storageKey, path.extname(saved.storageKey))}.wav`,
  );
  const wavPath = await convertToMonoWav(saved.fullPath, wavStorageKey);

  const pronunciation = await runPronunciationAssessment(segment.text, wavPath);
  const history = listWeakPatterns();
  const analysis = await analyzeAttemptWithKimi({
    referenceText: segment.text,
    recognizedText: pronunciation.recognizedText,
    pronScore: pronunciation.pronScore,
    accuracyScore: pronunciation.accuracyScore,
    fluencyScore: pronunciation.fluencyScore,
    completenessScore: pronunciation.completenessScore,
    wordResults: pronunciation.words,
    history,
  });

  const attemptId = createId();
  const createdAt = nowIso();
  const feedbackPaths = getAttemptFeedbackPaths({
    id: attemptId,
    segmentId: segment.id,
  });
  const attemptDraft: PracticeAttempt = {
    id: attemptId,
    segmentId: segment.id,
    attemptAudioPath: wavStorageKey,
    feedbackJsonPath: feedbackPaths.feedbackJsonPath,
    feedbackMarkdownPath: feedbackPaths.feedbackMarkdownPath,
    recognizedText: pronunciation.recognizedText,
    pronScore: pronunciation.pronScore,
    accuracyScore: pronunciation.accuracyScore,
    fluencyScore: pronunciation.fluencyScore,
    completenessScore: pronunciation.completenessScore,
    wordResultsJson: pronunciation.words,
    providerRawJson: pronunciation.raw,
    analysisJson: analysis,
    createdAt,
  };

  await writeAttemptFeedbackArtifacts({
    material,
    segment,
    attempt: attemptDraft,
  });

  const attempt = createAttempt({
    id: attemptDraft.id,
    createdAt: attemptDraft.createdAt,
    segmentId: segment.id,
    attemptAudioPath: wavStorageKey,
    feedbackJsonPath: attemptDraft.feedbackJsonPath,
    feedbackMarkdownPath: attemptDraft.feedbackMarkdownPath,
    recognizedText: pronunciation.recognizedText,
    pronScore: pronunciation.pronScore,
    accuracyScore: pronunciation.accuracyScore,
    fluencyScore: pronunciation.fluencyScore,
    completenessScore: pronunciation.completenessScore,
    wordResultsJson: pronunciation.words,
    providerRawJson: pronunciation.raw,
    analysisJson: analysis,
  });

  await rememberWeakPatterns({
    segment,
    attemptId: attempt.id,
    words: pronunciation.words,
    analysis,
  });

  return {
    attempt,
    practice: getPracticeMaterialView(segment.materialId),
  };
};

const runPronunciationAssessment = async (
  referenceText: string,
  wavPath: string,
): Promise<PronunciationResult> => {
  if (!isAzureSpeechConfigured()) {
    return {
      recognizedText: "",
      pronScore: null,
      accuracyScore: null,
      fluencyScore: null,
      completenessScore: null,
      words: [],
      raw: {
        status: "degraded",
        message:
          "Azure Speech is not configured, so pronunciation assessment could not run. The attempt audio was still saved.",
      },
    };
  }

  try {
    return await assessPronunciation(wavPath, referenceText, appConfig.locale);
  } catch (error) {
    return {
      recognizedText: "",
      pronScore: null,
      accuracyScore: null,
      fluencyScore: null,
      completenessScore: null,
      words: [],
      raw: {
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Azure Speech pronunciation assessment failed.",
      },
    };
  }
};

const rememberWeakPatterns = async (input: {
  segment: SentenceSegment;
  attemptId: string;
  words: WordAssessment[];
  analysis: KimiAnalysis;
}) => {
  const seededKeys = new Set<string>();

  for (const word of input.words) {
    const normalizedWord = word.word.toLowerCase();
    if (!normalizedWord) {
      continue;
    }

    const score = word.accuracyScore ?? 100;
    const hasStrongError = /omission|insertion/i.test(word.errorType ?? "");
    const isLowWord = score < 75;

    if (!hasStrongError && !isLowWord) {
      continue;
    }

    const patternType = hasStrongError
      ? ("omission_insertion" as const)
      : inferWeakPatternTypeForToken(normalizedWord);
    const evidence = listWeakPatternEvidenceForKey(patternType, normalizedWord);

    if (!hasStrongError && evidence.length === 0) {
      // First low-score exact-word evidence only seeds memory; highlight starts on the second hit.
      const existing = upsertWeakPattern({
        patternType,
        patternKey: normalizedWord,
        displayText: word.word,
        severity: score < 60 ? 3 : 2,
        lastSegmentText: input.segment.text,
        notesJson: {
          reason: "Repeated low word score from Azure pronunciation assessment.",
        },
      });
      addWeakPatternEvidence({
        weakPatternId: existing.id,
        attemptId: input.attemptId,
        segmentId: input.segment.id,
        token: word.word,
        score: word.accuracyScore,
        errorType: word.errorType,
      });
      seededKeys.add(`${patternType}:${normalizedWord}`);
      continue;
    }

    const weakPattern = upsertWeakPattern({
      patternType,
      patternKey: normalizedWord,
      displayText: word.word,
      severity: hasStrongError || score < 60 ? 3 : 2,
      lastSegmentText: input.segment.text,
      notesJson: {
        reason: hasStrongError
          ? `Azure detected ${String(word.errorType).toLowerCase()} for this word.`
          : "This word has scored low more than once.",
      },
    });
    addWeakPatternEvidence({
      weakPatternId: weakPattern.id,
      attemptId: input.attemptId,
      segmentId: input.segment.id,
      token: word.word,
      score: word.accuracyScore,
      errorType: word.errorType,
    });
    seededKeys.add(`${patternType}:${normalizedWord}`);
  }

  for (const pattern of input.analysis.weakPatterns) {
    const key = `${pattern.type}:${pattern.key}`;
    if (seededKeys.has(key) || !pattern.key) {
      continue;
    }

    const weakPattern = upsertWeakPattern({
      patternType: pattern.type,
      patternKey: pattern.key,
      displayText: pattern.displayText,
      severity: pattern.severity,
      lastSegmentText: input.segment.text,
      notesJson: {
        reason: pattern.reason,
      },
    });

    addWeakPatternEvidence({
      weakPatternId: weakPattern.id,
      attemptId: input.attemptId,
      segmentId: input.segment.id,
      token: pattern.displayText,
      score: null,
      errorType: null,
    });
  }
};

const generateReferenceAudio = async (
  material: StudyMaterial,
  segments: SentenceSegment[],
) => {
  if (!isAzureSpeechConfigured()) {
    updateMaterial(material.id, {
      statusDetail: material.statusDetail || ttsErrorMessage,
    });
    return;
  }

  for (const segment of segments) {
    if (segment.ttsAudioPath) {
      continue;
    }

    try {
      const audioBuffer = await synthesizeSentenceAudio(segment.text, material.locale);
      const storageKey = await writeBuffer(
        `materials/${material.id}/tts`,
        `segment-${segment.index + 1}.mp3`,
        audioBuffer,
      );
      updateSegmentTtsPath(segment.id, storageKey);
    } catch (error) {
      updateMaterial(material.id, {
        statusDetail:
          error instanceof Error ? error.message : "Reference audio generation failed.",
      });
      break;
    }
  }
};

const buildSegmentsFromTranscription = (transcription: FastTranscriptionResult) =>
  (transcription.phrases.length > 0
    ? transcription.phrases
    : splitFrenchSentences(transcription.fullText).map((text) => ({
        text,
        offsetMilliseconds: null,
        durationMilliseconds: null,
        confidence: null,
        words: [],
      }))
  ).map((phrase, index) => ({
    index,
    text: normalizeSentenceText(phrase.text),
    startMs: phrase.offsetMilliseconds,
    endMs:
      phrase.offsetMilliseconds !== null && phrase.durationMilliseconds !== null
        ? phrase.offsetMilliseconds + phrase.durationMilliseconds
        : null,
    source: "transcription" as const,
  }));

export const expandSegmentByAutoSplit = (segment: EditableSegmentInput) => {
  const parts = autoSplitSegment(segment.text);
  if (parts.length === 1) {
    return [segment];
  }

  return parts.map((part, index) => ({
    ...segment,
    id: index === 0 ? segment.id : undefined,
    text: part,
    index: segment.index + index,
    source: "manual" as const,
  }));
};

export const materialMedia = (materialId: string) => {
  const material = getMaterial(materialId);
  if (!material) {
    throw new Error("Material not found.");
  }

  const segments = listSegmentsByMaterial(materialId).map((segment) => ({
    ...segment,
    ttsUrl: storageUrl(segment.ttsAudioPath),
  }));

  return {
    material: {
      ...material,
      sourceAudioUrl: storageUrl(material.sourceAudioPath),
    },
    segments,
    attempts: listAttemptsForMaterial(materialId).map((attempt) => ({
      ...attempt,
      attemptAudioUrl: storageUrl(attempt.attemptAudioPath),
    })),
  };
};

const inferTitle = (text: string) => text.slice(0, 48) || "French practice";

const stripExtension = (filename: string) => filename.replace(/\.[^.]+$/, "");
