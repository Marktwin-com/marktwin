import { useEffect, useRef, useState, useCallback } from 'react';
import { marked } from 'marked';
import TurndownService from 'turndown';
import { cn } from '@/lib/utils';
import DOMPurify from 'dompurify';

// Initialize Turndown service
const turndownService = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  emDelimiter: "*",
});

// Configure marked options
marked.setOptions({
  breaks: true,
  gfm: true
});

// Configure Turndown to handle code blocks
turndownService.addRule("codeBlocks", {
  filter: ["pre"],
  replacement: function (content, node) {
    const code = node.querySelector("code");
    if (!code) return content;
    const language = code.className?.replace("language-", "") || "";
    return `\n\`\`\`${language}\n${code.textContent}\n\`\`\`\n`;
  },
});

interface PreviewEditableProps {
  content: string;
  onUpdate: (content: string) => void;
  vaultId: number;
  noteId: string;
  sessionId: string;
  wsRef: React.MutableRefObject<WebSocket | undefined>;
}

export default function PreviewEditable({
  content,
  onUpdate,
  vaultId,
  noteId,
  sessionId,
  wsRef,
}: PreviewEditableProps) {
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<MutationObserver | null>(null);
  const isInitialMount = useRef(true);
  const lastKnownContent = useRef(content);
  const updateTimeoutRef = useRef<NodeJS.Timeout>();
  const isTypingRef = useRef(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();
  const [rawContent, setRawContent] = useState(content);

  // Convert markdown to HTML for preview
  const htmlContent = typeof marked.parse(rawContent || '') === 'string' 
    ? marked.parse(rawContent || '') as string 
    : '';

  // Debounced update function
  const debouncedUpdate = useCallback((newContent: string) => {
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }

    updateTimeoutRef.current = setTimeout(() => {
      if (newContent !== lastKnownContent.current) {
        lastKnownContent.current = newContent;
        setHasUnsavedChanges(true);
        onUpdate(newContent);
      }
    }, 1000);
  }, [onUpdate]);

  // Handle typing events
  const handleInput = useCallback(() => {
    if (!previewRef.current) return;

    isTypingRef.current = true;
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Get the current text content
    const text = previewRef.current.innerText;
    setRawContent(text);

    // Clear typing state after 1 second of no input
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      debouncedUpdate(text);
    }, 1000);
  }, [debouncedUpdate]);

  // Initialize content on mount
  useEffect(() => {
    if (!previewRef.current || !isInitialMount.current) return;
    
    const sanitizedHtml = DOMPurify.sanitize(htmlContent);
    previewRef.current.innerHTML = sanitizedHtml;
    isInitialMount.current = false;

    // Set up mutation observer to track changes
    observerRef.current = new MutationObserver((mutations) => {
      if (!previewRef.current || isTypingRef.current) return;

      // Only process mutations that are actual content changes
      const hasContentChanges = mutations.some(mutation => 
        mutation.type === 'characterData' || 
        (mutation.type === 'childList' && mutation.addedNodes.length > 0)
      );

      if (hasContentChanges) {
        const text = previewRef.current.innerText;
        setRawContent(text);
        debouncedUpdate(text);
      }
    });

    // Start observing with more specific options
    observerRef.current.observe(previewRef.current, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: false,
      characterDataOldValue: true
    });

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  // Handle external content updates
  useEffect(() => {
    if (!previewRef.current || isInitialMount.current) return;
    
    if (content !== lastKnownContent.current) {
      // Only update if the content is actually different and we're not typing
      if (!isTypingRef.current) {
        const selection = window.getSelection();
        const range = selection?.getRangeAt(0);
        const wasFocused = document.activeElement === previewRef.current;

        // Temporarily disconnect observer
        observerRef.current?.disconnect();
        
        // Update content
        setRawContent(content);
        const sanitizedHtml = DOMPurify.sanitize(marked.parse(content) as string);
        previewRef.current.innerHTML = sanitizedHtml;
        lastKnownContent.current = content;

        // Restore focus and selection if needed
        if (wasFocused && range) {
          previewRef.current.focus();
          try {
            selection?.removeAllRanges();
            selection?.addRange(range);
          } catch (e) {
            previewRef.current.focus();
          }
        }

        // Reconnect observer
        observerRef.current?.observe(previewRef.current, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: false,
          characterDataOldValue: true
        });
      }
    }
  }, [content]);

  // Handle paste events
  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData?.getData('text/plain');
    if (text) {
      // Insert plain text at cursor position
      document.execCommand('insertText', false, text);
    }
  };

  return (
    <div className="relative">
      {/* Unsaved changes indicator */}
      {hasUnsavedChanges && (
        <div className="absolute top-2 right-2 text-xs text-gray-400">
          Unsaved changes...
        </div>
      )}

      {/* Editable preview */}
      <div
        ref={previewRef}
        contentEditable
        onInput={handleInput}
        onPaste={handlePaste}
        suppressContentEditableWarning
        className={cn(
          "prose max-w-none min-h-[calc(100vh-12rem)] p-4 focus:outline-none",
          // Default (root/cream): use primary color
          "text-[hsl(var(--primary))]",
          // When .light class is present on an ancestor: force black
          "[.light]:text-black",
          // When dark mode is active: force white
          "dark:text-white",
          // Force all children of prose to inherit that color
          "[&_*]:text-inherit",
          // In dark mode: invert prose styling (headings, links, code become light)
          "dark:prose-invert",
          // Add styles for markdown elements
          "[&_h1]:text-4xl [&_h1]:font-bold [&_h1]:mb-4",
          "[&_h2]:text-3xl [&_h2]:font-bold [&_h2]:mb-3",
          "[&_h3]:text-2xl [&_h3]:font-bold [&_h3]:mb-2",
          "[&_h4]:text-xl [&_h4]:font-bold [&_h4]:mb-2",
          "[&_h5]:text-lg [&_h5]:font-bold [&_h5]:mb-2",
          "[&_h6]:text-base [&_h6]:font-bold [&_h6]:mb-2",
          "[&_p]:mb-4",
          "[&_ul]:list-disc [&_ul]:ml-6 [&_ul]:mb-4",
          "[&_ol]:list-decimal [&_ol]:ml-6 [&_ol]:mb-4",
          "[&_li]:mb-1",
          "[&_blockquote]:border-l-4 [&_blockquote]:border-gray-300 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:mb-4",
          "[&_code]:bg-gray-100 [&_code]:dark:bg-gray-800 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:font-mono [&_code]:text-sm",
          "[&_pre]:bg-gray-100 [&_pre]:dark:bg-gray-800 [&_pre]:p-4 [&_pre]:rounded [&_pre]:mb-4 [&_pre]:overflow-x-auto",
          "[&_a]:text-blue-600 [&_a]:dark:text-blue-400 [&_a]:underline",
          "[&_strong]:font-bold",
          "[&_em]:italic",
          "[&_hr]:border-t [&_hr]:border-gray-300 [&_hr]:my-4",
          "[&_table]:border-collapse [&_table]:w-full [&_table]:mb-4",
          "[&_th]:border [&_th]:border-gray-300 [&_th]:p-2 [&_th]:bg-gray-100 [&_th]:dark:bg-gray-800",
          "[&_td]:border [&_td]:border-gray-300 [&_td]:p-2"
        )}
      />
    </div>
  );
}

// Helper function to sanitize HTML
function sanitizeHtml(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;

  // Remove unwanted tags and attributes
  const allowedTags = [
    'p', 'br', 'strong', 'em', 'code', 'pre', 'h1',
    'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li',
    'blockquote', 'a', 'img',
  ];
  const allowedAttributes = ['href', 'src', 'alt', 'class'];

  const sanitizeNode = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) return;

    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;
      if (!allowedTags.includes(element.tagName.toLowerCase())) {
        const parent = element.parentNode;
        if (parent) {
          while (element.firstChild) {
            parent.insertBefore(element.firstChild, element);
          }
          parent.removeChild(element);
          return;
        }
      }

      // Remove any attribute that's not whitelisted
      Array.from(element.attributes).forEach((attr) => {
        if (!allowedAttributes.includes(attr.name)) {
          element.removeAttribute(attr.name);
        }
      });
    }

    Array.from(node.childNodes).forEach(sanitizeNode);
  };

  sanitizeNode(div);
  return div.innerHTML;
}
