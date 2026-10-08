import { describe, expect, it } from "vitest";
import { deriveArtifactRelations, backlinksFor } from "./artifact-relations";
import type { WorkspaceNote } from "./cabinet-files";

function note(id: string, path: string, filename: string, content: string, fileType: WorkspaceNote["fileType"] = "markdown"): WorkspaceNote {
  return { id, artifactId: `artifact-${id}`, vaultId: 1, path, filename, content, fileType, status: "clean" };
}

describe("artifact relations", () => {
  it("derives Markdown backlinks without decision-specific relations and preserves broken targets", () => {
    const plan = note("plan", "/", "plan.md", "# Plan");
    const decision = note("decisions", "/", "DECISIONS.md", "# Decisions\n\n## Decision: 2026-08-16\n\n- **ID:** `decision-1`\n- **Status:** decided\n- **Decision:** Use the plan.\n- **Related:** [Plan](plan.md), [Missing](missing.md)\n");
    const index = note("index", "/", "index.md", "[Plan](plan.md)\n[Missing](missing.md)");
    const relations = deriveArtifactRelations([plan, decision, index]);
    expect(backlinksFor(relations, { id: plan.artifactId, path: "plan.md", fileType: "markdown" })).toHaveLength(2);
    expect(relations.some((relation) => relation.kind === "decision")).toBe(false);
    expect(relations.some((relation) => relation.broken && relation.target.path === "missing.md")).toBe(true);
  });
});
