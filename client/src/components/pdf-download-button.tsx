import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import DOMPurify from "dompurify";
import { marked } from "marked";

interface PDFDownloadButtonProps {
  markdown: string;
  title?: string;
  className?: string;
  fontFamily?: string;
}

export function PDFDownloadButton({ markdown, title, className, fontFamily }: PDFDownloadButtonProps) {
  const { toast } = useToast();

  const handlePrint = () => {
    try {
      const printWindow = window.open("about:blank", "_blank");
      if (!printWindow) throw new Error("The browser blocked the print window.");

      printWindow.opener = null;
      const parsed = marked.parse(markdown, { gfm: true, breaks: true });
      const safeHtml = DOMPurify.sanitize(typeof parsed === "string" ? parsed : "", {
        FORBID_TAGS: ["img", "iframe", "object", "embed", "script", "style", "form", "input", "link", "meta", "video", "audio", "source"],
        FORBID_ATTR: ["style", "onerror", "onload"],
      });
      const safeTitle = (title || "Marktwin document").replace(/[<>&"']/g, (character) => ({
        "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#039;",
      })[character] || character);
      const safeFont = fontFamily && /^[a-zA-Z0-9 ,'-]+$/.test(fontFamily) ? fontFamily : "system-ui, sans-serif";

      printWindow.document.open();
      printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>${safeTitle}</title><style>
        @page { margin: 18mm; }
        body { color: #18181b; font: 15px/1.6 ${safeFont}; margin: 0 auto; max-width: 780px; }
        h1,h2,h3 { line-height: 1.25; page-break-after: avoid; }
        pre,code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
        pre { background: #f4f4f5; padding: 12px; overflow-wrap: anywhere; white-space: pre-wrap; }
        blockquote { border-left: 3px solid #a1a1aa; margin-left: 0; padding-left: 16px; color: #52525b; }
        table { border-collapse: collapse; width: 100%; } th,td { border: 1px solid #d4d4d8; padding: 6px; text-align: left; }
        a { color: inherit; overflow-wrap: anywhere; }
      </style></head><body>${safeHtml}</body></html>`);
      printWindow.document.close();
      printWindow.focus();
      window.setTimeout(() => printWindow.print(), 50);
    } catch (error) {
      toast({
        title: "Could not open print view",
        description: error instanceof Error ? error.message : "Allow pop-ups and try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <Button
      onClick={handlePrint}
      variant="ghost"
      size="sm"
      className={(className || "") + " text-sm font-normal w-full justify-start cursor-pointer"}
    >
      <Printer className="mr-2 h-4 w-4" />
      Print / Save as PDF
    </Button>
  );
}
