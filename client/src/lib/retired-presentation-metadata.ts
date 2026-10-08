const FRONT_MATTER = /^---(\r?\n)([\s\S]*?)\r?\n---(?:\r?\n|$)/;
const RETIRED_PRESENTATION_LINE = /^\s*marktwin-style\s*:/i;

/** Remove metadata written by the retired document-presentation selector. */
export function removeRetiredPresentationMetadata(content: string) {
  const frontMatter = content.match(FRONT_MATTER);
  if (!frontMatter) return content;

  const lineEnding = frontMatter[1];
  const lines = frontMatter[2].split(/\r?\n/);
  if (!lines.some((line) => RETIRED_PRESENTATION_LINE.test(line))) return content;

  const nextBody = lines.filter((line) => !RETIRED_PRESENTATION_LINE.test(line)).join(lineEnding).trimEnd();
  const remainder = content.slice(frontMatter[0].length);
  if (!nextBody.trim()) return remainder.replace(/^\r?\n/, "");
  return `---${lineEnding}${nextBody}${lineEnding}---${lineEnding}${remainder}`;
}
