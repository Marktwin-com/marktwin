import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sun, Moon } from 'lucide-react';

interface FilePreviewProps {
  file: {
    filename: string;
    content?: string;
    path: string;
  };
  vaultSlug: string;
}

export default function FilePreview({ file, vaultSlug }: FilePreviewProps) {
  const [bgType, setBgType] = useState<"white" | "dark">("white");

  const isSvg = /\.svg$/i.test(file.filename);
  const isImage = /\.(jpg|jpeg|png|gif)$/i.test(file.filename);
  const isPdf = /\.pdf$/i.test(file.filename);

  // Clean up file path to avoid double slashes
  let cleanPath = file.path ? file.path.replace(/^\/+|\/+$/g, '') : '';
  let fileUrl = cleanPath
    ? `/api/vaults/${vaultSlug}/files/${cleanPath}/${file.filename}`
    : `/api/vaults/${vaultSlug}/files/${file.filename}`;

  if (isSvg) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[hsl(var(--obsidian-bg))] p-6 text-center overflow-auto relative">
        <Button
          variant="outline"
          size="sm"
          className="absolute top-4 right-4 bg-[hsl(var(--obsidian-panel))] text-[hsl(var(--obsidian-text))] hover:bg-[hsl(var(--obsidian-panel-hover))]"
          onClick={() => setBgType(bgType === "white" ? "dark" : "white")}
        >
          {bgType === "white" ? <Moon className="h-4 w-4 mr-2" /> : <Sun className="h-4 w-4 mr-2" />}
          Toggle Background
        </Button>
        <div className={cn(
          "p-4 rounded-lg shadow-sm max-w-full max-h-full flex items-center justify-center transition-colors",
          bgType === "white" ? "bg-white" : "bg-gray-900"
        )}>
          <img
            src={fileUrl}
            alt={file.filename}
            className="max-w-full max-h-full object-contain"
          />
        </div>
      </div>
    );
  }

  if (isImage) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[hsl(var(--obsidian-bg))] p-6 text-center">
        <div className="max-w-md p-6 rounded-lg bg-[hsl(var(--obsidian-panel))] border border-[hsl(var(--obsidian-border))] shadow-lg">
          <div className="text-[hsl(var(--obsidian-accent))] text-4xl mb-4">🖼️</div>
          <h3 className="text-lg font-semibold text-[hsl(var(--obsidian-text))] mb-2">Plain Image Preview Disabled</h3>
          <p className="text-sm text-[hsl(var(--obsidian-text-muted))] leading-relaxed">
            For security and performance reasons, we decided not to allow previewing plain image files directly in the cabinet during this initial version.
          </p>
        </div>
      </div>
    );
  }

  if (isPdf) {
    return (
      <div className="w-full h-full bg-[hsl(var(--obsidian-bg))] p-4 flex flex-col">
        <iframe
          src={fileUrl}
          className="w-full flex-1 border-0 rounded-lg bg-[hsl(var(--obsidian-bg))]"
          title={file.filename}
        />
        <div className="mt-2 text-xs text-[hsl(var(--obsidian-text-muted))] text-center">
          Can't see the PDF?{' '}
          <a
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[hsl(var(--obsidian-accent))] hover:underline font-semibold"
          >
            Open in new tab
          </a>{' '}
          or{' '}
          <a
            href={fileUrl}
            download
            className="text-[hsl(var(--obsidian-accent))] hover:underline font-semibold"
          >
            Download file
          </a>
        </div>
      </div>
    );
  }

  return null;
} 