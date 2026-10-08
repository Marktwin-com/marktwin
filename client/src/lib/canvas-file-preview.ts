import { fullNotePath, type WorkspaceNote } from "./cabinet-files";
import { imageDataUrl } from "./workspace-images";

export interface CanvasFilePreview {
  path: string;
  title: string;
  excerpt: string;
  imageSource?: string | null;
}

function filenameTitle(filename: string) {
  return filename.replace(/\.(?:md|canvas|excalidraw)$/i, "");
}

function readableMarkdownLine(line: string) {
  return line
    .trim()
    .replace(/^#{1,6}\s+/, "")
    .replace(/^>\s?/, "")
    .replace(/^[-*+]\s+(?:\[[ xX]\]\s*)?/, "")
    .replace(/^\d+[.)]\s+/, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/[`*_~]+/g, "")
    .trim();
}

export function canvasFilePreview(note: WorkspaceNote): CanvasFilePreview {
  const path = fullNotePath(note);
  if (note.fileType !== "markdown") {
    return {
      path,
      title: filenameTitle(note.filename),
      excerpt: "",
      imageSource: note.fileType === "image" ? imageDataUrl(note.content, note.filename) : null,
    };
  }

  const lines = note.content.replace(/\r\n?/g, "\n").split("\n");
  let contentStart = 0;
  let frontMatterTitle = "";
  if (lines[0]?.trim() === "---") {
    const end = lines.slice(1).findIndex((line) => line.trim() === "---");
    if (end >= 0) {
      const frontMatter = lines.slice(1, end + 1);
      const titleLine = frontMatter.find((line) => /^title\s*:/i.test(line));
      frontMatterTitle = titleLine?.replace(/^title\s*:\s*/i, "").replace(/^['"]|['"]$/g, "").trim() || "";
      contentStart = end + 2;
    }
  }

  const headingIndex = lines.findIndex((line, index) => index >= contentStart && /^\s{0,3}#{1,6}\s+\S/.test(line));
  const heading = headingIndex >= 0 ? readableMarkdownLine(lines[headingIndex]) : "";
  const title = heading || frontMatterTitle || filenameTitle(note.filename);
  const excerptStart = headingIndex >= 0 ? headingIndex + 1 : contentStart;
  const excerptLine = lines.slice(excerptStart).find((line) => {
    const trimmed = line.trim();
    return Boolean(trimmed)
      && !/^(```|~~~)/.test(trimmed)
      && !/^([-*_])(?:\s*\1){2,}$/.test(trimmed)
      && !/^\[[^\]]+\]:\s*/.test(trimmed);
  });

  return {
    path,
    title,
    excerpt: excerptLine ? readableMarkdownLine(excerptLine) : "",
  };
}
