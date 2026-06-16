import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import Highlight from '@tiptap/extension-highlight';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import { common, createLowlight } from 'lowlight';
import { useEffect, useRef, useState, useMemo } from 'react';
import Mousetrap from 'mousetrap';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Bold, Italic, Strikethrough, Heading2, Code, Quote, List, ListOrdered, Link as LinkIcon, Image as ImageIcon, Undo, Redo } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { Markdown } from 'tiptap-markdown';
import { Awareness } from 'y-protocols/awareness';

const lowlight = createLowlight(common);

interface WysiwygEditorProps {
  content: string;
  onUpdate: (content: string) => void;
  readOnly?: boolean;
  ydoc?: Y.Doc;
  awareness?: Awareness;
  fragmentName?: string;
}

export default function WysiwygEditor({ 
  content, 
  onUpdate, 
  readOnly = false,
  ydoc,
  awareness,
  fragmentName = 'default'
}: WysiwygEditorProps) {
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  let editor = null;
  editor = useEditor({
    extensions: [
      Markdown,
        StarterKit.configure({
          heading: {
            levels: [1, 2, 3, 4, 5, 6],
          },
          codeBlock: false, // We'll use CodeBlockLowlight instead
        }),
        Link.configure({
          openOnClick: false,
          HTMLAttributes: {
            class: 'text-accent hover:text-accent/80 underline',
          },
        }),
        Image.configure({
          HTMLAttributes: {
            class: 'max-w-full rounded-lg',
          },
        }),
        Placeholder.configure({
          placeholder: 'Start writing...',
        }),
        Highlight,
        TaskList,
        TaskItem.configure({
          nested: true,
        }),
        CodeBlockLowlight.configure({
          lowlight,
          HTMLAttributes: {
            class: 'rounded-lg bg-gray-800 p-4 font-mono text-sm',
          },
        }),
        ...(ydoc ? [Collaboration.configure({
          document: ydoc,
          field: fragmentName,
        })] : []),
        ...(awareness ? [CollaborationCursor.configure({
          provider: { awareness } as any,
          user: awareness.getLocalState()?.user || {
            name: `User`,
            color: `#10B981`,
          },
        })] : []),
      ],
      content: content,
      editable: !readOnly,
      onUpdate: ({ editor }) => {
        // Convert TipTap back to markdown for storage
        const md = editor.storage.markdown.getMarkdown();
        onUpdate(md);
        setHasUnsavedChanges(true);
        // Clear unsaved changes indicator after 2 seconds of no changes
        const timeout = setTimeout(() => {
          setHasUnsavedChanges(false);
        }, 2000);
        return () => clearTimeout(timeout);
      },
      editorProps: {
        attributes: {
          class: 'prose prose-invert max-w-none min-h-[200px] focus:outline-none',
        },
      },
    }, [ydoc, fragmentName]);

  // Set up keyboard shortcuts
  useEffect(() => {
    if (!editor || readOnly) return;

    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const modKey = isMac ? 'cmd' : 'ctrl';

    const shortcuts = {
      [`${modKey}+b`]: () => editor.chain().focus().toggleBold().run(),
      [`${modKey}+i`]: () => editor.chain().focus().toggleItalic().run(),
      [`${modKey}+shift+s`]: () => editor.chain().focus().toggleStrike().run(),
      [`${modKey}+shift+h`]: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      [`${modKey}+shift+c`]: () => editor.chain().focus().toggleCodeBlock().run(),
      [`${modKey}+shift+q`]: () => editor.chain().focus().toggleBlockquote().run(),
      [`${modKey}+shift+u`]: () => editor.chain().focus().toggleBulletList().run(),
      [`${modKey}+shift+o`]: () => editor.chain().focus().toggleOrderedList().run(),
      [`${modKey}+k`]: () => {
        const url = window.prompt('Enter URL');
        if (url) {
          editor.chain().focus().setLink({ href: url }).run();
        }
      },
      [`${modKey}+shift+i`]: () => {
        const url = window.prompt('Enter image URL');
        if (url) {
          editor.chain().focus().setImage({ src: url }).run();
        }
      },
      [`${modKey}+z`]: () => editor.chain().focus().undo().run(),
      [`${modKey}+shift+z`]: () => editor.chain().focus().redo().run(),
      [`${modKey}+y`]: () => editor.chain().focus().redo().run(),
    };

    Object.entries(shortcuts).forEach(([key, callback]) => {
      Mousetrap.bind(key, (e: KeyboardEvent) => {
        e.preventDefault();
        callback();
      });
    });

    return () => {
      Mousetrap.unbind(Object.keys(shortcuts));
    };
  }, [editor, readOnly]);

  // Update content when prop changes if empty or external change without Ydoc
  useEffect(() => {
    if (editor && !ydoc && content !== editor.storage.markdown?.getMarkdown()) {
      editor.commands.setContent(content);
    }
  }, [content, editor, ydoc]);

  if (!editor) {
    return <div className="p-4 text-gray-400">Loading collaborative editor...</div>;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Editor Toolbar */}
      <div className="flex items-center gap-1 p-2 border-b border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-sidebar))]">
        <TooltipProvider>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => editor.chain().focus().toggleBold().run()}
                  className={editor.isActive('bold') ? 'bg-accent/20' : ''}
                >
                  <Bold className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Bold (Ctrl/Cmd + B)</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => editor.chain().focus().toggleItalic().run()}
                  className={editor.isActive('italic') ? 'bg-accent/20' : ''}
                >
                  <Italic className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Italic (Ctrl/Cmd + I)</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => editor.chain().focus().toggleStrike().run()}
                  className={editor.isActive('strike') ? 'bg-accent/20' : ''}
                >
                  <Strikethrough className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Strikethrough (Ctrl/Cmd + Shift + S)</p>
              </TooltipContent>
            </Tooltip>

            <div className="w-px h-6 bg-[hsl(var(--obsidian-border))] mx-1" />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                  className={editor.isActive('heading', { level: 2 }) ? 'bg-accent/20' : ''}
                >
                  <Heading2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Heading (Ctrl/Cmd + Shift + H)</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => editor.chain().focus().toggleCodeBlock().run()}
                  className={editor.isActive('codeBlock') ? 'bg-accent/20' : ''}
                >
                  <Code className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Code Block (Ctrl/Cmd + Shift + C)</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => editor.chain().focus().toggleBlockquote().run()}
                  className={editor.isActive('blockquote') ? 'bg-accent/20' : ''}
                >
                  <Quote className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Blockquote (Ctrl/Cmd + Shift + Q)</p>
              </TooltipContent>
            </Tooltip>

            <div className="w-px h-6 bg-[hsl(var(--obsidian-border))] mx-1" />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => editor.chain().focus().toggleBulletList().run()}
                  className={editor.isActive('bulletList') ? 'bg-accent/20' : ''}
                >
                  <List className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Bullet List (Ctrl/Cmd + Shift + U)</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => editor.chain().focus().toggleOrderedList().run()}
                  className={editor.isActive('orderedList') ? 'bg-accent/20' : ''}
                >
                  <ListOrdered className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Ordered List (Ctrl/Cmd + Shift + O)</p>
              </TooltipContent>
            </Tooltip>

            <div className="w-px h-6 bg-[hsl(var(--obsidian-border))] mx-1" />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const url = window.prompt('Enter URL');
                    if (url) {
                      editor.chain().focus().setLink({ href: url }).run();
                    }
                  }}
                  className={editor.isActive('link') ? 'bg-accent/20' : ''}
                >
                  <LinkIcon className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Link (Ctrl/Cmd + K)</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const url = window.prompt('Enter image URL');
                    if (url) {
                      editor.chain().focus().setImage({ src: url }).run();
                    }
                  }}
                >
                  <ImageIcon className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Image (Ctrl/Cmd + Shift + I)</p>
              </TooltipContent>
            </Tooltip>

            <div className="w-px h-6 bg-[hsl(var(--obsidian-border))] mx-1" />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => editor.chain().focus().undo().run()}
                  disabled={!editor.can().undo()}
                >
                  <Undo className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Undo (Ctrl/Cmd + Z)</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => editor.chain().focus().redo().run()}
                  disabled={!editor.can().redo()}
                >
                  <Redo className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Redo (Ctrl/Cmd + Shift + Z)</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </div>

      {/* Editor Content */}
      <div className="flex-1 overflow-auto">
        <EditorContent editor={editor} className="min-h-full" />
      </div>
    </div>
  );
} 