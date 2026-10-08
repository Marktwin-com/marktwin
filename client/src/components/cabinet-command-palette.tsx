import { useMemo } from "react";
import { FileText, LayoutDashboard, Search, Settings, Sparkles, Star, Users, Wand2 } from "lucide-react";
import type { SearchResult } from "@shared/schema";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut } from "@/components/ui/command";
import { useI18n } from "@/contexts/i18n-context";

interface CabinetCommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  results: SearchResult[];
  onOpenResult: (result: SearchResult) => void;
  onCreateFile: (type: "markdown" | "canvas" | "drawing") => void;
  onQuickCapture: () => void;
  onOpenSettings: () => void;
  onTogglePanel: (panel: "chat" | "history" | "backlinks") => void;
  onShowChanges: () => void;
  onToggleWorkingSet: () => void;
}

function resultIcon(result: SearchResult) {
  if (result.kind === "canvas-card") return <LayoutDashboard className="h-4 w-4 text-violet-400" />;
  if (result.kind === "decision") return <Sparkles className="h-4 w-4 text-amber-400" />;
  return <FileText className="h-4 w-4 text-blue-400" />;
}

export default function CabinetCommandPalette({ open, onOpenChange, results, onOpenResult, onCreateFile, onQuickCapture, onOpenSettings, onTogglePanel, onShowChanges, onToggleWorkingSet }: CabinetCommandPaletteProps) {
  const { t } = useI18n();
  const grouped = useMemo(() => ({
    files: results.filter((result) => result.kind === "file" || result.kind === "heading"),
    decisions: results.filter((result) => result.kind === "decision"),
    canvas: results.filter((result) => result.kind === "canvas-card"),
  }), [results]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder={t("workspace.searchPlaceholder")} />
      <CommandList>
        <CommandEmpty>{t("workspace.noMatches")}</CommandEmpty>
        <CommandGroup heading={t("workspace.createCapture")}>
          <CommandItem onSelect={() => { onQuickCapture(); onOpenChange(false); }}><Wand2 className="h-4 w-4" />{t("workspace.quickCapture")}<CommandShortcut>⌘⌥N</CommandShortcut></CommandItem>
          <CommandItem onSelect={() => { onCreateFile("markdown"); onOpenChange(false); }}><FileText className="h-4 w-4" />{t("workspace.newMarkdown")}</CommandItem>
          <CommandItem onSelect={() => { onCreateFile("canvas"); onOpenChange(false); }}><LayoutDashboard className="h-4 w-4" />{t("workspace.newCanvas")}</CommandItem>
          <CommandItem onSelect={() => { onCreateFile("drawing"); onOpenChange(false); }}><Sparkles className="h-4 w-4" />{t("workspace.newDrawing")}</CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading={t("workspace.group")}>
          <CommandItem onSelect={() => { onOpenSettings(); onOpenChange(false); }}><Settings className="h-4 w-4" />{t("workspace.openSettings")}</CommandItem>
          <CommandItem onSelect={() => { onTogglePanel("chat"); onOpenChange(false); }}><Users className="h-4 w-4" />{t("workspace.toggleChat")}</CommandItem>
          <CommandItem onSelect={() => { onTogglePanel("history"); onOpenChange(false); }}><Search className="h-4 w-4" />{t("workspace.toggleHistory")}</CommandItem>
          <CommandItem onSelect={() => { onTogglePanel("backlinks"); onOpenChange(false); }}><Search className="h-4 w-4" />{t("workspace.showBacklinks")}</CommandItem>
          <CommandItem onSelect={() => { onShowChanges(); onOpenChange(false); }}><Sparkles className="h-4 w-4" />{t("workspace.showChanges")}</CommandItem>
          <CommandItem onSelect={() => { onToggleWorkingSet(); onOpenChange(false); }}><Star className="h-4 w-4" />{t("workspace.toggleWorkingSet")}</CommandItem>
        </CommandGroup>
        {grouped.files.length > 0 && <CommandGroup heading={t("workspace.filesHeadings")}>{grouped.files.map((result) => <CommandItem key={result.id} value={`${result.title} ${result.path} ${result.excerpt || ""}`} onSelect={() => { onOpenResult(result); onOpenChange(false); }}>{resultIcon(result)}<span className="min-w-0"><span className="block truncate">{result.title}</span><span className="block truncate text-xs text-muted-foreground">{result.path}{result.line ? ` · ${t("workspace.line", { line: result.line })}` : ""}</span>{result.excerpt && <span className="block truncate text-xs text-muted-foreground/80">{result.excerpt}</span>}</span></CommandItem>)}</CommandGroup>}
        {grouped.decisions.length > 0 && <CommandGroup heading={t("workspace.decisions")}>{grouped.decisions.map((result) => <CommandItem key={result.id} value={`${result.title} ${result.excerpt || ""}`} onSelect={() => { onOpenResult(result); onOpenChange(false); }}>{resultIcon(result)}<span className="min-w-0"><span className="block truncate">{result.title}</span><span className="block truncate text-xs text-muted-foreground">{result.excerpt}</span></span></CommandItem>)}</CommandGroup>}
        {grouped.canvas.length > 0 && <CommandGroup heading={t("workspace.canvasCards")}>{grouped.canvas.map((result) => <CommandItem key={result.id} value={`${result.title} ${result.path}`} onSelect={() => { onOpenResult(result); onOpenChange(false); }}>{resultIcon(result)}<span className="min-w-0"><span className="block truncate">{result.title}</span><span className="block truncate text-xs text-muted-foreground">{result.path}</span>{result.excerpt && <span className="block truncate text-xs text-muted-foreground/80">{result.excerpt}</span>}</span></CommandItem>)}</CommandGroup>}
      </CommandList>
    </CommandDialog>
  );
}
