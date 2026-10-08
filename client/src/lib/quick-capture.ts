import { normalizeDirectoryPath } from "./cabinet-files";

export function quickCaptureDirectory(scope: string) {
  const normalized = normalizeDirectoryPath(scope);
  return normalized === "/" ? "inbox/" : `${normalized}inbox/`;
}

export function quickCaptureFilename(now = new Date(), existing: string[] = []) {
  const stamp = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    .map((part) => String(part).padStart(2, "0")).join("-")
    + `-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  const base = `quick-note-${stamp}`;
  const names = new Set(existing.map((name) => name.toLocaleLowerCase()));
  if (!names.has(`${base}.md`)) return `${base}.md`;
  let counter = 2;
  while (names.has(`${base}-${counter}.md`)) counter += 1;
  return `${base}-${counter}.md`;
}

export function quickCaptureContent(text: string, title = "Quick note") {
  return `# ${title.trim() || "Quick note"}\n\n${text.trim()}\n`;
}
