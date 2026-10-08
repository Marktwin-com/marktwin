import type { WorkspaceNote } from "./cabinet-files";
import { fullNotePath, normalizeDirectoryPath } from "./cabinet-files";
import type { DecisionRecord, DecisionStatus } from "@shared/schema";

export const DECISIONS_FILENAME = "DECISIONS.md";

export interface DecisionRecordLocation {
  fileId?: string;
  directory: string;
  path: string;
}

/**
 * Reuse one visible repository decision log when it exists. New logs live at
 * the root when root files are managed, or in the first configured
 * workspace folder when they are not.
 */
export function resolveDecisionRecordLocation(
  notes: WorkspaceNote[],
  selectedScopes: string[],
): DecisionRecordLocation | null {
  const existing = notes
    .filter((note) => note.fileType === "markdown" && note.filename.toLocaleLowerCase("en-US") === DECISIONS_FILENAME.toLocaleLowerCase("en-US"))
    .sort((left, right) => {
      const leftPath = fullNotePath(left);
      const rightPath = fullNotePath(right);
      if (leftPath.toLocaleLowerCase("en-US") === DECISIONS_FILENAME.toLocaleLowerCase("en-US")) return -1;
      if (rightPath.toLocaleLowerCase("en-US") === DECISIONS_FILENAME.toLocaleLowerCase("en-US")) return 1;
      return leftPath.localeCompare(rightPath);
    })[0];

  if (existing) {
    return { fileId: existing.id, directory: normalizeDirectoryPath(existing.path), path: fullNotePath(existing) };
  }

  const scope = selectedScopes.includes("/") ? "/" : selectedScopes[0];
  if (!scope) return null;
  const directory = normalizeDirectoryPath(scope);
  return {
    directory,
    path: directory === "/" ? DECISIONS_FILENAME : `${directory}${DECISIONS_FILENAME}`,
  };
}

function escapeMarkdownText(value: string) {
  return value.replace(/([\\`*_{}\[\]<>])/g, "\\$1");
}

export function decisionRecordInitialContent() {
  return "# Decisions\n\nThis file records decisions captured from Marktwin Chat.\n";
}

export function formatDecisionEntry(input: { summary: string; capturedBy: string; timestamp: number; id?: string; status?: DecisionStatus; relatedArtifacts?: Array<{ id?: string; path: string; label?: string }>; rationale?: string; risks?: string }) {
  const capturedAt = new Date(input.timestamp).toISOString();
  const date = capturedAt.slice(0, 10);
  if (!input.id) {
    return `\n## Decision: ${date}\n\n${input.summary.trim()}\n\n_Captured from Chat by ${escapeMarkdownText(input.capturedBy)} on ${capturedAt}._\n`;
  }
  const related = input.relatedArtifacts?.length
    ? `\n- **Related:** ${input.relatedArtifacts.map((artifact) => `[${artifact.label || artifact.path}](${artifact.path})${artifact.id ? ` \`${escapeMarkdownText(artifact.id)}\`` : ""}`).join(", ")}`
    : "";
  const rationale = input.rationale?.trim() ? `\n- **Rationale:** ${escapeMarkdownText(input.rationale.trim())}` : "";
  const risks = input.risks?.trim() ? `\n- **Risks:** ${escapeMarkdownText(input.risks.trim())}` : "";
  return `\n## Decision: ${date}\n\n- **ID:** \`${escapeMarkdownText(input.id)}\`\n- **Status:** ${input.status || "decided"}\n- **Decision:** ${input.summary.trim()}\n- **Source:** Chat by ${escapeMarkdownText(input.capturedBy)} on ${capturedAt}.${related}${rationale}${risks}\n`;
}

function decisionIdForLegacyEntry(date: string, index: number) {
  return `decision-${date}-${index + 1}`;
}

export function parseDecisionRecords(content: string): DecisionRecord[] {
  const matches = Array.from(content.matchAll(/(?:^|\n)## Decision:\s*([^\n]+)\n([\s\S]*?)(?=\n## Decision:|$)/g));
  return matches.map((match, index) => {
    const date = match[1].trim();
    const body = match[2].trim();
    const id = body.match(/\*\*ID:\*\*\s*`([^`]+)`/)?.[1] || decisionIdForLegacyEntry(date, index);
    const status = (body.match(/\*\*Status:\*\*\s*(decided|implemented|revisit)/)?.[1] || "decided") as DecisionStatus;
    const summary = body.match(/\*\*Decision:\*\*\s*([^\n]+)/)?.[1]
      || body.split(/\n\n|\n_Captured from Chat/)[0].replace(/^-\s+/, "").trim();
    const source = body.match(/\*\*Source:\*\*\s*Chat by ([^\n]+?)(?:\s+on\s+(.+))?$/m)
      || body.match(/_Captured from Chat by ([^\n]+?) on (.+?)\._/);
    const related = Array.from(body.matchAll(/\[([^\]]+)\]\(([^)]+)\)(?:\s+`([^`]+)`)?/g)).map((relatedMatch) => ({ label: relatedMatch[1], path: relatedMatch[2], id: relatedMatch[3] }));
    return {
      id,
      status,
      summary,
      sourceDisplayName: source?.[1],
      capturedAt: source?.[2] ? Date.parse(source[2].replace(/\._$/, "")) || undefined : Date.parse(date) || undefined,
      relatedArtifacts: related,
      rationale: body.match(/\*\*Rationale:\*\*\s*([^\n]+)/)?.[1],
      risks: body.match(/\*\*Risks:\*\*\s*([^\n]+)/)?.[1],
    } satisfies DecisionRecord;
  });
}
