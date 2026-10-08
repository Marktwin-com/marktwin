import { useEffect, useMemo, useState, type ReactNode } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { AlertTriangle, CheckCircle2, Circle, FileDiff, GitMerge, HelpCircle, Loader2, PanelRightClose, PanelRightOpen, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  chooseMergeVersion,
  hasConflictMarkers,
  resolveMergeHunk,
  updateMergeLocal,
  updateMergeResult,
  validateMergePlan,
  type WorkspaceMergeItem,
  type WorkspaceMergePlan,
} from "@/lib/workspace-merge";
import { createLineDiff, lineDiffCounts } from "@/lib/line-diff";

interface MergeConflictResolverProps {
  plan: WorkspaceMergePlan;
  backupBranch?: string;
  backupWarning?: string;
  backupPending?: boolean;
  publishing: boolean;
  onPlanChange: (plan: WorkspaceMergePlan) => void;
  onCancel: () => void;
  onPublish: () => void;
}

function itemStatus(item: WorkspaceMergeItem) {
  if (item.resolution === "unresolved" || hasConflictMarkers(item.resultContent)) return "conflict" as const;
  if (item.changedBy === "both" || item.resolution !== "auto") return "resolved" as const;
  return "clean" as const;
}

function itemDetail(item: WorkspaceMergeItem, status: ReturnType<typeof itemStatus>) {
  if (item.conflictKind === "path-collision") {
    const source = item.changedBy === "local" ? "Marktwin version" : item.changedBy === "incoming" ? "GitHub version" : "both versions";
    return `${status} · Path collision · ${source}`;
  }
  return `${status}${item.conflictKind ? ` · ${item.conflictKind.replace("-", " ")}` : ""}`;
}

function sourceLabel(content: string | null) {
  return content === null ? "(file deleted)" : content;
}

type PaneTone = "base" | "marktwin" | "github" | "result";
type MergeColumn = PaneTone;

const mergeColumnOptions: Array<{ id: MergeColumn; label: string }> = [
  { id: "base", label: "Base state" },
  { id: "marktwin", label: "Marktwin" },
  { id: "github", label: "Github state" },
  { id: "result", label: "Result" },
];

const paneToneClasses: Record<PaneTone, string> = {
  base: "border-slate-400/50 bg-slate-500/5",
  marktwin: "border-sky-500/50 bg-sky-500/5",
  github: "border-violet-500/50 bg-violet-500/5",
  result: "border-emerald-500/50 bg-emerald-500/5",
};

const paneHeaderClasses: Record<PaneTone, string> = {
  base: "bg-slate-500/10 text-foreground",
  marktwin: "bg-sky-500/10 text-foreground",
  github: "bg-violet-500/10 text-foreground",
  result: "bg-emerald-500/10 text-foreground",
};

const paneTitleClasses = "text-sm font-bold uppercase tracking-wide";

function PaneHeader({ label, tone, action, onToggleCollapse }: { label: string; tone: PaneTone; action?: ReactNode; onToggleCollapse: () => void }) {
  return (
    <div className={`flex min-h-[3.5rem] items-center justify-between gap-2 border-b border-inherit px-3 py-2 ${paneHeaderClasses[tone]}`}>
      <h3 className={paneTitleClasses}>{label}</h3>
      <div className="flex shrink-0 items-center gap-1">
        {action}
        <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-md text-current/65 transition-colors duration-200 hover:bg-background/60 hover:text-current focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring" onClick={onToggleCollapse} aria-label={`Collapse ${label} column`} title={`Collapse ${label} column`}>
          <PanelRightClose className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function CollapsedColumn({ label, onToggle, visible }: { label: string; onToggle: () => void; visible: boolean }) {
  return (
    <button type="button" className={`group absolute inset-0 z-10 flex min-w-0 flex-col items-center gap-3 overflow-hidden rounded-md p-2 text-current transition-[background-color,box-shadow,opacity,transform] duration-300 ease-out hover:bg-background/55 hover:shadow-xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none ${visible ? "opacity-100" : "pointer-events-none scale-[0.98] opacity-0"}`} onClick={onToggle} aria-label={`Expand ${label} column`} title={`Expand ${label} column`} aria-hidden={!visible} tabIndex={visible ? 0 : -1}>
      <PanelRightOpen className="mt-1 h-4 w-4 shrink-0 opacity-65 transition-opacity duration-200 group-hover:opacity-100" />
      <span className={`[writing-mode:vertical-rl] rotate-180 ${paneTitleClasses}`}>{label}</span>
    </button>
  );
}

function PaneShell({ label, tone, collapsed, onToggleCollapse, children }: { label: string; tone: PaneTone; collapsed: boolean; onToggleCollapse: () => void; children: ReactNode }) {
  return (
    <section className={`relative h-full min-h-0 min-w-0 overflow-hidden rounded-md border ${paneToneClasses[tone]}`}>
      <div className={`flex h-full min-h-0 min-w-0 flex-col transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none ${collapsed ? "pointer-events-none scale-[0.985] opacity-0" : "opacity-100"}`}>
        {children}
      </div>
      <CollapsedColumn label={label} onToggle={onToggleCollapse} visible={collapsed} />
    </section>
  );
}

function ChangeCounts({ before, after }: { before: string | null; after: string | null }) {
  const counts = lineDiffCounts(createLineDiff(before, after));
  return (
    <div className="flex shrink-0 items-center gap-1 font-mono text-[11px]" aria-label={`${counts.added} added lines and ${counts.removed} removed lines`}>
      <span className="rounded border border-emerald-500/30 bg-emerald-500/15 px-1.5 py-0.5 font-semibold text-foreground">+{counts.added}</span>
      <span className="rounded border border-red-500/30 bg-red-500/15 px-1.5 py-0.5 font-semibold text-foreground">−{counts.removed}</span>
    </div>
  );
}

function LineDiff({ before, after }: { before: string | null; after: string | null }) {
  const diff = useMemo(() => createLineDiff(before, after), [before, after]);
  if (diff.length === 0) return <div className="flex min-h-44 items-center justify-center p-4 text-sm text-muted-foreground">Empty file</div>;
  return (
    <div className="min-h-44 flex-1 overflow-auto py-2 font-mono text-sm leading-6" aria-label="Line changes compared with base state">
      {diff.map((entry, index) => (
        <div
          key={`${entry.kind}-${entry.oldLine || 0}-${entry.newLine || 0}-${index}`}
          className={`grid min-w-max grid-cols-[1.5rem_3rem_3rem_minmax(12rem,1fr)] px-1 text-foreground ${entry.kind === "added" ? "bg-emerald-500/15" : entry.kind === "removed" ? "bg-red-500/15" : ""}`}
        >
          <span className={`select-none text-center font-bold ${entry.kind === "context" ? "text-muted-foreground" : "text-foreground"}`}>
            {entry.kind === "added" ? "+" : entry.kind === "removed" ? "−" : ""}
          </span>
          <span className="select-none border-r border-border/50 pr-1 text-right text-muted-foreground">{entry.oldLine || ""}</span>
          <span className="select-none border-r border-border/50 pr-1 text-right text-muted-foreground">{entry.newLine || ""}</span>
          <span className="whitespace-pre-wrap break-words px-2">{entry.text || " "}</span>
        </div>
      ))}
    </div>
  );
}

function ReadOnlyPane({ label, tone, value, baseValue, showDiff = false, collapsed, onToggleCollapse }: { label: string; tone: PaneTone; value: string | null; baseValue?: string | null; showDiff?: boolean; collapsed: boolean; onToggleCollapse: () => void }) {
  return (
    <PaneShell label={label} tone={tone} collapsed={collapsed} onToggleCollapse={onToggleCollapse}>
      <PaneHeader label={label} tone={tone} action={showDiff ? <ChangeCounts before={baseValue ?? null} after={value} /> : undefined} onToggleCollapse={onToggleCollapse} />
      {showDiff ? <LineDiff before={baseValue ?? null} after={value} /> : <pre className="min-h-44 flex-1 overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-sm leading-6">{sourceLabel(value)}</pre>}
    </PaneShell>
  );
}

function EditablePane({ label, tone, value, baseValue, fileType, publishing, onChange, collapsed, onToggleCollapse }: { label: string; tone: PaneTone; value: string | null; baseValue: string | null; fileType: WorkspaceMergeItem["fileType"]; publishing: boolean; onChange: (value: string) => void; collapsed: boolean; onToggleCollapse: () => void }) {
  const [mode, setMode] = useState<"edit" | "changes">("edit");
  const showingChanges = mode === "changes";
  const viewToggleLabel = showingChanges ? "Switch to edit view" : "Show line changes";
  const action = (
    <div className="flex shrink-0 items-center gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-current/20 bg-background/70 text-current/75 transition-colors duration-200 hover:bg-background hover:text-current focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
            onClick={() => setMode(showingChanges ? "edit" : "changes")}
            aria-label={viewToggleLabel}
            aria-pressed={showingChanges}
            title={viewToggleLabel}
          >
            {showingChanges ? <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> : <FileDiff className="h-3.5 w-3.5" aria-hidden="true" />}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">{viewToggleLabel}</TooltipContent>
      </Tooltip>
      <ChangeCounts before={baseValue} after={value} />
    </div>
  );
  return (
    <PaneShell label={label} tone={tone} collapsed={collapsed} onToggleCollapse={onToggleCollapse}>
      <PaneHeader label={label} tone={tone} action={action} onToggleCollapse={onToggleCollapse} />
      {value === null ? (
        <div className="flex min-h-44 flex-1 items-center justify-center p-4 text-sm leading-6 text-muted-foreground">This version deletes the file.</div>
      ) : mode === "changes" ? (
        <LineDiff before={baseValue} after={value} />
      ) : (
        <CodeMirror
          value={value}
          extensions={[
            ...(fileType === "markdown" ? [markdown()] : []),
            EditorState.lineSeparator.of(value.includes("\r\n") ? "\r\n" : "\n"),
          ]}
          onChange={onChange}
          editable={!publishing}
          className="min-h-0 flex-1 overflow-auto text-sm"
          basicSetup={{ lineNumbers: true, foldGutter: false }}
        />
      )}
    </PaneShell>
  );
}

export default function MergeConflictResolver({
  plan,
  backupBranch,
  backupWarning,
  backupPending = false,
  publishing,
  onPlanChange,
  onCancel,
  onPublish,
}: MergeConflictResolverProps) {
  const [selectedId, setSelectedId] = useState(plan.items[0]?.id || "");
  const [collapsedColumns, setCollapsedColumns] = useState<Record<MergeColumn, boolean>>({ base: false, marktwin: false, github: false, result: false });
  const selected = plan.items.find((item) => item.id === selectedId) || plan.items[0];
  const errors = useMemo(() => validateMergePlan(plan), [plan]);
  const conflictCount = plan.items.filter((item) => itemStatus(item) === "conflict").length;

  useEffect(() => {
    if (!plan.items.some((item) => item.id === selectedId)) setSelectedId(plan.items[0]?.id || "");
  }, [plan.items, selectedId]);

  const replaceItem = (nextItem: WorkspaceMergeItem) => {
    onPlanChange({ ...plan, items: plan.items.map((item) => item.id === nextItem.id ? nextItem : item) });
  };

  const choose = (choice: "local" | "incoming" | "both") => {
    if (selected) replaceItem(chooseMergeVersion(selected, choice));
  };

  const toggleColumn = (column: MergeColumn) => {
    setCollapsedColumns((current) => {
      const expandedCount = Object.values(current).filter((collapsed) => !collapsed).length;
      if (!current[column] && expandedCount === 1) return current;
      return { ...current, [column]: !current[column] };
    });
  };

  const updateResultPath = (resultPath: string) => {
    if (!selected) return;
    const changed = plan.items.map((item) => item.id === selected.id ? { ...item, resultPath } : item);
    const passthroughPaths = new Set(plan.passthroughFiles.map((file) => file.path.toLowerCase()));
    const nextItems = changed.map((item) => {
      if (item.conflictKind !== "path-collision" || item.resultContent === null) return item;
      const key = item.resultPath.toLowerCase();
      const collisions = changed.filter((candidate) => candidate.resultContent !== null && candidate.resultPath.toLowerCase() === key).length;
      if (collisions === 1 && !passthroughPaths.has(key)) {
        return { ...item, resolution: hasConflictMarkers(item.resultContent) ? "unresolved" as const : "manual" as const };
      }
      return { ...item, resolution: "unresolved" as const };
    });
    onPlanChange({ ...plan, items: nextItems });
  };

  const marktwinEditor = selected ? (
    <EditablePane
      key={`marktwin-${selected.id}`}
      label="Marktwin"
      tone="marktwin"
      value={selected.localContent}
      baseValue={selected.baseContent}
      fileType={selected.fileType}
      publishing={publishing}
      collapsed={collapsedColumns.marktwin}
      onToggleCollapse={() => toggleColumn("marktwin")}
      onChange={(value) => replaceItem(updateMergeLocal(selected, value))}
    />
  ) : null;

  const resultEditor = selected ? (
    <EditablePane
      key={`result-${selected.id}`}
      label="Result"
      tone="result"
      value={selected.resultContent}
      baseValue={selected.baseContent}
      fileType={selected.fileType}
      publishing={publishing}
      collapsed={collapsedColumns.result}
      onToggleCollapse={() => toggleColumn("result")}
      onChange={(value) => replaceItem(updateMergeResult(selected, value))}
    />
  ) : null;

  return (
    <Dialog modal={false} open onOpenChange={(open) => { if (!open && !publishing) onCancel(); }}>
      <DialogContent hideOverlay className="!fixed !bottom-4 !left-auto !right-4 !top-4 !flex !h-auto !w-[min(96vw,72rem)] !max-w-none !translate-x-0 !translate-y-0 !flex-col !gap-0 !overflow-hidden border-border bg-background !p-0 sm:max-w-none">
        <DialogHeader className="shrink-0 border-b border-border px-4 py-2 pr-12">
          <DialogTitle className="flex items-center gap-2"><GitMerge className="h-5 w-5" />Review and resolve changes
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="ml-1 inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors duration-200 hover:bg-accent/15 hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none" aria-label="How to review changes and read line changes">
                  <HelpCircle className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="start" className="max-w-[22rem] text-xs leading-5">
                <p className="font-semibold">How to review changes</p>
                <p><strong>1 · Base state:</strong> Where both versions started.</p>
                <p><strong>2 · Marktwin:</strong> Your edits.</p>
                <p><strong>2 · Github state:</strong> Incoming edits.</p>
                <p><strong>3 · Result:</strong> What will be published.</p>
                <p className="mt-2 font-semibold">How to read line changes</p>
                <p><span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">+ Added</span> lines were added compared with Base state.</p>
                <p><span className="font-mono font-semibold text-red-600 dark:text-red-400">− Removed</span> lines were removed compared with Base state.</p>
                <p>Uncolored lines are unchanged from Base state.</p>
              </TooltipContent>
            </Tooltip>
          </DialogTitle>
          <DialogDescription className="sr-only">Review and resolve changes before publishing.</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <aside className="max-h-52 shrink-0 overflow-auto border-b border-border bg-muted/20 lg:max-h-none lg:w-80 lg:border-b-0 lg:border-r">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/95 px-3 py-2.5 text-sm">
              <span className="font-semibold">Files</span>
              <span className={conflictCount ? "text-destructive" : "text-muted-foreground"}>{conflictCount} unresolved</span>
            </div>
            <div className="p-2">
              {plan.items.map((item) => {
                const status = itemStatus(item);
                const isSelected = selected?.id === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className={`mb-1.5 flex w-full items-start gap-2 rounded-md px-3 py-2.5 text-left text-sm transition-colors ${isSelected ? "bg-primary text-primary-foreground shadow-xs ring-1 ring-primary/40" : "hover:bg-accent/10"}`}
                  >
                    {status === "conflict" ? <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${isSelected ? "text-primary-foreground" : "text-destructive"}`} /> : status === "resolved" ? <CheckCircle2 className={`mt-0.5 h-4 w-4 shrink-0 ${isSelected ? "text-primary-foreground" : "text-emerald-500"}`} /> : <Circle className={`mt-0.5 h-4 w-4 shrink-0 ${isSelected ? "text-primary-foreground" : "text-muted-foreground"}`} />}
                    <span className="min-w-0"><span className="block break-all font-medium">{item.resultPath}</span><span className={isSelected ? "capitalize text-primary-foreground/80" : "capitalize text-muted-foreground"}>{itemDetail(item, status)}</span></span>
                  </button>
                );
              })}
            </div>
          </aside>

          <main className="min-h-0 flex-1 overflow-auto p-2 lg:p-3">
            {selected && (
              <div className="flex min-h-full flex-col gap-2">
                <div className="hidden min-h-[28rem] flex-1 gap-2 transition-[grid-template-columns] duration-500 ease-out motion-reduce:transition-none lg:grid" style={{ gridTemplateColumns: mergeColumnOptions.map(({ id }) => collapsedColumns[id] ? "3rem" : "minmax(0, 1fr)").join(" ") }}>
                  <ReadOnlyPane label="Base state" tone="base" value={selected.baseContent} collapsed={collapsedColumns.base} onToggleCollapse={() => toggleColumn("base")} />
                  {marktwinEditor}
                  <ReadOnlyPane label="Github state" tone="github" value={selected.incomingContent} baseValue={selected.baseContent} showDiff collapsed={collapsedColumns.github} onToggleCollapse={() => toggleColumn("github")} />
                  {resultEditor}
                </div>
                <Tabs defaultValue="result" className="lg:hidden">
                  <TabsList className="grid w-full grid-cols-4"><TabsTrigger value="base">Base state</TabsTrigger><TabsTrigger value="marktwin">Marktwin</TabsTrigger><TabsTrigger value="github">Github state</TabsTrigger><TabsTrigger value="result">Result</TabsTrigger></TabsList>
                  <TabsContent value="base"><ReadOnlyPane label="Base state" tone="base" value={selected.baseContent} collapsed={collapsedColumns.base} onToggleCollapse={() => toggleColumn("base")} /></TabsContent>
                  <TabsContent value="marktwin">{marktwinEditor}</TabsContent>
                  <TabsContent value="github"><ReadOnlyPane label="Github state" tone="github" value={selected.incomingContent} baseValue={selected.baseContent} showDiff collapsed={collapsedColumns.github} onToggleCollapse={() => toggleColumn("github")} /></TabsContent>
                  <TabsContent value="result">{resultEditor}</TabsContent>
                </Tabs>
                <div className="flex flex-col gap-3 rounded-md border border-border bg-muted/20 p-3 xl:flex-row xl:items-end">
                  <div className="min-w-0 flex-1 space-y-1">
                    <Label htmlFor="merge-result-path">Result path</Label>
                    <Input
                      id="merge-result-path"
                      value={selected.resultPath}
                      disabled={publishing}
                      onChange={(event) => updateResultPath(event.target.value)}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => choose("local")} disabled={publishing}>{selected.localContent === null ? "Use Marktwin deletion" : "Use Marktwin in Result"}</Button>
                    <Button size="sm" variant="outline" onClick={() => choose("incoming")} disabled={publishing}>{selected.incomingContent === null ? "Use GitHub deletion" : "Use GitHub in Result"}</Button>
                    {selected.fileType === "markdown" && selected.localContent !== null && selected.incomingContent !== null && <Button size="sm" variant="outline" onClick={() => choose("both")} disabled={publishing}>Keep both in Result</Button>}
                  </div>
                </div>
                {selected.hunks.length > 0 && (
                  <div className="space-y-2">
                    {selected.hunks.filter((hunk) => selected.resultContent?.includes(hunk.markerStart)).map((hunk, index) => (
                      <div key={hunk.id} className="flex flex-col gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 sm:flex-row sm:items-center sm:justify-between">
                        <span className="text-sm font-medium">Conflict {index + 1}</span>
                        <div className="flex flex-wrap gap-2">
                          {(["local", "incoming", "both"] as const).map((choice) => <Button key={choice} size="sm" variant="outline" onClick={() => replaceItem(resolveMergeHunk(selected, hunk.id, choice))} disabled={publishing}>{choice === "local" ? "Use Marktwin" : choice === "incoming" ? "Use GitHub" : "Keep both"}</Button>)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </main>
        </div>

        <div className="border-t border-border bg-background px-5 py-3">
          <DialogFooter className="items-center gap-3 sm:justify-between sm:space-x-0">
            {(backupPending || backupBranch || backupWarning) && (
              <div className={`min-w-0 flex-1 rounded-md border px-3 py-2 text-xs ${backupWarning ? "border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-200" : "border-border bg-muted/40 text-muted-foreground"}`} title={backupPending ? "Creating a temporary backup before publishing." : backupWarning || `Temporary backup created: ${backupBranch}. It will be removed after a later successful sync.`}>
                <span className="block truncate">{backupPending ? "Creating a temporary backup before publishing…" : backupWarning || <>Temporary backup created: <code>{backupBranch}</code>. It will be removed after a later successful sync.</>}</span>
              </div>
            )}
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="outline" onClick={onCancel} disabled={publishing}>Cancel</Button>
              <Button onClick={onPublish} disabled={publishing || backupPending || errors.length > 0}>{(publishing || backupPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Publish merged checkpoint</Button>
            </div>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
