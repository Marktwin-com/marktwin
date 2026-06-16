import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PDFDownloadButtonProps {
  markdown: string;
  title?: string;
  className?: string;
  fontFamily?: string;
}

export function PDFDownloadButton({ markdown, title, className, fontFamily }: PDFDownloadButtonProps) {
  const { toast } = useToast();

  const handleDownload = async () => {
    try {
      const response = await fetch('/api/pdf/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ markdown, title, fontFamily }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate PDF');
      }

      // Get the filename from the Content-Disposition header
      const contentDisposition = response.headers.get('Content-Disposition');
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
      const filename = filenameMatch ? filenameMatch[1] : 'document.pdf';

      // Create a blob from the PDF data
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      // Create a temporary link and trigger the download
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast({
        title: "Success",
        description: "PDF downloaded successfully",
      });
    } catch (error) {
      console.error('PDF download error:', error);
      toast({
        title: "Error",
        description: "Failed to download PDF. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <Button
      onClick={handleDownload}
      variant="ghost"
      size="sm"
      className={className + ' text-sm font-normal w-full justify-start cursor-pointer'}
    >
      Download PDF
    </Button>
  );
} 