export function parseMarkdownHeaders(content: string): Array<{ level: number; text: string; id: string }> {
  const headers: Array<{ level: number; text: string; id: string }> = [];
  const lines = content.split('\n');
  
  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      const level = match[1].length;
      const text = match[2].trim();
      const id = text.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');
      headers.push({ level, text, id });
    }
  }
  
  return headers;
}

export function extractLinks(content: string): Array<{ text: string; url: string; type: 'internal' | 'external' }> {
  const links: Array<{ text: string; url: string; type: 'internal' | 'external' }> = [];
  
  // Match markdown links [text](url)
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match;
  
  while ((match = linkRegex.exec(content)) !== null) {
    const text = match[1];
    const url = match[2];
    const type = url.startsWith('http') ? 'external' : 'internal';
    links.push({ text, url, type });
  }
  
  return links;
}

export function generateTableOfContents(content: string): string {
  const headers = parseMarkdownHeaders(content);
  
  if (headers.length === 0) {
    return '';
  }
  
  let toc = '## Table of Contents\n\n';
  
  for (const header of headers) {
    const indent = '  '.repeat(header.level - 1);
    toc += `${indent}- [${header.text}](#${header.id})\n`;
  }
  
  return toc + '\n';
}

export function insertTableOfContents(content: string): string {
  const toc = generateTableOfContents(content);
  
  if (!toc) {
    return content;
  }
  
  // Find the first heading and insert TOC before it
  const lines = content.split('\n');
  const firstHeaderIndex = lines.findIndex(line => line.match(/^#/));
  
  if (firstHeaderIndex === -1) {
    return toc + content;
  }
  
  lines.splice(firstHeaderIndex, 0, toc);
  return lines.join('\n');
}

export function formatMarkdown(content: string): string {
  return content
    .replace(/\n\n\n+/g, '\n\n') // Remove extra blank lines
    .replace(/[ \t]+$/gm, '') // Remove trailing whitespace
    .trim();
}

export function searchInMarkdown(content: string, query: string): Array<{ line: number; text: string; match: string }> {
  const results: Array<{ line: number; text: string; match: string }> = [];
  const lines = content.split('\n');
  const regex = new RegExp(query, 'gi');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const matches = line.match(regex);
    
    if (matches) {
      for (const match of matches) {
        results.push({
          line: i + 1,
          text: line.trim(),
          match
        });
      }
    }
  }
  
  return results;
}
