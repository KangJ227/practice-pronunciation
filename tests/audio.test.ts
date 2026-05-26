import { describe, expect, it } from "vitest";
import { shouldConvertToPlaybackMp3 } from "@/lib/audio";

describe("shouldConvertToPlaybackMp3", () => {
  it("converts browser-sensitive attempt recordings to playback MP3", () => {
    expect(shouldConvertToPlaybackMp3("attempts/seg-1/normalized/attempt.wav")).toBe(true);
  });

  it("keeps already browser-friendly MP3 files unchanged", () => {
    expect(shouldConvertToPlaybackMp3("materials/mat-1/tts/segment.mp3")).toBe(false);
  });
});
