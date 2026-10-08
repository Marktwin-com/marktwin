export type TextDocumentKind = "markdown" | "yaml" | "json" | "tex" | "toml" | "properties" | "xml" | "plain";

const MARKDOWN_EXTENSIONS = new Set([
  "md", "markdown", "mdown", "mkd", "mkdn", "mdwn", "mdx",
]);

const TEXT_DOCUMENT_KIND_BY_EXTENSION: Readonly<Record<string, TextDocumentKind>> = Object.freeze({
  md: "markdown",
  markdown: "markdown",
  mdown: "markdown",
  mkd: "markdown",
  mkdn: "markdown",
  mdwn: "markdown",
  mdx: "markdown",
  yaml: "yaml",
  yml: "yaml",
  json: "json",
  jsonc: "json",
  json5: "json",
  tex: "tex",
  latex: "tex",
  sty: "tex",
  cls: "tex",
  bib: "tex",
  toml: "toml",
  ini: "properties",
  cfg: "properties",
  conf: "properties",
  properties: "properties",
  env: "properties",
  xml: "xml",
  txt: "plain",
  text: "plain",
  log: "plain",
  csv: "plain",
  tsv: "plain",
  rst: "plain",
  rest: "plain",
  adoc: "plain",
  asciidoc: "plain",
  org: "plain",
});

function extensionForPath(path: string) {
  const filename = path.replace(/\\/g, "/").split("/").pop()?.toLowerCase() || "";
  const lastDot = filename.lastIndexOf(".");
  return lastDot >= 0 && lastDot < filename.length - 1 ? filename.slice(lastDot + 1) : "";
}

export function textDocumentKindForPath(path: string): TextDocumentKind | null {
  return TEXT_DOCUMENT_KIND_BY_EXTENSION[extensionForPath(path)] || null;
}

export function isTextPath(path: string) {
  return textDocumentKindForPath(path) !== null;
}

export function isMarkdownPath(path: string) {
  return MARKDOWN_EXTENSIONS.has(extensionForPath(path));
}

export function textDocumentLabelForPath(path: string) {
  const kind = textDocumentKindForPath(path);
  if (kind === "markdown") return "Markdown";
  if (kind === "yaml") return "YAML";
  if (kind === "json") return "JSON";
  if (kind === "tex") return "TeX";
  if (kind === "toml") return "TOML";
  if (kind === "properties") return "Configuration";
  if (kind === "xml") return "XML";
  return "Plain text";
}

export function normalizeTextFilename(value: string) {
  const filename = value.trim();
  if (!filename) return filename;
  if (!/\.[^./]+$/.test(filename)) return `${filename}.md`;
  return filename;
}

export const TEXT_FILE_EXTENSION_SUMMARY = ".md · .txt · .yaml · .yml · .tex · …";
