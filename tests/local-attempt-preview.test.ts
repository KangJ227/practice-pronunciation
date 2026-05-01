import { describe, expect, it } from "vitest";

import { getPreviewUrlToRevoke } from "@/lib/local-attempt-preview";

describe("getPreviewUrlToRevoke", () => {
  it("does not revoke the current blob URL when only preview status changes", () => {
    expect(getPreviewUrlToRevoke("blob:latest", "blob:latest")).toBeNull();
  });

  it("revokes the old blob URL when a new preview replaces it", () => {
    expect(getPreviewUrlToRevoke("blob:first", "blob:second")).toBe("blob:first");
  });

  it("does nothing when there was no previous preview URL", () => {
    expect(getPreviewUrlToRevoke(null, "blob:first")).toBeNull();
  });
});
