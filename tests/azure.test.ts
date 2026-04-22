import { describe, expect, it } from "vitest";
import { getFastTranscriptionLocales } from "@/lib/providers/azure";

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
