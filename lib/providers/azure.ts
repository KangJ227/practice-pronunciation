import { promises as fs } from "node:fs";
import path from "node:path";
import * as SpeechSDK from "microsoft-cognitiveservices-speech-sdk";
import { appConfig, isAzureSpeechConfigured } from "@/lib/config";
import type { FastTranscriptionResult, PronunciationResult, WordAssessment } from "@/lib/types";
import { roundScore } from "@/lib/utils";

const speechRestVersion = "2025-10-15";
const fastTranscriptionLocales = new Set([
  "de-DE",
  "en-AU",
  "en-CA",
  "en-GB",
  "en-IN",
  "en-US",
  "es-ES",
  "es-MX",
  "fr-CA",
  "fr-FR",
  "it-IT",
  "ja-JP",
  "ko-KR",
  "pt-BR",
  "zh-CN",
]);

const ensureAzureConfig = () => {
  if (!isAzureSpeechConfigured()) {
    throw new Error("Azure Speech is not configured.");
  }

  return {
    key: appConfig.azureSpeechKey,
    region: appConfig.azureSpeechRegion,
  };
};

const speechHost = (region: string) => `https://${region}.api.cognitive.microsoft.com`;
const ttsHost = (region: string) => `https://${region}.tts.speech.microsoft.com`;

const normalizeLocale = (locale: string) => {
  const trimmed = locale.trim();

  if (!trimmed) {
    return "";
  }

  const [language, ...rest] = trimmed.replaceAll("_", "-").split("-");
  if (!language) {
    return "";
  }

  if (rest.length === 0) {
    return language.toLowerCase();
  }

  return [language.toLowerCase(), ...rest.map((part) => part.toUpperCase())].join("-");
};

export const getFastTranscriptionLocales = (locale: string) => {
  const normalized = normalizeLocale(locale);
  return fastTranscriptionLocales.has(normalized) ? [normalized] : [];
};

export const synthesizeSentenceAudio = async (text: string, locale = appConfig.locale) => {
  const { key, region } = ensureAzureConfig();

  const ssml = `
    <speak version="1.0" xml:lang="${locale}">
      <voice name="${appConfig.speechVoice}">
        <prosody rate="0%">
          ${escapeXml(text)}
        </prosody>
      </voice>
    </speak>
  `.trim();

  const response = await fetch(`${ttsHost(region)}/cognitiveservices/v1`, {
    method: "POST",
    headers: {
      "Content-Type": "application/ssml+xml",
      "Ocp-Apim-Subscription-Key": key,
      "X-Microsoft-OutputFormat": "audio-16khz-32kbitrate-mono-mp3",
      "User-Agent": "french-pronunciation-practice",
    },
    body: ssml,
  });

  if (!response.ok) {
    throw new Error(`Azure TTS failed: ${response.status} ${await response.text()}`);
  }

  return Buffer.from(await response.arrayBuffer());
};

export const fastTranscribeAudio = async (
  filePath: string,
  fileName: string,
  locale = appConfig.locale,
): Promise<FastTranscriptionResult> => {
  const { key, region } = ensureAzureConfig();
  const fileBuffer = await fs.readFile(filePath);
  const formData = new FormData();
  formData.append(
    "audio",
    new Blob([fileBuffer], { type: inferAudioMime(fileName) }),
    path.basename(fileName),
  );
  formData.append("definition", JSON.stringify({ locales: getFastTranscriptionLocales(locale) }));

  const response = await fetch(
    `${speechHost(region)}/speechtotext/transcriptions:transcribe?api-version=${speechRestVersion}`,
    {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
      },
      body: formData,
    },
  );

  if (!response.ok) {
    throw new Error(`Azure transcription failed: ${response.status} ${await response.text()}`);
  }

  const raw = (await response.json()) as Record<string, unknown>;
  const combinedPhrases = Array.isArray(raw.combinedPhrases) ? raw.combinedPhrases : [];
  const phrases = Array.isArray(raw.phrases) ? raw.phrases : [];
  const fullText =
    combinedPhrases
      .map((item) => (typeof item === "object" && item && "text" in item ? item.text : ""))
      .filter((value): value is string => typeof value === "string")
      .join(" ")
      .trim() || "";

  const normalizedPhrases = phrases
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((phrase) => {
      const words = Array.isArray(phrase.words) ? phrase.words : [];

      return {
        text: String(phrase.text ?? "").trim(),
        offsetMilliseconds:
          phrase.offsetMilliseconds === undefined || phrase.offsetMilliseconds === null
            ? null
            : Number(phrase.offsetMilliseconds),
        durationMilliseconds:
          phrase.durationMilliseconds === undefined || phrase.durationMilliseconds === null
            ? null
            : Number(phrase.durationMilliseconds),
        confidence:
          phrase.confidence === undefined || phrase.confidence === null
            ? null
            : Number(phrase.confidence),
        words: words
          .filter((word): word is Record<string, unknown> => typeof word === "object" && word !== null)
          .map((word) => ({
            text: String(word.text ?? "").trim(),
            offsetMilliseconds:
              word.offsetMilliseconds === undefined || word.offsetMilliseconds === null
                ? null
                : Number(word.offsetMilliseconds),
            durationMilliseconds:
              word.durationMilliseconds === undefined || word.durationMilliseconds === null
                ? null
                : Number(word.durationMilliseconds),
          }))
          .filter((word) => word.text),
      };
    })
    .filter((phrase) => phrase.text);

  return {
    fullText,
    durationMilliseconds:
      raw.durationMilliseconds === undefined || raw.durationMilliseconds === null
        ? null
        : Number(raw.durationMilliseconds),
    phrases: normalizedPhrases,
    raw,
  };
};

export const assessPronunciation = async (
  wavFilePath: string,
  referenceText: string,
  locale = appConfig.locale,
): Promise<PronunciationResult> => {
  const { key, region } = ensureAzureConfig();
  const speechConfig = SpeechSDK.SpeechConfig.fromSubscription(key, region);
  speechConfig.speechRecognitionLanguage = locale;
  speechConfig.setProperty(
    SpeechSDK.PropertyId.SpeechServiceResponse_RequestWordLevelTimestamps,
    "true",
  );

  const audioBuffer = await fs.readFile(wavFilePath);
  const audioConfig = SpeechSDK.AudioConfig.fromWavFileInput(audioBuffer);
  const recognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);
  const pronunciationConfig = new SpeechSDK.PronunciationAssessmentConfig(
    referenceText,
    SpeechSDK.PronunciationAssessmentGradingSystem.HundredMark,
    SpeechSDK.PronunciationAssessmentGranularity.Phoneme,
    false,
  );

  pronunciationConfig.enableMiscue = true;
  pronunciationConfig.applyTo(recognizer);

  const result = await new Promise<SpeechSDK.SpeechRecognitionResult>((resolve, reject) => {
    recognizer.recognizeOnceAsync(
      (recognitionResult) => resolve(recognitionResult),
      (error) => reject(new Error(String(error))),
    );
  }).finally(() => {
    recognizer.close();
  });

  const rawJson =
    result.properties.getProperty(SpeechSDK.PropertyId.SpeechServiceResponse_JsonResult) ?? "{}";
  const raw = JSON.parse(rawJson) as Record<string, unknown>;

  const nBest = Array.isArray(raw.NBest) ? raw.NBest[0] : null;
  const pronunciationAssessment =
    nBest &&
    typeof nBest === "object" &&
    "PronunciationAssessment" in nBest &&
    typeof nBest.PronunciationAssessment === "object" &&
    nBest.PronunciationAssessment
      ? (nBest.PronunciationAssessment as Record<string, unknown>)
      : {};

  const words = parseAssessmentWords(
    nBest && typeof nBest === "object" ? (nBest.Words as unknown[] | undefined) : [],
  );

  return {
    recognizedText: String(raw.DisplayText ?? result.text ?? "").trim(),
    pronScore: roundScore(
      toNumber(pronunciationAssessment.PronScore ?? pronunciationAssessment.PronunciationScore),
    ),
    accuracyScore: roundScore(toNumber(pronunciationAssessment.AccuracyScore)),
    fluencyScore: roundScore(toNumber(pronunciationAssessment.FluencyScore)),
    completenessScore: roundScore(toNumber(pronunciationAssessment.CompletenessScore)),
    words,
    raw,
  };
};

const parseAssessmentWords = (words: unknown[] | undefined): WordAssessment[] => {
  if (!Array.isArray(words)) {
    return [];
  }

  return words
    .filter((word): word is Record<string, unknown> => typeof word === "object" && word !== null)
    .map((word) => {
      const pronunciationAssessment =
        typeof word.PronunciationAssessment === "object" && word.PronunciationAssessment
          ? (word.PronunciationAssessment as Record<string, unknown>)
          : {};

      const syllables = Array.isArray(word.Syllables) ? word.Syllables : [];
      const phonemes = Array.isArray(word.Phonemes) ? word.Phonemes : [];

      return {
        word: String(word.Word ?? ""),
        accuracyScore: roundScore(toNumber(pronunciationAssessment.AccuracyScore)),
        errorType: pronunciationAssessment.ErrorType
          ? String(pronunciationAssessment.ErrorType)
          : null,
        syllables: syllables
          .filter((syllable): syllable is Record<string, unknown> => typeof syllable === "object" && syllable !== null)
          .map((syllable) => ({
            syllable: String(syllable.Syllable ?? ""),
            accuracyScore: roundScore(
              toNumber(
                typeof syllable.PronunciationAssessment === "object" &&
                  syllable.PronunciationAssessment
                  ? (syllable.PronunciationAssessment as Record<string, unknown>).AccuracyScore
                  : null,
              ),
            ),
          })),
        phonemes: phonemes
          .filter((phoneme): phoneme is Record<string, unknown> => typeof phoneme === "object" && phoneme !== null)
          .map((phoneme) => ({
            phoneme: String(phoneme.Phoneme ?? ""),
            accuracyScore: roundScore(
              toNumber(
                typeof phoneme.PronunciationAssessment === "object" &&
                  phoneme.PronunciationAssessment
                  ? (phoneme.PronunciationAssessment as Record<string, unknown>).AccuracyScore
                  : null,
              ),
            ),
          })),
      };
    })
    .filter((word) => word.word);
};

const toNumber = (value: unknown) => {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const escapeXml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const inferAudioMime = (fileName: string) => {
  const extension = path.extname(fileName).toLowerCase();

  if (extension === ".mp3") {
    return "audio/mpeg";
  }

  if (extension === ".m4a") {
    return "audio/mp4";
  }

  if (extension === ".wav") {
    return "audio/wav";
  }

  if (extension === ".ogg") {
    return "audio/ogg";
  }

  if (extension === ".webm") {
    return "audio/webm";
  }

  return "application/octet-stream";
};
