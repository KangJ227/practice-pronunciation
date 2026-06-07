import { describe, expect, it } from "vitest";
import {
  buildElevenLabsSourceSegments,
  type ElevenLabsAlignment,
} from "@/lib/providers/elevenlabs";

const alignmentFor = (text: string): ElevenLabsAlignment => ({
  characters: [...text],
  character_start_times_seconds: [...text].map((_, index) => index / 10),
  character_end_times_seconds: [...text].map((_, index) => (index + 1) / 10),
});

describe("buildElevenLabsSourceSegments", () => {
  it("maps character timing to sentence source clips", () => {
    const text = "Bonjour ! Nous partons.";

    expect(buildElevenLabsSourceSegments(text, alignmentFor(text))).toEqual([
      {
        index: 0,
        text: "Bonjour !",
        startMs: 0,
        endMs: 1040,
        source: "text",
      },
      {
        index: 1,
        text: "Nous partons.",
        startMs: 920,
        endMs: 2440,
        source: "text",
      },
    ]);
  });
});
