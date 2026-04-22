import { describe, expect, it } from "vitest";
import {
  buildFastTranscriptionDefinitions,
  getFastTranscriptionLocales,
  inferAudioMime,
  shouldFallbackToSdkTranscription,
  shouldRetryWithoutLocales,
} from "@/lib/providers/azure";

describe("getFastTranscriptionLocales", () => {
  it("keeps supported locales unchanged", () => {
    expect(getFastTranscriptionLocales("fr-FR")).toEqual(["fr-FR"]);
  });

  it("normalizes underscore locale formats", () => {
    expect(getFastTranscriptionLocales("fr_FR")).toEqual(["fr-FR"]);
  });

  it("omits unsupported locales so Azure can auto-detect", () => {
    expect(getFastTranscriptionLocales("fr")).toEqual([]);
    expect(getFastTranscriptionLocales("fr-CH")).toEqual([]);
  });
});

describe("buildFastTranscriptionDefinitions", () => {
  it("tries the explicit locale first, then falls back to auto-detect", () => {
    expect(buildFastTranscriptionDefinitions("fr-FR")).toEqual([
      { locales: ["fr-FR"] },
      {},
    ]);
  });

  it("uses auto-detect only when the locale is not on the fast-transcription allowlist", () => {
    expect(buildFastTranscriptionDefinitions("fr")).toEqual([{}]);
  });
});

describe("shouldRetryWithoutLocales", () => {
  it("recognizes Azure invalid-locale errors", () => {
    expect(
      shouldRetryWithoutLocales(
        new Error(
          'Azure transcription failed: 400 {"code":"InvalidArgument","innerError":{"code":"InvalidLocale","message":"The specified locale is not supported."}}',
        ),
      ),
    ).toBe(true);
  });

  it("ignores unrelated Azure failures", () => {
    expect(
      shouldRetryWithoutLocales(
        new Error('Azure transcription failed: 400 {"code":"InvalidAudioFormat"}'),
      ),
    ).toBe(false);
  });
});

describe("shouldFallbackToSdkTranscription", () => {
  it("falls back when fast transcription rejects the locale", () => {
    expect(
      shouldFallbackToSdkTranscription(
        new Error(
          'Azure transcription failed: 400 {"code":"InvalidArgument","innerError":{"code":"InvalidLocale","message":"The specified locale is not supported."}}',
        ),
      ),
    ).toBe(true);
  });

  it("falls back when fast transcription rejects the model", () => {
    expect(
      shouldFallbackToSdkTranscription(
        new Error(
          'Azure transcription failed: 400 {"code":"InvalidArgument","innerError":{"code":"InvalidModel","message":"The specified model is not supported."}}',
        ),
      ),
    ).toBe(true);
  });

  it("does not hide unrelated provider failures", () => {
    expect(
      shouldFallbackToSdkTranscription(
        new Error('Azure transcription failed: 400 {"code":"InvalidAudioFormat"}'),
      ),
    ).toBe(false);
  });
});

describe("inferAudioMime", () => {
  it("maps opus uploads to an audio mime type Azure accepts", () => {
    expect(inferAudioMime("lesson.opus")).toBe("audio/ogg");
  });
});
