import path from "node:path";
import { promises as fs } from "node:fs";
import { writeAttemptFeedbackArtifacts } from "@/lib/attempt-feedback";
import { appConfig, isAzureSpeechConfigured } from "@/lib/config";
import {
  addWeakPatternEvidence,
  createAttempt,
  createMaterial,
  deleteAttempt,
  deleteMaterial,
  getAttempt,
  getMaterial,
  getSegment,
  getUserSettings,
  listAttemptsForMaterial,
  listMaterials,
  listSegmentsByMaterial,
  listWeakPatternEvidenceForKey,
  listWeakPatterns,
  replaceSegments,
  updateAttemptAnalysis,
  updateAttemptSegment,
  updateMaterial,
  updateSegmentStarred,
  updateSegmentTtsPath,
  updateUserSettings,
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
  shouldFallbackToSdkTranscription,
  synthesizeSentenceAudio,
  transcribeAudioWithSdk,
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
import {
  createSignedStorageUpload,
  readStorageFile,
  removeStorageFile,
  removeStoragePrefix,
  scopeStorageKey,
  storageUrl,
  writeBuffer,
  writeTempBuffer,
} from "@/lib/storage";
import { createId, nowIso } from "@/lib/utils";

const ttsErrorMessage =
  "Azure Speech is not configured, so reference TTS audio could not be generated yet.";

const emptyAnalysis = (): KimiAnalysis => ({
  summary: "",
  nextDrill: "",
  weakPatterns: [],
  highlightTokens: [],
});

type SavedAudioFile = {
  storageKey: string;
  fullPath: string;
  size?: number;
};

const normalizeSegments = (segments: EditableSegmentInput[]) =>
  segments
    .map((segment, index) => ({
      ...segment,
      index,
      text: normalizeSentenceText(segment.text),
    }))
    .filter((segment) => segment.text);

const removeTempFile = async (fullPath: string) => {
  await fs.unlink(fullPath).catch(() => undefined);
};

const attemptStoragePrefix = (storageKey: string | null | undefined) => {
  if (!storageKey) {
    return null;
  }

  const parts = storageKey.split("/");
  const attemptsIndex = parts.indexOf("attempts");
  if (attemptsIndex < 0 || !parts[attemptsIndex + 1]) {
    return null;
  }

  return parts.slice(0, attemptsIndex + 2).join("/");
};

export const getDashboardMaterials = async () =>
  (await listMaterials()).map((material) => ({
    ...material,
    practiceHref: `/materials/${material.id}/practice`,
    editHref: `/materials/${material.id}/edit`,
  }));

export const getSettingsView = async () => getUserSettings();

export const updateSettingsWorkflow = async (input: { ttsVoice: string }) => {
  const ttsVoice = input.ttsVoice.trim();
  if (!ttsVoice) {
    throw new Error("Please enter an Azure TTS voice name.");
  }

  if (ttsVoice.length > 120) {
    throw new Error("TTS voice name is too long.");
  }

  if (!/^[A-Za-z]{2,3}-[A-Za-z0-9-]+$/.test(ttsVoice)) {
    throw new Error("Use an Azure voice name like fr-FR-DeniseNeural.");
  }

  return updateUserSettings({ ttsVoice });
};

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

  const material = await createMaterial({
    kind: "text",
    locale,
    title: input.title.trim() || inferTitle(sentences[0]),
    sourceText,
    status: "needs-review",
    statusDetail: null,
  });

  const segments = await replaceSegments(
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
    material: (await getMaterial(material.id))!,
    segments: await listSegmentsByMaterial(material.id),
  };
};

export const createAudioMaterialWorkflow = async (input: {
  title: string;
  file: File;
  locale?: string;
}) => {
  const locale = input.locale ?? appConfig.locale;
  const material = await createMaterial({
    kind: "audio",
    locale,
    title: input.title.trim() || stripExtension(input.file.name),
    sourceText: "",
    status: "draft",
    statusDetail: null,
  });

  const saved = await saveUploadedFile(input.file, `materials/${material.id}/source`, "source");
  return processAudioMaterialSource({
    material,
    saved,
    originalFilename: input.file.name,
    locale,
  });
};

export const createAudioMaterialUploadWorkflow = async (input: {
  title: string;
  filename: string;
  locale?: string;
}) => {
  const locale = input.locale ?? appConfig.locale;
  const material = await createMaterial({
    kind: "audio",
    locale,
    title: input.title.trim() || stripExtension(input.filename),
    sourceText: "",
    status: "draft",
    statusDetail: null,
  });

  return {
    material,
    upload: await createSignedStorageUpload(
      `materials/${material.id}/source`,
      input.filename,
      "source",
    ),
  };
};

export const processAudioMaterialUploadWorkflow = async (input: {
  materialId: string;
  storageKey: string;
  filename: string;
}) => {
  const material = await getMaterial(input.materialId);
  if (!material) {
    throw new Error("Material not found.");
  }

  const expectedPrefix = await scopeStorageKey(`materials/${material.id}/source`);
  if (!input.storageKey.startsWith(`${expectedPrefix}/`)) {
    throw new Error("Uploaded audio path does not belong to this material.");
  }

  const temp = await writeTempBuffer(
    path.posix.basename(input.filename),
    await readStorageFile(input.storageKey),
  );

  try {
    return await processAudioMaterialSource({
      material,
      saved: {
        storageKey: input.storageKey,
        fullPath: temp.fullPath,
      },
      originalFilename: input.filename,
      locale: material.locale,
    });
  } finally {
    await removeTempFile(temp.fullPath);
  }
};

const processAudioMaterialSource = async (input: {
  material: StudyMaterial;
  saved: SavedAudioFile;
  originalFilename: string;
  locale: string;
}) => {
  const { material, saved, originalFilename, locale } = input;
  await updateMaterial(material.id, { sourceAudioPath: saved.storageKey });
  try {
    await ensureMaterialAudioLimit(saved.fullPath);
  } catch (error) {
    await updateMaterial(material.id, {
      status: "error",
      statusDetail: error instanceof Error ? error.message : "Uploaded audio is too long.",
    });
    throw error;
  }

  if (!isAzureSpeechConfigured()) {
    return {
      material: await updateMaterial(material.id, {
        status: "needs-config",
        statusDetail:
          "Azure Speech is required to transcribe uploaded audio. The source audio is saved and can be processed once credentials are configured.",
      }),
      segments: [],
      transcription: null,
    };
  }

  try {
    let transcription: FastTranscriptionResult;

    try {
      transcription = await fastTranscribeAudio(saved.fullPath, originalFilename, locale);
    } catch (error) {
      if (!shouldFallbackToSdkTranscription(error)) {
        throw error;
      }

      const wavStorageKey = path.posix.join(
        "materials",
        material.id,
        "transcription",
        `${path.basename(saved.storageKey, path.extname(saved.storageKey))}.wav`,
      );
      const wavPath = await convertToMonoWav(saved.fullPath, wavStorageKey);
      transcription = await transcribeAudioWithSdk(wavPath, locale);
    }

    const initialSegments = buildSegmentsFromTranscription(transcription);
    const persistedSegments = await replaceSegments(material.id, initialSegments);

    await updateMaterial(material.id, {
      sourceText: transcription.fullText || joinSegmentsText(persistedSegments),
      status: "needs-review",
      statusDetail:
        "Review the transcript and merge or split any lines before starting practice.",
    });

    await generateReferenceAudio((await getMaterial(material.id))!, persistedSegments);

    return {
      material: (await getMaterial(material.id))!,
      segments: await listSegmentsByMaterial(material.id),
      transcription,
    };
  } catch (error) {
    return {
      material: await updateMaterial(material.id, {
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
  const material = await getMaterial(materialId);
  if (!material) {
    throw new Error("Material not found.");
  }

  const normalized = normalizeSegments(segments);
  if (normalized.length === 0) {
    throw new Error("At least one sentence is required.");
  }

  const persisted = await replaceSegments(materialId, normalized);
  const sourceText = joinSegmentsText(persisted);
  await updateMaterial(materialId, {
    sourceText,
    status: "ready",
    statusDetail: "Segments saved. You can start practice now.",
  });

  await generateReferenceAudio((await getMaterial(materialId))!, persisted);

  return {
    material: (await getMaterial(materialId))!,
    segments: await listSegmentsByMaterial(materialId),
  };
};

export const regenerateMaterialTtsWorkflow = async (materialId: string) => {
  const material = await getMaterial(materialId);
  if (!material) {
    throw new Error("Material not found.");
  }

  const segments = await listSegmentsByMaterial(materialId);
  await generateReferenceAudio(material, segments, { force: true });

  return getPracticeMaterialView(materialId);
};

export const getMaterialEditorView = async (materialId: string) => {
  const material = await getMaterial(materialId);
  if (!material) {
    throw new Error("Material not found.");
  }
  const practice = await getPracticeMaterialView(materialId);

  return {
    material,
    segments: await listSegmentsByMaterial(materialId),
    attemptsBySegment: Object.fromEntries(
      practice.segments.map((segment) => [segment.id, segment.attempts]),
    ),
    unlinkedAttempts: practice.unlinkedAttempts,
  };
};

export const getPracticeMaterialView = async (materialId: string): Promise<PracticeMaterialView> => {
  const material = await getMaterial(materialId);
  if (!material) {
    throw new Error("Material not found.");
  }

  const segments = await listSegmentsByMaterial(materialId);
  const attemptsBySegment = new Map<string, PracticeAttempt[]>();
  const unlinkedAttempts: PracticeAttempt[] = [];
  for (const attempt of await listAttemptsForMaterial(materialId)) {
    if (!attempt.segmentId) {
      unlinkedAttempts.push(attempt);
      continue;
    }

    const current = attemptsBySegment.get(attempt.segmentId);
    if (current) {
      current.push(attempt);
      continue;
    }

    attemptsBySegment.set(attempt.segmentId, [attempt]);
  }
  const weakPatterns = await listWeakPatterns();

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
    unlinkedAttempts,
    focusItems: buildFocusItems(weakPatterns),
  };
};

export const recomputeHighlightsWorkflow = async (materialId: string) => {
  const view = await getPracticeMaterialView(materialId);

  return {
    highlightMap: Object.fromEntries(
      view.segments.map((segment) => [segment.id, segment.highlights]),
    ),
    focusItems: view.focusItems,
  };
};

export const deleteMaterialWorkflow = async (
  materialId: string,
  options: { onlyIfError?: boolean } = {},
) => {
  const material = await getMaterial(materialId);
  if (!material) {
    throw new Error("Material not found.");
  }
  if (options.onlyIfError && material.status !== "error") {
    throw new Error("Only ERROR sessions can be deleted from this action.");
  }

  const segments = await listSegmentsByMaterial(materialId);
  const attempts = await listAttemptsForMaterial(materialId);
  const storageKeys = [
    material.sourceAudioPath,
    ...segments.map((segment) => segment.ttsAudioPath),
    ...attempts.flatMap((attempt) => [
      attempt.attemptAudioPath,
      attempt.feedbackJsonPath,
      attempt.feedbackMarkdownPath,
    ]),
  ].filter((storageKey): storageKey is string => Boolean(storageKey));
  const attemptPrefixes = [
    ...segments.map((segment) => path.posix.join("attempts", segment.id)),
    ...attempts
      .map((attempt) => attemptStoragePrefix(attempt.attemptAudioPath))
      .filter((storageKey): storageKey is string => Boolean(storageKey)),
  ];

  await deleteMaterial(materialId);

  await Promise.all([
    ...storageKeys.map((storageKey) => removeStorageFile(storageKey)),
    removeStoragePrefix(path.posix.join("materials", materialId)),
    ...Array.from(new Set(attemptPrefixes)).map((storageKey) => removeStoragePrefix(storageKey)),
  ]);

  return material;
};

export const deleteErrorMaterialsWorkflow = async () => {
  const errorMaterials = (await listMaterials()).filter((material) => material.status === "error");

  for (const material of errorMaterials) {
    await deleteMaterialWorkflow(material.id, { onlyIfError: true });
  }

  return {
    deletedCount: errorMaterials.length,
    deletedIds: errorMaterials.map((material) => material.id),
  };
};

export const updateAttemptAssociationWorkflow = async (input: {
  attemptId: string;
  segmentId: string | null;
}) => {
  const attempt = await getAttempt(input.attemptId);
  if (!attempt) {
    throw new Error("Attempt not found.");
  }

  if (input.segmentId) {
    const segment = await getSegment(input.segmentId);
    if (!segment || segment.materialId !== attempt.materialId) {
      throw new Error("Target segment not found for this material.");
    }
  }

  const updatedAttempt = await updateAttemptSegment(input.attemptId, input.segmentId);

  return {
    attempt: updatedAttempt,
    practice: await getPracticeMaterialView(attempt.materialId),
  };
};

export const deleteAttemptWorkflow = async (attemptId: string) => {
  const attempt = await getAttempt(attemptId);
  if (!attempt) {
    throw new Error("Attempt not found.");
  }

  const storageKeys = [
    attempt.attemptAudioPath,
    attempt.feedbackJsonPath,
    attempt.feedbackMarkdownPath,
  ].filter((storageKey): storageKey is string => Boolean(storageKey));

  const deletedAttempt = await deleteAttempt(attemptId);
  await Promise.all(storageKeys.map((storageKey) => removeStorageFile(storageKey)));

  return {
    attempt: deletedAttempt,
    practice: await getPracticeMaterialView(deletedAttempt.materialId),
  };
};

export const updateSegmentStarredWorkflow = async (input: {
  segmentId: string;
  starred: boolean;
}) => {
  const segment = await getSegment(input.segmentId);
  if (!segment) {
    throw new Error("Segment not found.");
  }

  const updatedSegment = await updateSegmentStarred(input.segmentId, input.starred);

  return {
    segment: updatedSegment,
    practice: await getPracticeMaterialView(updatedSegment.materialId),
  };
};

export const submitAttemptWorkflow = async (input: {
  segmentId: string;
  file: File;
}) => {
  const saved = await saveUploadedFile(
    input.file,
    `attempts/${input.segmentId}/raw`,
    "attempt",
  );

  return scoreAttemptAudio({
    segmentId: input.segmentId,
    saved,
  });
};

export const createAttemptUploadWorkflow = async (input: {
  segmentId: string;
  filename: string;
}) => {
  const segment = await getSegment(input.segmentId);
  if (!segment) {
    throw new Error("Segment not found.");
  }

  return {
    upload: await createSignedStorageUpload(
      `attempts/${segment.id}/raw`,
      input.filename,
      "attempt",
    ),
  };
};

export const processAttemptUploadWorkflow = async (input: {
  segmentId: string;
  storageKey: string;
  filename: string;
}) => {
  const expectedPrefix = await scopeStorageKey(`attempts/${input.segmentId}/raw`);
  if (!input.storageKey.startsWith(`${expectedPrefix}/`)) {
    throw new Error("Uploaded attempt audio path does not belong to this sentence.");
  }

  const temp = await writeTempBuffer(
    path.posix.basename(input.filename),
    await readStorageFile(input.storageKey),
  );

  try {
    return await scoreAttemptAudio({
      segmentId: input.segmentId,
      saved: {
        storageKey: input.storageKey,
        fullPath: temp.fullPath,
      },
    });
  } finally {
    await removeTempFile(temp.fullPath);
  }
};

const scoreAttemptAudio = async (input: {
  segmentId: string;
  saved: SavedAudioFile;
}) => {
  const segment = await getSegment(input.segmentId);
  if (!segment) {
    throw new Error("Segment not found.");
  }

  const material = await getMaterial(segment.materialId);
  if (!material) {
    throw new Error("Parent material not found.");
  }

  const saved = input.saved;
  try {
    await ensureAttemptAudioLimit(saved.fullPath);
  } catch (error) {
    await removeStorageFile(saved.storageKey);
    throw error;
  }

  const wavStorageKey = path.posix.join(
    "attempts",
    segment.id,
    "normalized",
    `${path.basename(saved.storageKey, path.extname(saved.storageKey))}.wav`,
  );
  const wavPath = await convertToMonoWav(saved.fullPath, wavStorageKey);
  await removeStorageFile(saved.storageKey);

  const pronunciation = await runPronunciationAssessment(segment.text, wavPath);

  const attemptId = createId();
  const createdAt = nowIso();
  const attemptDraft: PracticeAttempt = {
    id: attemptId,
    materialId: material.id,
    segmentId: segment.id,
    attemptAudioPath: wavStorageKey,
    feedbackJsonPath: null,
    feedbackMarkdownPath: null,
    recognizedText: pronunciation.recognizedText,
    pronScore: pronunciation.pronScore,
    accuracyScore: pronunciation.accuracyScore,
    fluencyScore: pronunciation.fluencyScore,
    completenessScore: pronunciation.completenessScore,
    wordResultsJson: pronunciation.words,
    providerRawJson: pronunciation.raw,
    analysisJson: emptyAnalysis(),
    createdAt,
  };

  const attempt = await createAttempt({
    id: attemptDraft.id,
    createdAt: attemptDraft.createdAt,
    materialId: material.id,
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
    analysisJson: attemptDraft.analysisJson,
  });

  return {
    attempt,
    practice: await getPracticeMaterialView(segment.materialId),
  };
};

export const analyzeAttemptWorkflow = async (attemptId: string) => {
  const attempt = await getAttempt(attemptId);
  if (!attempt) {
    throw new Error("Attempt not found.");
  }
  if (!attempt.segmentId) {
    throw new Error("Please re-associate this recording with a sentence before generating AI feedback.");
  }

  const segment = await getSegment(attempt.segmentId);
  if (!segment) {
    throw new Error("Segment not found.");
  }

  const material = await getMaterial(segment.materialId);
  if (!material) {
    throw new Error("Parent material not found.");
  }

  const wasAlreadyAnalyzed = Boolean(attempt.feedbackJsonPath || attempt.feedbackMarkdownPath);
  const analysis = await analyzeAttemptWithKimi({
    referenceText: segment.text,
    recognizedText: attempt.recognizedText,
    pronScore: attempt.pronScore,
    accuracyScore: attempt.accuracyScore,
    fluencyScore: attempt.fluencyScore,
    completenessScore: attempt.completenessScore,
    wordResults: attempt.wordResultsJson,
    history: await listWeakPatterns(),
  });

  const analyzedAttempt: PracticeAttempt = {
    ...attempt,
    analysisJson: analysis,
  };

  const feedbackPaths = await writeAttemptFeedbackArtifacts({
    material,
    segment,
    attempt: analyzedAttempt,
  });

  const updatedAttempt = await updateAttemptAnalysis(attempt.id, {
    analysisJson: analysis,
    feedbackJsonPath: feedbackPaths.feedbackJsonPath,
    feedbackMarkdownPath: feedbackPaths.feedbackMarkdownPath,
  });

  if (!wasAlreadyAnalyzed) {
    await rememberWeakPatterns({
      segment,
      attemptId: updatedAttempt.id,
      words: updatedAttempt.wordResultsJson,
      analysis,
    });
  }

    return {
    attempt: updatedAttempt,
    practice: await getPracticeMaterialView(segment.materialId),
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
    const evidence = await listWeakPatternEvidenceForKey(patternType, normalizedWord);

    if (!hasStrongError && evidence.length === 0) {
      // First low-score exact-word evidence only seeds memory; highlight starts on the second hit.
      const existing = await upsertWeakPattern({
        patternType,
        patternKey: normalizedWord,
        displayText: word.word,
        severity: score < 60 ? 3 : 2,
        lastSegmentText: input.segment.text,
        notesJson: {
          reason: "Repeated low word score from Azure pronunciation assessment.",
        },
      });
      await addWeakPatternEvidence({
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

    const weakPattern = await upsertWeakPattern({
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
    await addWeakPatternEvidence({
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

    const weakPattern = await upsertWeakPattern({
      patternType: pattern.type,
      patternKey: pattern.key,
      displayText: pattern.displayText,
      severity: pattern.severity,
      lastSegmentText: input.segment.text,
      notesJson: {
        reason: pattern.reason,
      },
    });

    await addWeakPatternEvidence({
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
  options: { force?: boolean } = {},
) => {
  if (!isAzureSpeechConfigured()) {
    await updateMaterial(material.id, {
      statusDetail: material.statusDetail || ttsErrorMessage,
    });
    return;
  }

  const settings = await getUserSettings();

  for (const segment of segments) {
    if (segment.ttsAudioPath && !options.force) {
      continue;
    }

    try {
      if (options.force && segment.ttsAudioPath) {
        await removeStorageFile(segment.ttsAudioPath);
      }

      const audioBuffer = await synthesizeSentenceAudio(
        segment.text,
        material.locale,
        settings.ttsVoice,
      );
      const storageKey = await writeBuffer(
        `materials/${material.id}/tts`,
        `segment-${segment.index + 1}.mp3`,
        audioBuffer,
      );
      await updateSegmentTtsPath(segment.id, storageKey);
    } catch (error) {
      await updateMaterial(material.id, {
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

export const materialMedia = async (materialId: string) => {
  const material = await getMaterial(materialId);
  if (!material) {
    throw new Error("Material not found.");
  }

  const segments = (await listSegmentsByMaterial(materialId)).map((segment) => ({
    ...segment,
    ttsUrl: storageUrl(segment.ttsAudioPath),
  }));

  return {
    material: {
      ...material,
      sourceAudioUrl: storageUrl(material.sourceAudioPath),
    },
    segments,
    attempts: (await listAttemptsForMaterial(materialId)).map((attempt) => ({
      ...attempt,
      attemptAudioUrl: storageUrl(attempt.attemptAudioPath),
    })),
  };
};

const inferTitle = (text: string) => text.slice(0, 48) || "French practice";

const stripExtension = (filename: string) => filename.replace(/\.[^.]+$/, "");
