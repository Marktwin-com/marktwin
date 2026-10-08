export type LineDiffKind = "context" | "added" | "removed";

export interface LineDiffEntry {
  kind: LineDiffKind;
  text: string;
  oldLine?: number;
  newLine?: number;
}

function lines(content: string) {
  if (!content) return [];
  const split = content.split("\n");
  if (split.at(-1) === "") split.pop();
  return split;
}

/**
 * Produces a readable, deterministic line diff for the merge resolver. Large
 * documents fall back to a prefix/suffix diff to avoid allocating a huge LCS
 * matrix in the browser.
 */
export function createLineDiff(before: string | null, after: string | null): LineDiffEntry[] {
  const oldLines = lines(before || "");
  const newLines = lines(after || "");
  const columns = newLines.length + 1;
  const cells = (oldLines.length + 1) * columns;

  if (cells > 1_000_000) {
    let prefix = 0;
    while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix += 1;
    let suffix = 0;
    while (
      suffix < oldLines.length - prefix
      && suffix < newLines.length - prefix
      && oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
    ) suffix += 1;
    return [
      ...oldLines.slice(0, prefix).map((text, index) => ({ kind: "context" as const, text, oldLine: index + 1, newLine: index + 1 })),
      ...oldLines.slice(prefix, oldLines.length - suffix).map((text, index) => ({ kind: "removed" as const, text, oldLine: prefix + index + 1 })),
      ...newLines.slice(prefix, newLines.length - suffix).map((text, index) => ({ kind: "added" as const, text, newLine: prefix + index + 1 })),
      ...oldLines.slice(oldLines.length - suffix).map((text, index) => ({
        kind: "context" as const,
        text,
        oldLine: oldLines.length - suffix + index + 1,
        newLine: newLines.length - suffix + index + 1,
      })),
    ];
  }

  const lcs = new Uint32Array(cells);
  for (let oldIndex = oldLines.length - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = newLines.length - 1; newIndex >= 0; newIndex -= 1) {
      const at = oldIndex * columns + newIndex;
      lcs[at] = oldLines[oldIndex] === newLines[newIndex]
        ? lcs[(oldIndex + 1) * columns + newIndex + 1] + 1
        : Math.max(lcs[(oldIndex + 1) * columns + newIndex], lcs[oldIndex * columns + newIndex + 1]);
    }
  }

  const result: LineDiffEntry[] = [];
  let oldIndex = 0;
  let newIndex = 0;
  while (oldIndex < oldLines.length || newIndex < newLines.length) {
    if (oldIndex < oldLines.length && newIndex < newLines.length && oldLines[oldIndex] === newLines[newIndex]) {
      result.push({ kind: "context", text: oldLines[oldIndex], oldLine: oldIndex + 1, newLine: newIndex + 1 });
      oldIndex += 1;
      newIndex += 1;
    } else if (
      newIndex < newLines.length
      && (oldIndex === oldLines.length || lcs[oldIndex * columns + newIndex + 1] > lcs[(oldIndex + 1) * columns + newIndex])
    ) {
      result.push({ kind: "added", text: newLines[newIndex], newLine: newIndex + 1 });
      newIndex += 1;
    } else {
      result.push({ kind: "removed", text: oldLines[oldIndex], oldLine: oldIndex + 1 });
      oldIndex += 1;
    }
  }
  return result;
}

export function lineDiffCounts(diff: LineDiffEntry[]) {
  return diff.reduce((counts, entry) => {
    if (entry.kind === "added") counts.added += 1;
    if (entry.kind === "removed") counts.removed += 1;
    return counts;
  }, { added: 0, removed: 0 });
}
