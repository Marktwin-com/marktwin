import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, ListTree } from "lucide-react";

import type { WorkspaceNote } from "@/lib/cabinet-files";
import { parseMarkdownOutline, type MarkdownOutlineItem } from "@/lib/markdown-presentation";
import { isMarkdownPath } from "@/lib/text-files";
import { useI18n } from "@/contexts/i18n-context";

interface WorkspaceOutlineProps {
  note?: WorkspaceNote;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onSelect: (line: number) => void;
}

interface OutlineNode extends MarkdownOutlineItem {
  children: OutlineNode[];
}

function outlineTree(items: MarkdownOutlineItem[]) {
  const roots: OutlineNode[] = [];
  const stack: OutlineNode[] = [];
  for (const item of items) {
    const node: OutlineNode = { ...item, children: [] };
    while (stack.length > 0 && stack[stack.length - 1].level >= node.level) stack.pop();
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(node);
    else roots.push(node);
    stack.push(node);
  }
  return roots;
}

interface OutlineBranchProps {
  node: OutlineNode;
  collapsedSections: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (line: number) => void;
  t: (key: string, values?: Record<string, string>) => string;
}

function OutlineBranch({ node, collapsedSections, onToggle, onSelect, t }: OutlineBranchProps) {
  const hasChildren = node.children.length > 0;
  const isCollapsed = collapsedSections.has(node.id);
  const sectionId = `workspace-outline-section-${node.id}`;

  return (
    <li>
      <div className="group flex min-w-0 items-center rounded-md transition-colors hover:bg-[hsl(var(--obsidian-accent)/0.1)]">
        {hasChildren ? (
          <button
            type="button"
            className="workspace-touch-control flex h-8 w-7 flex-none items-center justify-center rounded text-[hsl(var(--obsidian-text-muted))] hover:text-[hsl(var(--primary))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onToggle(node.id)}
            aria-expanded={!isCollapsed}
            aria-controls={sectionId}
            aria-label={t(isCollapsed ? "outline.expandSection" : "outline.collapseSection", { section: node.text })}
            title={t(isCollapsed ? "outline.expandSection" : "outline.collapseSection", { section: node.text })}
          >
            {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        ) : <span aria-hidden="true" className="w-7 flex-none" />}
        <button
          type="button"
          className="min-w-0 flex-1 truncate rounded px-1 py-1.5 text-left text-sm text-[hsl(var(--obsidian-text-muted))] group-hover:text-[hsl(var(--primary))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          style={{ paddingLeft: `${Math.max(4, (node.level - 1) * 12)}px` }}
          title={node.text}
          onClick={() => onSelect(node.line)}
        >
          {node.text}
        </button>
      </div>
      {hasChildren && !isCollapsed && (
        <ul id={sectionId} className="space-y-0.5 pl-1">
          {node.children.map((child) => (
            <OutlineBranch key={child.id} node={child} collapsedSections={collapsedSections} onToggle={onToggle} onSelect={onSelect} t={t} />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function WorkspaceOutline({ note, collapsed, onCollapsedChange, onSelect }: WorkspaceOutlineProps) {
  const { t } = useI18n();
  const markdownDocument = Boolean(note && note.fileType === "markdown" && isMarkdownPath(note.filename));
  const headings = markdownDocument && note ? parseMarkdownOutline(note.content) : [];
  const tree = useMemo(() => outlineTree(headings), [headings]);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => new Set());
  const unavailable = Boolean(note && !markdownDocument);

  useEffect(() => setCollapsedSections(new Set()), [note?.id]);

  const toggleSection = (id: string) => {
    setCollapsedSections((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label={t("outline.label")}>
      <button
        type="button"
        data-testid="workspace-outline-header"
        className="flex h-10 flex-none items-center gap-2 px-4 text-left text-sm font-semibold text-[hsl(var(--primary))] hover:bg-[hsl(var(--obsidian-accent)/0.1)]"
        onClick={() => onCollapsedChange(!collapsed)}
        aria-expanded={!collapsed}
      >
        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        <ListTree className="h-4 w-4" />
        {t("outline.title")}
      </button>
      {!collapsed && (
        <div className="workspace-outline-scroll min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-2 [scrollbar-gutter:stable]" data-testid="workspace-outline-scroll">
          {unavailable ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">{t("outline.markdownOnly")}</p>
          ) : headings.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">{t("outline.addHeading")}</p>
          ) : (
            <nav aria-label={t("outline.forFile", { filename: note?.filename || t("nav.document") })}>
              <ul className="space-y-0.5">
                {tree.map((node) => (
                  <OutlineBranch key={node.id} node={node} collapsedSections={collapsedSections} onToggle={toggleSection} onSelect={onSelect} t={t} />
                ))}
              </ul>
            </nav>
          )}
        </div>
      )}
    </section>
  );
}
