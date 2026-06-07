import { appConfig, isElevenLabsConfigured } from "@/lib/config";
import { splitFrenchSentenceSpans, type SentenceSpan } from "@/lib/text";
import type { EditableSegmentInput } from "@/lib/types";

const elevenLabsModel = "eleven_multilingual_v2";
const maxMultilingualV2Characters = 10_000;
const clipStartPaddingMs = 80;
const clipEndPaddingMs = 140;

export type ElevenLabsAlignment = {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
};

type ElevenLabsTimingResponse = {
  audio_base64?: string;
  alignment?: ElevenLabsAlignment | null;
  normalized_alignment?: ElevenLabsAlignment | null;
};

export type ElevenLabsPassageAudio = {
  audioBuffer: Buffer;
  segments: EditableSegmentInput[];
  characterCount: number;
};

const ensureElevenLabsConfig = () => {
  if (!isElevenLabsConfigured()) {
    throw new Error("ElevenLabs is not configured. Add ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID.");
  }

  return {
    apiKey: appConfig.elevenLabsApiKey,
    voiceId: appConfig.elevenLabsVoiceId,
  };
};

const languageCodeFromLocale = (locale: string) => {
  const [language] = locale.replaceAll("_", "-").split("-");
  return language?.toLowerCase() || null;
};

export const synthesizeElevenLabsPassageAudio = async (
  text: string,
  locale = appConfig.locale,
): Promise<ElevenLabsPassageAudio> => {
  const normalizedText = text.trim();
  if (!normalizedText) {
    throw new Error("Please provide text for ElevenLabs source audio.");
  }

  if (normalizedText.length > maxMultilingualV2Characters) {
    throw new Error(
      `ElevenLabs multilingual v2 supports up to ${maxMultilingualV2Characters.toLocaleString()} characters per full-passage generation.`,
    );
  }

  const { apiKey, voiceId } = ensureElevenLabsConfig();
  const endpoint = new URL(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps`,
  );
  endpoint.searchParams.set("output_format", appConfig.elevenLabsOutputFormat);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": apiKey,
    },
    body: JSON.stringify({
      text: normalizedText,
      model_id: elevenLabsModel,
      language_code: languageCodeFromLocale(locale),
    }),
  });

  if (!response.ok) {
    throw new Error(`ElevenLabs TTS failed: ${response.status} ${await response.text()}`);
  }

  const payload = (await response.json()) as ElevenLabsTimingResponse;
  if (!payload.audio_base64) {
    throw new Error("ElevenLabs did not return audio data.");
  }

  const alignment = chooseAlignment(payload, normalizedText);
  if (!alignment) {
    throw new Error("ElevenLabs did not return source audio timing data.");
  }

  return {
    audioBuffer: Buffer.from(payload.audio_base64, "base64"),
    segments: buildElevenLabsSourceSegments(normalizedText, alignment),
    characterCount: normalizedText.length,
  };
};

const chooseAlignment = (payload: ElevenLabsTimingResponse, text: string) => {
  const alignments = [payload.alignment, payload.normalized_alignment].filter(
    (alignment): alignment is ElevenLabsAlignment => Boolean(alignment),
  );

  return (
    alignments.find((alignment) => alignment.characters.join("") === text) ??
    alignments.find((alignment) => alignment.characters.length >= text.length) ??
    alignments[0] ??
    null
  );
};

export const buildElevenLabsSourceSegments = (
  text: string,
  alignment: ElevenLabsAlignment,
): EditableSegmentInput[] => {
  const spans = splitFrenchSentenceSpans(text);
  if (spans.length === 0) {
    throw new Error("ElevenLabs source audio needs at least one practice sentence.");
  }

  return spans.map((span, index) => ({
    index,
    text: span.text,
    ...timingForSpan(span, alignment),
    source: "text" as const,
  }));
};

const timingForSpan = (span: SentenceSpan, alignment: ElevenLabsAlignment) => {
  const startSeconds = firstTimeInSpan(
    alignment.character_start_times_seconds,
    span.startIndex,
    span.endIndex,
  );
  const endSeconds = lastTimeInSpan(
    alignment.character_end_times_seconds,
    span.startIndex,
    span.endIndex,
  );

  if (startSeconds === null || endSeconds === null) {
    throw new Error("ElevenLabs timing data could not be mapped to every sentence.");
  }

  return {
    startMs: Math.max(0, Math.floor(startSeconds * 1000) - clipStartPaddingMs),
    endMs: Math.ceil(endSeconds * 1000) + clipEndPaddingMs,
  };
};

const firstTimeInSpan = (times: number[], startIndex: number, endIndex: number) => {
  for (let index = startIndex; index < endIndex; index += 1) {
    if (Number.isFinite(times[index])) {
      return times[index];
    }
  }

  return null;
};

const lastTimeInSpan = (times: number[], startIndex: number, endIndex: number) => {
  for (let index = endIndex - 1; index >= startIndex; index -= 1) {
    if (Number.isFinite(times[index])) {
      return times[index];
    }
  }

  return null;
};
