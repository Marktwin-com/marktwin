import { describe, expect, it } from "vitest";
import { buildCabinetSearchIndex, searchCabinet } from "./cabinet-search";

describe("Cabinet search", () => {
  const notes = [{ id: "note-1", artifactId: "note-1", vaultId: 1, filename: "plan.md", path: "/", content: "# Launch plan\n\nReview the evidence before deciding.", fileType: "markdown" as const }];

  it("indexes paths, headings, and text", () => {
    const index = buildCabinetSearchIndex(notes);
    expect(searchCabinet(index, "launch").some((result) => result.kind === "heading" && result.line === 1)).toBe(true);
    expect(searchCabinet(index, "evidence").some((result) => result.fileId === "note-1")).toBe(true);
  });

  it("does not create decision-specific search results", () => {
    const index = buildCabinetSearchIndex([{
      id: "decisions",
      artifactId: "decisions",
      vaultId: 1,
      filename: "DECISIONS.md",
      path: "/",
      content: "# Decisions\n\n- **ID:** `decision-1`\n- **Decision:** Ship it.\n",
      fileType: "markdown",
    }]);
    expect(index.some((result) => result.kind === "decision")).toBe(false);
  });
});
