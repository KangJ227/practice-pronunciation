import { describe, expect, it } from "vitest";
import { isElevenLabsSourceAudioPath, resolveUserMediaStorageKey } from "@/lib/media";

describe("resolveUserMediaStorageKey", () => {
  it("keeps already scoped media keys unchanged", () => {
    expect(resolveUserMediaStorageKey("user-1/attempts/seg-1/playback/a.mp3", "user-1")).toBe(
      "user-1/attempts/seg-1/playback/a.mp3",
    );
  });

  it("scopes legacy attempt paths before media lookup", () => {
    expect(resolveUserMediaStorageKey("attempts/seg-1/normalized/a.wav", "user-1")).toBe(
      "user-1/attempts/seg-1/normalized/a.wav",
    );
  });

  it("detects ElevenLabs full-passage source audio", () => {
    expect(
      isElevenLabsSourceAudioPath("user-1/materials/mat-1/elevenlabs-source/source.mp3"),
    ).toBe(true);
    expect(isElevenLabsSourceAudioPath("user-1/materials/mat-1/tts/source.mp3")).toBe(false);
  });
});
