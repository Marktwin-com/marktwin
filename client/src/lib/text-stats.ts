export interface TextStatistics {
  lines: number;
  words: number;
  characters: number;
}

/** Count text consistently for both whole documents and CodeMirror selections. */
export function textStatistics(content: string): TextStatistics {
  return {
    lines: content.length === 0 ? 1 : content.split(/\r?\n/).length,
    words: content.trim() ? content.trim().split(/\s+/).length : 0,
    // String.length intentionally counts whitespace and UTF-16 code units.
    characters: content.length,
  };
}
