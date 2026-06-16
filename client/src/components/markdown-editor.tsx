import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Textarea } from "@/components/ui/textarea";
import type { Note } from "@shared/schema";

interface MarkdownEditorProps {
  note: Note;
  mode: "basic" | "preview";
  onContentChange: (content: string) => void;
}

export default function MarkdownEditor({ note, mode, onContentChange }: MarkdownEditorProps) {
  const [content, setContent] = useState(note.content ?? "");

  useEffect(() => {
    setContent(note.content ?? "");
  }, [note.content]);

  if (mode === "preview") {
    return (
      <div className="prose prose-invert max-w-none h-full overflow-auto p-4">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    );
  }

  return (
    <Textarea
      value={content}
      onChange={(event) => {
        setContent(event.target.value);
        onContentChange(event.target.value);
      }}
      placeholder="Start writing markdown..."
      className="h-full min-h-[60vh] resize-none border-0 bg-transparent p-4 font-mono focus-visible:ring-0"
    />
  );
}
