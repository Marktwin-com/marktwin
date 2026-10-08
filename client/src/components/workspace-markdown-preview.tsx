import { useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import { editorContentLayout, useEditorPreferences } from "@/lib/editor-preferences";
import { hydrateMermaid, renderMarkdownHtml } from "@/lib/markdown-presentation";
import { useTheme } from "@/contexts/theme-context";
import { useI18n } from "@/contexts/i18n-context";

interface MarkdownPreviewProps {
  content: string;
  className?: string;
  resolveImage?: (source: string) => Promise<string | null>;
  repositorySha?: string;
}

export default function MarkdownPreview({ content, className, resolveImage, repositorySha }: MarkdownPreviewProps) {
  const preferences = useEditorPreferences();
  const { theme } = useTheme();
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const fontFamily = preferences.fontFamily === "sans"
    ? "'Source Sans 3', -apple-system, BlinkMacSystemFont, sans-serif"
    : "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, monospace";

  const renderedHtml = useMemo(() => {
    const html = renderMarkdownHtml(content, `${theme}:${repositorySha || "working"}`);
    if (!html || typeof window === "undefined") return html;
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("a").forEach((link) => {
      if (/^https?:\/\//i.test(link.getAttribute("href") || "")) {
        link.setAttribute("target", "_blank");
        link.setAttribute("rel", "noopener noreferrer");
      }
    });
    doc.querySelectorAll("img").forEach((image) => {
      const src = image.dataset.repositorySrc || image.getAttribute("src") || "";
      if (!src || /^(data:|blob:)/i.test(src)) return;
      image.removeAttribute("src");
      image.dataset.repositorySrc = src;
      image.classList.add("marktwin-repository-image");
      image.setAttribute("aria-busy", "true");
      image.setAttribute("title", t("workspace.loadingRepositoryImage"));
    });
    return doc.body.innerHTML;
  }, [content, repositorySha, t, theme]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let canceled = false;
    void hydrateMermaid(container, theme);
    const pending = Array.from(container.querySelectorAll<HTMLImageElement>("img[data-repository-src]"));
    pending.forEach((image) => {
      const source = image.dataset.repositorySrc;
      if (!source) return;
      if (!resolveImage) {
        image.removeAttribute("aria-busy");
        image.setAttribute("alt", image.alt || t("workspace.repositoryImageUnavailable", { source }));
        image.setAttribute("title", t("workspace.repositoryImagesOwnerOnly"));
        return;
      }
      void resolveImage(source).then((url) => {
        if (canceled || !image.isConnected) return;
        image.removeAttribute("aria-busy");
        if (url) {
          image.src = url;
          image.setAttribute("title", source);
        } else {
          image.setAttribute("alt", image.alt || t("workspace.repositoryImageUnavailable", { source }));
          image.setAttribute("title", t("workspace.repositoryImageLoadFailed"));
        }
      }).catch(() => {
        if (canceled || !image.isConnected) return;
        image.removeAttribute("aria-busy");
        image.setAttribute("title", t("workspace.repositoryImageLoadFailed"));
      });
    });
    return () => { canceled = true; };
  }, [renderedHtml, resolveImage, t, theme]);

  return (
    <div
      ref={containerRef}
      dir="auto"
      className={cn("marktwin-markdown prose max-w-none p-4 sm:p-6 dark:prose-invert", className)}
      style={{
        ...editorContentLayout(preferences.contentWidth, preferences.contentAlignment),
        fontFamily,
        fontSize: `${preferences.fontSize}px`,
      }}
      dangerouslySetInnerHTML={{ __html: renderedHtml }}
    />
  );
}
