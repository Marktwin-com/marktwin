import { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { cn } from '@/lib/utils';

// Configure marked options
marked.setOptions({
  breaks: true,
  gfm: true
});

interface MarkdownPreviewProps {
  content: string;
  className?: string;
}

export default function MarkdownPreview({
  content,
  className
}: MarkdownPreviewProps) {
  const renderedHtml = useMemo(() => {
    if (!content) return '';

    // Parse markdown to HTML
    const rawHtml = typeof marked.parse(content) === 'string' 
      ? (marked.parse(content) as string) 
      : '';

    // Sanitize HTML
    const sanitizedHtml = DOMPurify.sanitize(rawHtml);

    // Repository assets are intentionally outside the Markdown-only cabinet.
    // Keep remote/data images, but do not generate URLs for removed server file routes.
    if (typeof window !== 'undefined') {
      const parser = new DOMParser();
      const doc = parser.parseFromString(sanitizedHtml, 'text/html');
      const images = doc.querySelectorAll('img');

      images.forEach(img => {
        const src = img.getAttribute('src');
        if (
          src && 
          !src.startsWith('http://') && 
          !src.startsWith('https://') && 
          !src.startsWith('/') && 
          !src.startsWith('data:')
        ) {
          img.removeAttribute('src');
          img.setAttribute('title', 'Local repository assets are not loaded in this Markdown-only cabinet.');
        }
      });

      return doc.body.innerHTML;
    }

    return sanitizedHtml;
  }, [content]);

  return (
    <div 
      className={cn(
        "prose max-w-none p-4",
        // Theme-aware text colors
        "text-[hsl(var(--primary))]",
        "[.light]:text-black",
        "dark:text-white",
        "[&_*]:text-inherit",
        "dark:prose-invert",
        // Styling tokens for markdown items
        "[&_h1]:text-4xl [&_h1]:font-bold [&_h1]:mb-4 [&_h1]:mt-6 [&_h1]:text-[hsl(var(--obsidian-text))]",
        "[&_h2]:text-3xl [&_h2]:font-bold [&_h2]:mb-3 [&_h2]:mt-5 [&_h2]:text-[hsl(var(--obsidian-text))]",
        "[&_h3]:text-2xl [&_h3]:font-bold [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-[hsl(var(--obsidian-text))]",
        "[&_h4]:text-xl [&_h4]:font-bold [&_h4]:mb-2 [&_h4]:mt-4 [&_h4]:text-[hsl(var(--obsidian-text))]",
        "[&_h5]:text-lg [&_h5]:font-bold [&_h5]:mb-2 [&_h5]:mt-4 [&_h5]:text-[hsl(var(--obsidian-text))]",
        "[&_h6]:text-base [&_h6]:font-bold [&_h6]:mb-2 [&_h6]:mt-4 [&_h6]:text-[hsl(var(--obsidian-text))]",
        "[&_p]:mb-4 [&_p]:leading-7",
        "[&_ul]:list-disc [&_ul]:ml-6 [&_ul]:mb-4",
        "[&_ol]:list-decimal [&_ol]:ml-6 [&_ol]:mb-4",
        "[&_li]:mb-1",
        "[&_blockquote]:border-l-4 [&_blockquote]:border-[hsl(var(--obsidian-accent))] [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:mb-4 [&_blockquote]:text-[hsl(var(--obsidian-text-muted))]",
        "[&_code]:bg-[hsl(var(--obsidian-border))] [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:font-mono [&_code]:text-sm [&_code]:text-[hsl(var(--obsidian-accent))]",
        "[&_pre]:bg-[hsl(var(--obsidian-panel))] [&_pre]:p-4 [&_pre]:rounded [&_pre]:mb-4 [&_pre]:overflow-x-auto",
        "[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-[hsl(var(--obsidian-text))]",
        "[&_a]:text-[hsl(var(--obsidian-accent))] [&_a]:underline [&_a]:hover:opacity-80",
        "[&_strong]:font-bold",
        "[&_em]:italic",
        "[&_hr]:border-t [&_hr]:border-[hsl(var(--obsidian-border))] [&_hr]:my-4",
        "[&_table]:border-collapse [&_table]:w-full [&_table]:mb-4",
        "[&_th]:border [&_th]:border-[hsl(var(--obsidian-border))] [&_th]:p-2 [&_th]:bg-[hsl(var(--obsidian-panel))] [&_th]:font-semibold",
        "[&_td]:border [&_td]:border-[hsl(var(--obsidian-border))] [&_td]:p-2",
        className
      )}
      dangerouslySetInnerHTML={{ __html: renderedHtml }}
    />
  );
}
