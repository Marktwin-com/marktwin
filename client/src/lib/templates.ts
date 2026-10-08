import type { WorkspaceFileType } from "./workspace-github";

export interface WorkspaceTemplate {
  id: string;
  name: string;
  fileType: WorkspaceFileType;
  content: string;
  userSaved?: boolean;
}

export const builtInTemplates: WorkspaceTemplate[] = [
  { id: "blank-note", name: "Blank note", fileType: "markdown", content: "" },
  { id: "decision", name: "Decision", fileType: "markdown", content: "# Decision\n\n## Context\n\n## Options\n\n## Decision\n\n## Risks\n" },
  { id: "project", name: "Project or idea framing", fileType: "markdown", content: "# Project\n\n## Outcome\n\n## Why now\n\n## Next step\n" },
  { id: "meeting", name: "Meeting or discussion", fileType: "markdown", content: "# Discussion\n\n## Participants\n\n## Questions\n\n## Decisions\n\n## Follow-ups\n" },
  { id: "outline", name: "Writing outline", fileType: "markdown", content: "# Outline\n\n## Opening\n\n## Main idea\n\n## Supporting points\n\n## Closing\n" },
];

const storageKey = "marktwin-user-templates";

export function loadUserTemplates(): WorkspaceTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || "[]") as WorkspaceTemplate[];
    return Array.isArray(parsed) ? parsed.slice(0, 5).filter((item) => item?.userSaved === true) : [];
  } catch {
    return [];
  }
}

export function saveUserTemplate(template: Omit<WorkspaceTemplate, "id" | "userSaved">) {
  const existing = loadUserTemplates();
  if (existing.length >= 5) throw new Error("You can save up to five templates.");
  const next = { ...template, id: `user-${Date.now()}`, userSaved: true };
  if (typeof window !== "undefined") window.localStorage.setItem(storageKey, JSON.stringify([...existing, next]));
  return next;
}
