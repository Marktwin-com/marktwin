import type { CSSProperties } from "react";
import { AlertCircle, Clock3, GitCommitHorizontal, Loader2, RefreshCw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { GitHubCommitSummary } from "@/lib/workspace-github";
import { useI18n } from "@/contexts/i18n-context";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useWorkspaceMobile } from "@/hooks/use-workspace-mobile";

interface WorkspaceHistoryPanelProps {
  open: boolean;
  width: number;
  onWidthChange: (width: number) => void;
  onClose: () => void;
  loading: boolean;
  error: string;
  commits: GitHubCommitSummary[];
  unpublishedCount: number;
  onRetry: () => void;
  subtitle?: string;
  ariaLabel?: string;
}

export default function WorkspaceHistoryPanel({ open, width, onWidthChange, onClose, loading, error, commits, unpublishedCount, onRetry, subtitle = "Owner-only GitHub activity", ariaLabel = "Git history" }: WorkspaceHistoryPanelProps) {
  const { t, dateTime } = useI18n();
  const mobile = useWorkspaceMobile();
  if (!open) return null;
  const style = { "--workspace-chat-width": `${width}px` } as CSSProperties;
  const panel = (
    <>
      <div
        className="resizer workspace-chat-resizer hidden touch-none sm:block"
        style={style}
        role="separator"
        aria-label="Resize history panel"
        aria-orientation="vertical"
        onPointerDown={(event) => {
          event.preventDefault();
          const startX = event.clientX;
          const startWidth = width;
          const handleMove = (moveEvent: PointerEvent) => onWidthChange(startWidth - (moveEvent.clientX - startX));
          const cleanup = () => {
            window.removeEventListener("pointermove", handleMove);
            window.removeEventListener("pointerup", cleanup);
            window.removeEventListener("pointercancel", cleanup);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
          };
          document.body.style.cursor = "col-resize";
          document.body.style.userSelect = "none";
          window.addEventListener("pointermove", handleMove);
          window.addEventListener("pointerup", cleanup, { once: true });
          window.addEventListener("pointercancel", cleanup, { once: true });
        }}
      />
      <aside className={`workspace-chat-panel flex flex-col border-l border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-bg))] ${mobile ? "relative z-auto h-full w-full border-l-0" : "fixed right-0 top-0 z-40 h-screen"}`} style={style} aria-label={ariaLabel}>
        <div className="flex items-center justify-between border-b border-[hsl(var(--obsidian-border))] p-3 sm:p-4">
          <div><h2 className="text-lg font-semibold">{t("nav.history")}</h2><p className="text-xs text-muted-foreground">{subtitle === "Owner-only GitHub activity" ? t("workspace.historySubtitle") : subtitle}</p></div>
          <Button variant="ghost" size="icon" className="workspace-touch-control h-8 w-8" onClick={onClose} aria-label={t("common.close")}><X className="h-4 w-4" /></Button>
        </div>
        <div className="safe-area-bottom min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4">
          {unpublishedCount > 0 && (
            <div className="mb-4 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3">
              <div className="flex items-center gap-2 font-medium"><Clock3 className="h-4 w-4 text-amber-500" />{t("workspace.unpublished")}</div>
              <p className="mt-1 text-xs text-muted-foreground">{t("workspace.stagedChanges", { count: unpublishedCount })}</p>
            </div>
          )}
          {loading && <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("workspace.loadingHistory")}</div>}
          {!loading && error && (
            <div role="alert" aria-live="assertive" className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">
              <div className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 flex-none text-destructive" /><p>{error}</p></div>
              <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}><RefreshCw className="mr-2 h-3.5 w-3.5" />{t("common.retry")}</Button>
            </div>
          )}
          {!loading && !error && commits.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">{t("workspace.noCommits")}</p>}
          {!loading && !error && commits.map((commit, index) => {
            const content = <>
              {index < commits.length - 1 && <span className="absolute bottom-0 left-[7px] top-5 w-px bg-[hsl(var(--obsidian-border))]" />}
              <GitCommitHorizontal className="relative z-10 mt-0.5 h-4 w-4 flex-none text-[hsl(var(--obsidian-accent))]" />
              <span className="min-w-0 flex-1"><span className="block text-sm font-medium group-hover:text-[hsl(var(--obsidian-accent))]">{commit.message}</span><span className="mt-1 block text-xs text-muted-foreground">{commit.author} · {commit.authoredAt ? dateTime(commit.authoredAt) : t("common.unknownTime")}</span><code className="mt-1 block text-xs text-muted-foreground">{commit.shortSha}</code></span>
            </>;
            const className = "group relative flex gap-3 pb-5 text-left last:pb-0";
            return commit.url
              ? <a key={commit.sha} href={commit.url} target="_blank" rel="noopener noreferrer" className={className}>{content}</a>
              : <div key={commit.sha} className={className}>{content}</div>;
          })}
        </div>
      </aside>
    </>
  );
  if (!mobile) return panel;
  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent side="right" className="h-dvh w-full max-w-none p-0 [&>button]:hidden" aria-describedby="workspace-history-description">
        <SheetTitle className="sr-only">{t("nav.history")}</SheetTitle>
        <SheetDescription id="workspace-history-description" className="sr-only">{t("workspace.historyPanelDescription")}</SheetDescription>
        {panel}
      </SheetContent>
    </Sheet>
  );
}
