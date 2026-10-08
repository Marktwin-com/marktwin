import { describe, expect, it } from "vitest";
import { quickCaptureContent, quickCaptureDirectory, quickCaptureFilename } from "./quick-capture";

describe("quick capture", () => {
  it("uses inbox under the selected scope and collision-safe filenames", () => {
    expect(quickCaptureDirectory("docs")).toBe("docs/inbox/");
    const now = new Date(2026, 7, 16, 9, 5);
    expect(quickCaptureFilename(now, ["quick-note-2026-08-16-0905.md"])).toBe("quick-note-2026-08-16-0905-2.md");
    expect(quickCaptureContent("Remember this", "Thought")).toContain("# Thought");
  });
});
