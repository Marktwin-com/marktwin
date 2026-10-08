import { describe, expect, it } from "vitest";

import type { WorkspaceNote } from "./cabinet-files";
import {
  DECISIONS_FILENAME,
  decisionRecordInitialContent,
  formatDecisionEntry,
  parseDecisionRecords,
  resolveDecisionRecordLocation,
} from "./workspace-decisions";

function note(id: string, path: string, filename = DECISIONS_FILENAME): WorkspaceNote {
  return { id, vaultId: 1, path, filename, content: "", fileType: "markdown", status: "clean" };
}

describe("workspace decisions", () => {
  it("prefers an existing root decision record", () => {
    expect(resolveDecisionRecordLocation([note("nested", "docs/"), note("root", "/")], ["docs", "/"])).toEqual({
      fileId: "root",
      directory: "/",
      path: "DECISIONS.md",
    });
  });

  it("creates the record at root when root files are configured", () => {
    expect(resolveDecisionRecordLocation([], ["docs", "/"])).toEqual({
      directory: "/",
      path: "DECISIONS.md",
    });
  });

  it("uses the first configured folder when root files are not configured", () => {
    expect(resolveDecisionRecordLocation([], [".agents", "docs"])).toEqual({
      directory: ".agents/",
      path: ".agents/DECISIONS.md",
    });
  });

  it("returns no location without a configured scope", () => {
    expect(resolveDecisionRecordLocation([], [])).toBeNull();
  });

  it("formats a readable Markdown record without hidden metadata", () => {
    expect(decisionRecordInitialContent()).toContain("# Decisions");
    expect(formatDecisionEntry({ summary: "Use the browser merge resolver.", capturedBy: "Ana_W", timestamp: Date.UTC(2026, 7, 14, 10, 30) })).toBe(
      "\n## Decision: 2026-08-14\n\nUse the browser merge resolver.\n\n_Captured from Chat by Ana\\_W on 2026-08-14T10:30:00.000Z._\n",
    );
  });

  it("parses new metadata and legacy entries into the same durable shape", () => {
    const content = `${decisionRecordInitialContent()}${formatDecisionEntry({
      summary: "Use the browser merge resolver.",
      capturedBy: "Ana",
      timestamp: Date.UTC(2026, 7, 14, 10, 30),
      id: "decision-123",
      status: "revisit",
      relatedArtifacts: [{ id: "artifact-1", path: "notes/plan.md", label: "Plan" }],
      rationale: "It keeps private content local.",
      risks: "Requires a later review.",
    })}${formatDecisionEntry({ summary: "Keep the default branch.", capturedBy: "Lee", timestamp: Date.UTC(2026, 7, 15, 9, 0) })}`;
    const records = parseDecisionRecords(content);
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ id: "decision-123", status: "revisit", summary: "Use the browser merge resolver.", sourceDisplayName: "Ana", relatedArtifacts: [{ id: "artifact-1", path: "notes/plan.md" }], rationale: "It keeps private content local.", risks: "Requires a later review." });
    expect(records[1]).toMatchObject({ id: "decision-2026-08-15-2", status: "decided", summary: "Keep the default branch.", sourceDisplayName: "Lee" });
  });
});
