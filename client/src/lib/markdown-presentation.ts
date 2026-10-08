import DOMPurify from "dompurify";
import hljs from "highlight.js";
import katex from "katex";
import { parseDocument } from "yaml";
import { Marked, Renderer } from "marked";
import type { AppearanceTheme } from "@shared/appearance-themes";

// Repository image paths must never become requests to the application server.
// Defer all non-inline images until the workspace resolves them through GitHub.
if (typeof window !== "undefined") {
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    // Preserve KaTeX's layout styles, but disallow CSS resource loads, including
    // escaped spellings of url(). Raw HTML must not create background requests.
    const style = node.getAttribute("style");
    if (style && /\\|(?:url|image-set|cross-fade)\s*\(/i.test(style)) node.removeAttribute("style");
    if (["image", "use"].includes(node.tagName.toLowerCase())) {
      for (const name of ["href", "xlink:href"]) {
        const href = node.getAttribute(name);
        if (href && !href.startsWith("#")) node.removeAttribute(name);
      }
    }
    if (node.tagName !== "IMG") return;
    node.removeAttribute("srcset");
    const source = node.getAttribute("src");
    if (source && !/^(data:image\/(?:png|jpeg|gif|webp|avif|bmp);|blob:)/i.test(source)) {
      node.removeAttribute("src");
      node.setAttribute("data-repository-src", source);
    }
  });
}

const mermaidCache = new Map<string, Promise<string>>();
const markdownHtmlCache = new Map<string, string>();
let mermaidModule: Promise<typeof import("mermaid")["default"]> | undefined;

function loadMermaid() {
  mermaidModule ||= import("mermaid").then((module) => module.default);
  return mermaidModule;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function safeId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "note";
}

function renderKatex(source: string, displayMode: boolean) {
  try {
    return katex.renderToString(source, {
      displayMode,
      throwOnError: true,
      trust: false,
      strict: "warn",
      output: "htmlAndMathml",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid mathematics";
    return `<code class="marktwin-render-error" title="${escapeHtml(message)}">${escapeHtml(source)}</code>`;
  }
}

function preprocessFrontMatter(markdown: string) {
  if (!markdown.startsWith("---\n") && !markdown.startsWith("---\r\n")) return { prefix: "", markdown };
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return { prefix: "", markdown };
  // Retired presentation metadata may remain in previously edited notes. It
  // no longer changes rendering, but keep it out of the visible YAML block.
  const visibleSource = match[1]
    .split(/\r?\n/)
    .filter((line) => !/^\s*marktwin-style\s*:/i.test(line))
    .join("\n")
    .trim();
  const highlighted = visibleSource ? hljs.highlight(visibleSource, { language: "yaml", ignoreIllegals: true }).value : "";
  const yaml = parseDocument(match[1], { prettyErrors: true });
  const error = yaml.errors[0]?.message;
  return {
    prefix: visibleSource || error ? `<section class="marktwin-frontmatter${error ? " marktwin-frontmatter-error" : ""}" aria-label="YAML front matter"><div class="marktwin-frontmatter-label">Front matter${error ? ` · <span class="marktwin-render-error">${escapeHtml(error)}</span>` : ""}</div>${visibleSource ? `<pre><code class="hljs language-yaml">${highlighted}</code></pre>` : ""}</section>` : "",
    markdown: markdown.slice(match[0].length),
  };
}

function preprocessFootnotes(markdown: string) {
  const definitions = new Map<string, string>();
  const withoutDefinitions = markdown.replace(/^\[\^([^\]\n]+)\]:[ \t]*(.+)$/gm, (_raw, id: string, text: string) => {
    definitions.set(id, text);
    return "";
  });
  if (definitions.size === 0) return withoutDefinitions;
  const withReferences = withoutDefinitions.replace(/\[\^([^\]\n]+)\]/g, (_raw, id: string) => {
    if (!definitions.has(id)) return _raw;
    const normalized = safeId(id);
    return `<sup class="marktwin-footnote-ref"><a href="#footnote-${normalized}" id="footnote-ref-${normalized}">${escapeHtml(id)}</a></sup>`;
  });
  const items = Array.from(definitions.entries()).map(([id, text]) => {
    const normalized = safeId(id);
    return `<li id="footnote-${normalized}">${escapeHtml(text)} <a href="#footnote-ref-${normalized}" aria-label="Back to reference">↩</a></li>`;
  }).join("");
  return `${withReferences}\n\n<section class="marktwin-footnotes"><hr><ol>${items}</ol></section>`;
}

function preprocessImageWidths(markdown: string) {
  return markdown.replace(
    /^(\s*)!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)\s+\{width=(\d{1,3})%\}\s*$/gm,
    (_raw, indent: string, alt: string, source: string, title: string | undefined, widthText: string) => {
      const width = Math.max(20, Math.min(100, Number(widthText)));
      const titleAttribute = title ? ` title="${escapeHtml(title)}"` : "";
      return `${indent}<img src="${escapeHtml(source)}" alt="${escapeHtml(alt)}"${titleAttribute} class="marktwin-sized-image" style="width: ${width}%; max-width: 100%; height: auto;">`;
    },
  );
}

function createMarked() {
  const renderer = new Renderer();
  renderer.code = ({ text, lang }) => {
    const language = (lang || "").trim().split(/\s+/)[0];
    if (language.toLowerCase() === "mermaid") {
      return `<div class="marktwin-mermaid" data-mermaid-source="${encodeURIComponent(text)}"><div class="marktwin-render-loading">Rendering diagram…</div></div>`;
    }
    const highlighted = language && hljs.getLanguage(language)
      ? hljs.highlight(text, { language, ignoreIllegals: true }).value
      : hljs.highlightAuto(text).value;
    return `<pre class="marktwin-code-block"><div class="marktwin-code-language">${escapeHtml(language || "text")}</div><code class="hljs${language ? ` language-${escapeHtml(language)}` : ""}">${highlighted}</code></pre>`;
  };

  const parser = new Marked({ renderer, gfm: true, breaks: true });
  parser.use({
    extensions: [
      {
        name: "displayMathDollar",
        level: "block",
        start(src: string) { return src.indexOf("$$"); },
        tokenizer(src: string) {
          const match = src.match(/^\$\$[ \t]*\r?\n?([\s\S]+?)\r?\n?\$\$(?:\r?\n|$)/);
          if (!match) return undefined;
          return { type: "displayMathDollar", raw: match[0], text: match[1].trim() };
        },
        renderer(token) { return `<div class="marktwin-math-block">${renderKatex(String(token.text || ""), true)}</div>`; },
      },
      {
        name: "displayMathBracket",
        level: "block",
        start(src: string) { return src.indexOf("\\["); },
        tokenizer(src: string) {
          const match = src.match(/^\\\[\s*([\s\S]+?)\s*\\\](?:\r?\n|$)/);
          if (!match) return undefined;
          return { type: "displayMathBracket", raw: match[0], text: match[1].trim() };
        },
        renderer(token) { return `<div class="marktwin-math-block">${renderKatex(String(token.text || ""), true)}</div>`; },
      },
      {
        name: "inlineMathParen",
        level: "inline",
        start(src: string) { return src.indexOf("\\("); },
        tokenizer(src: string) {
          const match = src.match(/^\\\((.+?)\\\)/);
          if (!match) return undefined;
          return { type: "inlineMathParen", raw: match[0], text: match[1] };
        },
        renderer(token) { return `<span class="marktwin-math-inline">${renderKatex(String(token.text || ""), false)}</span>`; },
      },
      {
        name: "inlineMathDollar",
        level: "inline",
        start(src: string) { return src.indexOf("$"); },
        tokenizer(src: string) {
          const match = src.match(/^\$(?!\s|\d+(?:[.,]\d+)?(?:\s|$))([^$\n]+?)(?<!\\)\$/);
          if (!match) return undefined;
          return { type: "inlineMathDollar", raw: match[0], text: match[1] };
        },
        renderer(token) { return `<span class="marktwin-math-inline">${renderKatex(String(token.text || ""), false)}</span>`; },
      },
    ],
  });
  return parser;
}

function decorateCallouts(html: string) {
  if (typeof window === "undefined") return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("blockquote").forEach((blockquote) => {
    const first = blockquote.querySelector(":scope > p:first-child");
    if (!first) return;
    const match = first.textContent?.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i);
    if (!match) return;
    const type = match[1].toLowerCase();
    first.innerHTML = first.innerHTML.replace(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i, "");
    blockquote.classList.add("marktwin-callout", `marktwin-callout-${type}`);
    const title = doc.createElement("div");
    title.className = "marktwin-callout-title";
    title.textContent = match[1][0] + match[1].slice(1).toLowerCase();
    blockquote.prepend(title);
  });
  return doc.body.innerHTML;
}

export function renderMarkdownHtml(content: string, cacheContext = "") {
  if (!content) return "";
  const cacheKey = `${cacheContext}\u0000${content}`;
  const cached = markdownHtmlCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const frontMatter = preprocessFrontMatter(content);
  const parser = createMarked();
  const parsed = parser.parse(preprocessFootnotes(preprocessImageWidths(frontMatter.markdown)));
  const raw = `${frontMatter.prefix}${typeof parsed === "string" ? parsed : ""}`;
  const sanitized = DOMPurify.sanitize(raw, {
    FORBID_TAGS: ["style", "link", "iframe", "object", "embed", "video", "audio", "source", "track", "form", "input"],
    FORBID_ATTR: ["srcset", "poster", "background", "ping"],
    ADD_TAGS: ["details", "summary"],
    ADD_ATTR: ["target", "rel", "data-mermaid-source", "open"],
    USE_PROFILES: { html: true, mathMl: true, svg: true },
  });
  const result = decorateCallouts(sanitized);
  markdownHtmlCache.set(cacheKey, result);
  if (markdownHtmlCache.size > 100) markdownHtmlCache.delete(markdownHtmlCache.keys().next().value as string);
  return result;
}

function hashSource(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function resolvedThemeColor(property: string, fallback: string) {
  if (typeof window === "undefined" || typeof document === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(property).trim() || fallback;
}

export async function renderMermaidSvg(source: string, theme: AppearanceTheme) {
  const key = `${theme}:${source}`;
  let pending = mermaidCache.get(key);
  if (!pending) {
    pending = (async () => {
      const mermaid = await loadMermaid();
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        // Mermaid's built-in switch only distinguishes light from dark. The
        // base theme lets diagrams use the same semantic palette as the
        // editor, code blocks, tables, and math for every named theme.
        theme: "base",
        themeVariables: {
          background: resolvedThemeColor("--diagram-background", "#ffffff"),
          primaryColor: resolvedThemeColor("--diagram-primary", "#f3f4f6"),
          primaryTextColor: resolvedThemeColor("--diagram-text", "#111827"),
          primaryBorderColor: resolvedThemeColor("--diagram-border", "#6b7280"),
          secondaryColor: resolvedThemeColor("--diagram-secondary", "#eef2ff"),
          tertiaryColor: resolvedThemeColor("--diagram-tertiary", "#f8fafc"),
          lineColor: resolvedThemeColor("--diagram-line", "#6b7280"),
          textColor: resolvedThemeColor("--diagram-text", "#111827"),
          edgeLabelBackground: resolvedThemeColor("--diagram-background", "#ffffff"),
          clusterBkg: resolvedThemeColor("--diagram-tertiary", "#f8fafc"),
          clusterBorder: resolvedThemeColor("--diagram-border", "#6b7280"),
          noteBkgColor: resolvedThemeColor("--diagram-secondary", "#eef2ff"),
          noteTextColor: resolvedThemeColor("--diagram-text", "#111827"),
          noteBorderColor: resolvedThemeColor("--diagram-border", "#6b7280"),
          fontFamily: "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, monospace",
        },
        suppressErrorRendering: true,
        htmlLabels: false,
        flowchart: { htmlLabels: false },
      });
      const result = await mermaid.render(`marktwin-mermaid-${hashSource(key)}-${Math.random().toString(36).slice(2, 7)}`, source);
      return DOMPurify.sanitize(result.svg, { USE_PROFILES: { svg: true, svgFilters: true } });
    })();
    mermaidCache.set(key, pending);
    if (mermaidCache.size > 100) mermaidCache.delete(mermaidCache.keys().next().value as string);
  }
  return pending;
}

export async function hydrateMermaid(container: HTMLElement, theme: AppearanceTheme) {
  const diagrams = Array.from(container.querySelectorAll<HTMLElement>(".marktwin-mermaid[data-mermaid-source]"));
  await Promise.all(diagrams.map(async (element) => {
    const encoded = element.dataset.mermaidSource;
    if (!encoded) return;
    try {
      element.innerHTML = await renderMermaidSvg(decodeURIComponent(encoded), theme);
      element.removeAttribute("data-mermaid-source");
    } catch (error) {
      element.innerHTML = "";
      const message = document.createElement("pre");
      message.className = "marktwin-render-error";
      message.textContent = error instanceof Error ? error.message : "Mermaid could not render this diagram.";
      element.append(message);
    }
  }));
}

export interface MarkdownOutlineItem {
  id: string;
  level: number;
  text: string;
  line: number;
}

export function parseMarkdownOutline(content: string): MarkdownOutlineItem[] {
  const items: MarkdownOutlineItem[] = [];
  let fenced = false;
  content.split(/\r?\n/).forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      return;
    }
    if (fenced) return;
    const match = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (!match) return;
    const text = match[2].replace(/\[([^\]]+)\]\([^)]*\)|[*_~`]/g, "$1").trim();
    items.push({ id: `${index + 1}-${safeId(text)}`, level: match[1].length, text, line: index + 1 });
  });
  return items;
}

export { renderKatex };
