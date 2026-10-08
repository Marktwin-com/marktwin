import { syntaxTree } from "@codemirror/language";
import { EditorSelection, StateEffect, StateField, type EditorState, type Extension, type Range, type RangeSet, type Transaction } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import DOMPurify from "dompurify";
import type { AppearanceTheme } from "@shared/appearance-themes";
import { renderKatex, renderMarkdownHtml, renderMermaidSvg } from "./markdown-presentation";

export interface LiveMarkdownConfig {
  readOnly?: boolean;
  theme: AppearanceTheme;
  resolveImage?: (source: string) => Promise<string | null>;
  tableAddColumnLabel?: string;
  tableAddRowLabel?: string;
  tableDeleteLabel?: string;
}

const setLiveEditorFocus = StateEffect.define<boolean>();
const setLiveEditorActiveBlock = StateEffect.define<{ from: number; to: number } | null>();

function localSelectionIntersects(state: EditorState, from: number, to: number, focused: boolean) {
  if (!focused) return false;
  return state.selection.ranges.some((range) => range.empty
    ? range.head >= from && range.head <= to
    : range.from < to && range.to > from);
}

function focusSource(view: EditorView, from: number) {
  view.focus();
  view.dispatch({
    selection: { anchor: from },
    effects: [setLiveEditorActiveBlock.of(null), EditorView.scrollIntoView(from, { y: "center" })],
  });
}

function focusSourceRange(view: EditorView, from: number, to = from, activeBlock?: { from: number; to: number }) {
  const anchor = Math.max(0, Math.min(view.state.doc.length, from));
  const head = Math.max(anchor, Math.min(view.state.doc.length, to));
  view.focus();
  // Set the complete selection in the same transaction. A deferred second
  // dispatch can run after the first keystroke and move the caret back to the
  // old range, which is especially visible when editing a table cell.
  view.dispatch({
    selection: { anchor, head },
    effects: [
      setLiveEditorFocus.of(true),
      setLiveEditorActiveBlock.of(activeBlock ?? null),
      EditorView.scrollIntoView(anchor, { y: "center" }),
    ],
  });
}

function mapTextOffset(offset: number, before: string, after: string) {
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < before.length - prefix
    && suffix < after.length - prefix
    && before[before.length - suffix - 1] === after[after.length - suffix - 1]
  ) suffix += 1;
  if (offset <= prefix) return offset;
  if (offset >= before.length - suffix) return Math.max(prefix, after.length - (before.length - offset));
  return prefix;
}

function activateSource(event: Event, view: EditorView, from: number) {
  event.preventDefault();
  event.stopPropagation();
  focusSource(view, from);
}

function currentWidgetPosition(view: EditorView, element: HTMLElement, fallback: number) {
  try {
    const position = view.posAtDOM(element);
    // CodeMirror can resolve a replaced block widget to the start of the
    // document when the widget itself is the event target. Keep the source
    // position carried by the widget in that case.
    return position === 0 && fallback > 0 ? fallback : position;
  } catch {
    return fallback;
  }
}

function makeWidgetSourceActivatable(
  element: HTMLElement,
  view: EditorView,
  fallback: number,
  readOnly: boolean,
  label: string,
  positionElement = element,
) {
  if (readOnly) {
    element.setAttribute("aria-label", label);
    return;
  }
  element.tabIndex = 0;
  element.setAttribute("role", "button");
  element.setAttribute("aria-label", `${label}. Activate to edit Markdown source.`);
  element.addEventListener("click", (event) => activateSource(event, view, currentWidgetPosition(view, positionElement, fallback)));
  element.addEventListener("keydown", (event) => {
    const key = (event as KeyboardEvent).key;
    if (key === "Enter" || key === " ") activateSource(event, view, currentWidgetPosition(view, positionElement, fallback));
  });
}

function requestEditorMeasure(view: EditorView) {
  requestAnimationFrame(() => view.requestMeasure());
}

class HtmlWidget extends WidgetType {
  constructor(private html: string, private className: string, private sourceFrom: number, private label: string, private readOnly = false) { super(); }
  eq(other: HtmlWidget) { return this.html === other.html && this.className === other.className && this.sourceFrom === other.sourceFrom && this.readOnly === other.readOnly; }
  updateDOM(element: HTMLElement, view: EditorView, previous: this) {
    if (this.className !== previous.className || this.sourceFrom !== previous.sourceFrom || this.readOnly !== previous.readOnly) return false;
    const nextIsError = this.html.includes("marktwin-render-error");
    const previousWasValid = !previous.html.includes("marktwin-render-error");
    if (nextIsError && previousWasValid) {
      element.classList.add("marktwin-live-widget-stale");
      element.dataset.widgetStatus = "Latest edit is not renderable yet";
      element.setAttribute("aria-busy", "true");
      return true;
    }
    element.innerHTML = DOMPurify.sanitize(this.html, { USE_PROFILES: { html: true, mathMl: true, svg: true } });
    element.classList.remove("marktwin-live-widget-stale");
    delete element.dataset.widgetStatus;
    element.removeAttribute("aria-busy");
    requestEditorMeasure(view);
    return true;
  }
  toDOM(view: EditorView) {
    const element = document.createElement(this.className.includes("inline") ? "span" : "div");
    element.className = `marktwin-live-widget ${this.className}`;
    element.dataset.widgetLabel = this.label;
    element.innerHTML = DOMPurify.sanitize(this.html, { USE_PROFILES: { html: true, mathMl: true, svg: true } });
    requestEditorMeasure(view);
    makeWidgetSourceActivatable(element, view, this.sourceFrom, this.readOnly, this.label);
    return element;
  }
  ignoreEvent() { return true; }
}

class MermaidWidget extends WidgetType {
  constructor(private source: string, private sourceFrom: number, private theme: AppearanceTheme, private readOnly = false) { super(); }
  eq(other: MermaidWidget) { return this.source === other.source && this.sourceFrom === other.sourceFrom && this.theme === other.theme && this.readOnly === other.readOnly; }
  private render(element: HTMLElement, view: EditorView, delay: number, retainPrevious: boolean) {
    const version = String(Number(element.dataset.renderVersion || "0") + 1);
    element.dataset.renderVersion = version;
    element.classList.add("marktwin-live-widget-updating");
    element.setAttribute("aria-busy", "true");
    window.setTimeout(() => {
      if (!element.isConnected || element.dataset.renderVersion !== version) return;
      void renderMermaidSvg(this.source, this.theme).then((svg) => {
        if (!element.isConnected || element.dataset.renderVersion !== version) return;
        element.innerHTML = svg;
        element.classList.remove("marktwin-live-widget-updating", "marktwin-live-widget-stale", "marktwin-render-error");
        delete element.dataset.widgetStatus;
        element.removeAttribute("aria-busy");
        requestEditorMeasure(view);
      }).catch((error) => {
        if (!element.isConnected || element.dataset.renderVersion !== version) return;
        const message = error instanceof Error ? error.message : "Mermaid could not render this diagram.";
        element.classList.remove("marktwin-live-widget-updating");
        element.removeAttribute("aria-busy");
        if (retainPrevious && element.querySelector("svg")) {
          element.classList.add("marktwin-live-widget-stale");
          element.dataset.widgetStatus = "Latest diagram edit is not renderable yet";
          element.title = message;
        } else {
          element.classList.add("marktwin-render-error");
          element.textContent = message;
        }
        requestEditorMeasure(view);
      });
    }, delay);
  }
  toDOM(view: EditorView) {
    const element = document.createElement("div");
    element.className = "marktwin-live-widget marktwin-live-mermaid";
    element.dataset.widgetLabel = "Diagram";
    element.textContent = "Rendering diagram…";
    makeWidgetSourceActivatable(element, view, this.sourceFrom, this.readOnly, "Mermaid diagram");
    this.render(element, view, 0, false);
    return element;
  }
  updateDOM(element: HTMLElement, view: EditorView, previous: this) {
    if (this.sourceFrom !== previous.sourceFrom || this.theme !== previous.theme || this.readOnly !== previous.readOnly) return false;
    this.render(element, view, 150, true);
    return true;
  }
  ignoreEvent() { return true; }
}

class MarkdownTableWidget extends WidgetType {
  constructor(
    private source: string,
    private sourceFrom: number,
    private readOnly = false,
    private addColumnLabel = "Add column",
    private addRowLabel = "Add row",
    private deleteLabel = "Delete table",
  ) { super(); }
  eq(other: MarkdownTableWidget) {
    return this.source === other.source
      && this.sourceFrom === other.sourceFrom
      && this.readOnly === other.readOnly
      && this.addColumnLabel === other.addColumnLabel
      && this.addRowLabel === other.addRowLabel
      && this.deleteLabel === other.deleteLabel;
  }
  private render(element: HTMLElement, view: EditorView) {
    const tableWrap = element.querySelector<HTMLElement>(".marktwin-table-wrap");
    if (tableWrap) tableWrap.innerHTML = renderMarkdownHtml(this.source, `live-table:${this.sourceFrom}`);
    element.classList.remove("marktwin-live-widget-updating");
    element.removeAttribute("aria-busy");
    requestEditorMeasure(view);
  }
  private sourceRange(view: EditorView) {
    const startLine = view.state.doc.lineAt(Math.min(this.sourceFrom, view.state.doc.length));
    const sourceLineCount = this.source.split(/\r?\n/).length;
    const endLineNumber = startLine.number + sourceLineCount - 1;
    if (endLineNumber > view.state.doc.lines) return null;
    return { from: startLine.from, to: view.state.doc.line(endLineNumber).to };
  }
  private updateSource(view: EditorView, source: string) {
    const range = this.sourceRange(view);
    if (!range) return;
    const previousSelection = view.state.selection.ranges;
    const previousScrollTop = view.scrollDOM.scrollTop;
    const previousScrollLeft = view.scrollDOM.scrollLeft;
    const transaction = view.state.update({ changes: { from: range.from, to: range.to, insert: source } });
    const mappedSelection = transaction.newSelection.ranges.map((selection, index) => {
      const previous = previousSelection[index];
      if (!previous || previous.from < range.from || previous.to > range.to) return selection;
      return EditorSelection.range(
        range.from + mapTextOffset(previous.anchor - range.from, this.source, source),
        range.from + mapTextOffset(previous.head - range.from, this.source, source),
      );
    });
    view.dispatch(transaction);
    view.dispatch({ selection: EditorSelection.create(mappedSelection, transaction.newSelection.mainIndex) });
    view.focus();
    window.requestAnimationFrame(() => {
      if (!view.dom.isConnected) return;
      view.scrollDOM.scrollTop = previousScrollTop;
      view.scrollDOM.scrollLeft = previousScrollLeft;
    });
  }
  private addColumn(view: EditorView) {
    this.updateSource(view, appendMarkdownTableColumn(this.source, view.state.lineBreak));
  }
  private addRow(view: EditorView) {
    this.updateSource(view, appendMarkdownTableRow(this.source, view.state.lineBreak));
  }
  private deleteTable(view: EditorView) {
    this.updateSource(view, "");
  }
  private activateCell(event: Event, view: EditorView, sourceFrom: number, sourceTo: number) {
    event.preventDefault();
    event.stopPropagation();
    focusSourceRange(view, sourceFrom, sourceTo, this.sourceRange(view) ?? undefined);
  }
  private annotateCells(tableWrap: HTMLElement) {
    const lines = this.source.split(/\r?\n/);
    const lineSeparatorLength = this.source.includes("\r\n") ? 2 : 1;
    const sourceRows = [0, ...lines.map((_line, index) => index).filter((index) => index >= 2)];
    const rows = Array.from(tableWrap.querySelectorAll("tr"));
    rows.forEach((row, rowIndex) => {
      const sourceLine = lines[sourceRows[rowIndex]];
      if (sourceLine === undefined) return;
      const lineFrom = this.sourceFrom + lines.slice(0, sourceRows[rowIndex]).reduce((total, line) => total + line.length + lineSeparatorLength, 0);
      const ranges = tableCellSourceRanges(sourceLine, lineFrom);
      Array.from(row.querySelectorAll("th,td")).forEach((cell, cellIndex) => {
        const range = ranges[cellIndex];
        if (!range) return;
        (cell as HTMLElement).dataset.sourceFrom = String(range.from);
        (cell as HTMLElement).dataset.sourceTo = String(range.to);
      });
    });
  }
  private addControls(element: HTMLElement, view: EditorView) {
    if (this.readOnly) return;
    const controls = document.createElement("div");
    controls.className = "marktwin-table-add-controls";
    const createButton = (className: string, label: string, action: () => void) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `marktwin-table-add-button ${className}`;
      button.textContent = "+";
      button.setAttribute("aria-label", label);
      button.title = label;
      button.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        action();
      });
      return button;
    };
    controls.append(
      createButton("marktwin-table-add-column", this.addColumnLabel, () => this.addColumn(view)),
      createButton("marktwin-table-add-row", this.addRowLabel, () => this.addRow(view)),
      createButton("marktwin-table-delete", this.deleteLabel, () => this.deleteTable(view)),
    );
    element.append(controls);
  }
  toDOM(view: EditorView) {
    const element = document.createElement("div");
    element.className = "marktwin-live-widget marktwin-live-table";
    const tableWrap = document.createElement("div");
    tableWrap.className = "marktwin-table-wrap";
    element.append(tableWrap);
    this.render(element, view);
    this.annotateCells(tableWrap);
    if (!this.readOnly) {
      tableWrap.tabIndex = 0;
      tableWrap.setAttribute("role", "button");
      tableWrap.setAttribute("aria-label", "Markdown table. Activate to edit Markdown source.");
      tableWrap.addEventListener("click", (event) => {
        const cell = (event.target as HTMLElement).closest<HTMLElement>("th,td");
        const from = cell?.dataset.sourceFrom ? Number(cell.dataset.sourceFrom) : this.sourceRange(view)?.from ?? this.sourceFrom;
        const to = cell?.dataset.sourceTo ? Number(cell.dataset.sourceTo) : from;
        this.activateCell(event, view, from, to);
      });
      tableWrap.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        this.activateCell(event, view, this.sourceRange(view)?.from ?? this.sourceFrom, this.sourceRange(view)?.to ?? this.sourceFrom);
      });
    } else {
      tableWrap.setAttribute("aria-label", "Markdown table");
    }
    this.addControls(element, view);
    return element;
  }
  updateDOM(element: HTMLElement, view: EditorView, previous: this) {
    if (this.sourceFrom !== previous.sourceFrom || this.readOnly !== previous.readOnly) return false;
    element.classList.add("marktwin-live-widget-updating");
    element.setAttribute("aria-busy", "true");
    this.render(element, view);
    this.annotateCells(element.querySelector<HTMLElement>(".marktwin-table-wrap") || element);
    return true;
  }
  ignoreEvent() { return true; }
}

class MarkdownCodeWidget extends WidgetType {
  constructor(private source: string, private sourceFrom: number, private readOnly = false) { super(); }
  eq(other: MarkdownCodeWidget) { return this.source === other.source && this.sourceFrom === other.sourceFrom && this.readOnly === other.readOnly; }
  private render(element: HTMLElement, view: EditorView) {
    element.innerHTML = renderMarkdownHtml(this.source, `live-code:${this.sourceFrom}`);
    requestEditorMeasure(view);
  }
  toDOM(view: EditorView) {
    const element = document.createElement("div");
    element.className = "marktwin-live-widget marktwin-live-code";
    this.render(element, view);
    makeWidgetSourceActivatable(element, view, this.sourceFrom, this.readOnly, "Code block");
    return element;
  }
  updateDOM(element: HTMLElement, view: EditorView, previous: this) {
    if (this.sourceFrom !== previous.sourceFrom || this.readOnly !== previous.readOnly) return false;
    this.render(element, view);
    return true;
  }
  ignoreEvent() { return true; }
}

class ImageWidget extends WidgetType {
  constructor(
    private source: string,
    private alt: string,
    private sourceFrom: number,
    private width: number,
    private readOnly: boolean,
    private resolveImage?: (source: string) => Promise<string | null>,
  ) { super(); }
  eq(other: ImageWidget) {
    return this.source === other.source
      && this.alt === other.alt
      && this.sourceFrom === other.sourceFrom
      && this.width === other.width
      && this.readOnly === other.readOnly;
  }
  private resize(view: EditorView, width: number, sourceFrom: number) {
    if (this.readOnly) return;
    window.setTimeout(() => {
      if (!view.dom.isConnected) return;
      const line = view.state.doc.lineAt(Math.min(sourceFrom, view.state.doc.length));
      const parsed = parseStandaloneImage(line.text);
      if (!parsed || line.from !== sourceFrom) return;
      const trailing = line.text.match(/\s*$/)?.[0] ?? "";
      const body = line.text.slice(0, line.text.length - trailing.length);
      const withoutWidth = body.replace(/\s+\{width=\d{1,3}%\}$/i, "");
      const next = width >= 100 ? `${withoutWidth}${trailing}` : `${withoutWidth} {width=${width}%}${trailing}`;
      view.dispatch({ changes: { from: line.from, to: line.to, insert: next } });
    }, 0);
  }
  toDOM(view: EditorView) {
    const figure = document.createElement("figure");
    figure.className = "marktwin-live-widget marktwin-live-image";
    figure.setAttribute("role", "group");
    figure.dataset.widgetLabel = "Image";
    figure.setAttribute("aria-label", `${this.alt || "Image"}. Displayed at ${this.width} percent width.`);
    const image = document.createElement("img");
    image.alt = this.alt;
    image.loading = "lazy";
    image.style.width = `${this.width}%`;
    image.addEventListener("load", () => requestEditorMeasure(view));
    image.addEventListener("error", () => requestEditorMeasure(view));
    const direct = /^(data:image\/(?:png|jpeg|gif|webp|avif|bmp);|blob:)/i.test(this.source);
    if (direct) image.src = this.source;
    else if (this.resolveImage) {
      image.alt = this.alt || `Loading ${this.source}`;
      void this.resolveImage(this.source).then((url) => {
        if (!figure.isConnected) return;
        if (url) image.src = url;
        else {
          image.alt = `${this.alt || this.source}: unavailable`;
          requestEditorMeasure(view);
        }
      }).catch(() => {
        if (!figure.isConnected) return;
        image.alt = `${this.alt || this.source}: unavailable`;
        requestEditorMeasure(view);
      });
    } else {
      image.alt = `${this.alt || this.source}: owner connection required`;
    }
    makeWidgetSourceActivatable(image, view, this.sourceFrom, this.readOnly, this.alt || "Image", figure);
    const controls = document.createElement("div");
    controls.className = "marktwin-live-image-controls";
    controls.setAttribute("role", "toolbar");
    controls.setAttribute("aria-label", "Image size");
    const createButton = (label: string, text: string, nextWidth: number, disabled: boolean) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "marktwin-live-image-size-button";
      button.textContent = text;
      button.disabled = disabled || this.readOnly;
      button.setAttribute("aria-label", label);
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.resize(view, nextWidth, currentWidgetPosition(view, figure, this.sourceFrom));
      });
      return button;
    };
    controls.append(
      createButton("Make image smaller", "−", Math.max(20, this.width - 10), this.width <= 20),
    );
    const size = document.createElement("span");
    size.className = "marktwin-live-image-size";
    size.textContent = `${this.width}%`;
    size.setAttribute("aria-live", "polite");
    controls.append(size);
    controls.append(
      createButton("Make image larger", "+", Math.min(100, this.width + 10), this.width >= 100),
    );
    if (this.readOnly) figure.append(image);
    else figure.append(image, controls);
    return figure;
  }
  ignoreEvent() { return true; }
}

function parseStandaloneImage(text: string) {
  const match = text.match(/^\s*!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)(?:\s+\{width=(\d{1,3})%\})?\s*$/i);
  if (!match) return null;
  return {
    alt: match[1],
    source: match[2],
    width: Math.max(20, Math.min(100, Number(match[3] || 100))),
  };
}

class TaskWidget extends WidgetType {
  constructor(private checked: boolean, private sourceFrom: number, private readOnly: boolean) { super(); }
  eq(other: TaskWidget) { return this.checked === other.checked && this.sourceFrom === other.sourceFrom && this.readOnly === other.readOnly; }
  toDOM(view: EditorView) {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = this.checked;
    input.disabled = this.readOnly;
    input.className = "marktwin-live-task";
    input.setAttribute("aria-label", this.checked ? "Mark task incomplete" : "Mark task complete");
    input.addEventListener("change", () => {
      const checked = input.checked;
      window.setTimeout(() => {
        if (!view.dom.isConnected) return;
        const current = view.state.sliceDoc(this.sourceFrom, this.sourceFrom + 3);
        if (!/^\[[ xX]\]$/.test(current)) return;
        view.dispatch({ changes: { from: this.sourceFrom + 1, to: this.sourceFrom + 2, insert: checked ? "x" : " " } });
        view.focus();
      }, 0);
    });
    return input;
  }
  ignoreEvent() { return true; }
}

class TextMarkerWidget extends WidgetType {
  constructor(private text: string, private className: string, private label: string, private sourceFrom?: number) { super(); }
  eq(other: TextMarkerWidget) {
    return this.text === other.text
      && this.className === other.className
      && this.label === other.label
      && this.sourceFrom === other.sourceFrom;
  }
  toDOM(view: EditorView) {
    const element = document.createElement("span");
    element.className = this.className;
    element.textContent = this.text;
    element.setAttribute("aria-label", this.label);
    if (this.sourceFrom !== undefined) {
      element.tabIndex = 0;
      element.setAttribute("role", "button");
      element.setAttribute("aria-label", `${this.label}. Activate to edit Markdown source.`);
      element.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        window.setTimeout(() => {
          if (view.dom.isConnected) focusSource(view, this.sourceFrom!);
        }, 0);
      });
      element.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        window.setTimeout(() => {
          if (view.dom.isConnected) focusSource(view, this.sourceFrom!);
        }, 0);
      });
    }
    return element;
  }
  ignoreEvent() { return true; }
}

interface SourceLine {
  number: number;
  from: number;
  to: number;
  text: string;
}

function sourceLines(state: EditorState) {
  const lines: SourceLine[] = [];
  for (let number = 1; number <= state.doc.lines; number += 1) {
    const line = state.doc.line(number);
    lines.push({ number, from: line.from, to: line.to, text: line.text });
  }
  return lines;
}

function fencedCodeRanges(state: EditorState) {
  const ranges: Array<{ from: number; to: number }> = [];
  syntaxTree(state).iterate({
    enter(reference) {
      if (reference.name === "FencedCode" || reference.name === "CodeBlock") {
        ranges.push({ from: reference.from, to: reference.to });
        return false;
      }
    },
  });
  return ranges;
}

function positionInsideRanges(position: number, ranges: Array<{ from: number; to: number }>) {
  return ranges.some((range) => position >= range.from && position <= range.to);
}

function footnoteNumber(state: EditorState, id: string) {
  let number = 0;
  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    const match = state.doc.line(lineNumber).text.match(/^\s*\[\^([^\]]+)\]:/);
    if (!match) continue;
    number += 1;
    if (match[1] === id) return number;
  }
  return 1;
}

function splitTableCells(text: string) {
  const trimmed = text.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let cell = "";
  let escaped = false;
  let codeTicks = 0;
  for (let index = 0; index < trimmed.length; index += 1) {
    const character = trimmed[index];
    if (escaped) {
      cell += character;
      escaped = false;
    } else if (character === "\\") {
      cell += character;
      escaped = true;
    } else if (character === "`") {
      let run = 1;
      while (trimmed[index + run] === "`") run += 1;
      codeTicks = codeTicks === run ? 0 : (codeTicks === 0 ? run : codeTicks);
      cell += "`".repeat(run);
      index += run - 1;
    } else if (character === "|" && codeTicks === 0) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += character;
    }
  }
  cells.push(cell.trim());
  return cells;
}

export interface MarkdownTableCellSourceRange {
  from: number;
  to: number;
}

/** Return editable source ranges for the cells in one GFM table row. */
export function tableCellSourceRanges(text: string, lineFrom = 0): MarkdownTableCellSourceRange[] {
  const separators: number[] = [];
  let escaped = false;
  let codeTicks = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === "`") {
      let run = 1;
      while (text[index + run] === "`") run += 1;
      codeTicks = codeTicks === run ? 0 : (codeTicks === 0 ? run : codeTicks);
      index += run - 1;
      continue;
    }
    if (character === "|" && codeTicks === 0) separators.push(index);
  }

  const firstSeparator = separators[0];
  const lastSeparator = separators[separators.length - 1];
  const contentStart = firstSeparator === undefined || firstSeparator > text.search(/\S|$/) ? 0 : firstSeparator + 1;
  const contentEnd = lastSeparator !== undefined && lastSeparator > contentStart && !text.slice(lastSeparator + 1).trim() ? lastSeparator : text.length;
  const internalSeparators = separators.filter((position) => position >= contentStart && position < contentEnd);
  const ranges: MarkdownTableCellSourceRange[] = [];
  let start = contentStart;
  for (const separator of [...internalSeparators, contentEnd]) {
    const end = separator;
    const segment = text.slice(start, end);
    const leadingWhitespace = segment.match(/^\s*/)?.[0].length || 0;
    const trailingWhitespace = segment.match(/\s*$/)?.[0].length || 0;
    const from = start + leadingWhitespace;
    const to = Math.max(from, end - trailingWhitespace);
    ranges.push({ from: lineFrom + from, to: lineFrom + to });
    start = separator + 1;
  }
  return ranges;
}

function isGfmTableDelimiter(text: string, expectedColumns: number) {
  const cells = splitTableCells(text);
  return expectedColumns > 0
    && cells.length === expectedColumns
    && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function appendTableCell(line: string, cell: string) {
  const indentation = line.match(/^\s*/)?.[0] ?? "";
  const trimmed = line.trim();
  const hasTrailingPipe = trimmed.endsWith("|");
  const body = (hasTrailingPipe ? trimmed.slice(0, -1) : trimmed).replace(/\s+$/, "");
  return `${indentation}${body} | ${cell}${hasTrailingPipe ? " |" : ""}`;
}

function tableRowStyle(source: string) {
  const firstLine = source.split(/\r?\n/).find((line) => line.trim())?.trim() ?? "";
  return { hasLeadingPipe: firstLine.startsWith("|"), hasTrailingPipe: firstLine.endsWith("|") };
}

/** Append a blank Markdown column while retaining each table's pipe style. */
export function appendMarkdownTableColumn(source: string, lineSeparator = "\n") {
  const lines = source.split(/\r?\n/);
  if (lines.length < 2 || splitTableCells(lines[0]).length === 0) return source;
  return lines.map((line, index) => appendTableCell(line, index === 1 ? "---" : "")).join(lineSeparator);
}

/** Append a blank Markdown row with the same number of cells as the header. */
export function appendMarkdownTableRow(source: string, lineSeparator = "\n") {
  const lines = source.split(/\r?\n/);
  const columnCount = splitTableCells(lines[0] ?? "").length;
  if (lines.length < 2 || columnCount === 0) return source;
  const { hasLeadingPipe, hasTrailingPipe } = tableRowStyle(source);
  const cells = Array.from({ length: columnCount }, () => "").join(" | ");
  const row = `${hasLeadingPipe ? "| " : ""}${cells}${hasTrailingPipe ? " |" : ""}`;
  return `${source}${lineSeparator}${row}`;
}

/**
 * Keep nested unordered lists visually legible in the source-backed editor.
 * The Markdown source remains untouched; only the rendered marker changes.
 */
export function markdownListMarker(source: string, lineText: string) {
  if (!/^[-+*]$/.test(source)) return source;
  const indentation = lineText.match(/^[\t ]*/)?.[0] || "";
  const indentationWidth = indentation.replace(/\t/g, "    ").length;
  const level = Math.min(3, Math.ceil(indentationWidth / 2));
  return ["•", "◦", "▪", "▫"][level];
}

function addRegexMarks(
  text: string,
  base: number,
  regexp: RegExp,
  callback: (match: RegExpExecArray, absolute: number) => Array<Range<Decoration> | null>,
  output: Array<Range<Decoration>>,
) {
  regexp.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regexp.exec(text))) {
    for (const range of callback(match, base + match.index)) {
      if (range) output.push(range);
    }
    if (match[0].length === 0) regexp.lastIndex += 1;
  }
}

/** CodeMirror mark decorations must span at least one character. */
function markRange(decoration: Decoration, from: number, to: number): Range<Decoration> | null {
  return to > from ? decoration.range(from, to) : null;
}

function pushMark(output: Array<Range<Decoration>>, decoration: Decoration, from: number, to: number) {
  const range = markRange(decoration, from, to);
  if (range) output.push(range);
}

function includeFollowingHorizontalSpace(state: EditorState, to: number, limit: number) {
  let end = to;
  while (end < limit && /[\t ]/.test(state.sliceDoc(end, end + 1))) end += 1;
  return end;
}

const revealableSyntaxNodes = new Set([
  "ATXHeading1", "ATXHeading2", "ATXHeading3", "ATXHeading4", "ATXHeading5", "ATXHeading6",
  "StrongEmphasis", "Emphasis", "Strikethrough", "InlineCode", "Link", "Image", "Task", "ListItem", "Blockquote",
  "Escape",
]);

function syntaxNodeKey(node: { name: string; from: number; to: number }) {
  return `${node.name}:${node.from}:${node.to}`;
}

function activeSyntaxNodeKeys(state: EditorState, focused: boolean) {
  const active = new Set<string>();
  if (!focused) return active;
  const tree = syntaxTree(state);
  for (const selection of state.selection.ranges) {
    if (!selection.empty) continue;
    const position = Math.max(0, Math.min(state.doc.length, selection.head));
    for (const bias of [-1, 1] as const) {
      let node: SyntaxNode | null = tree.resolveInner(position, bias);
      while (node) {
        if (revealableSyntaxNodes.has(node.name)) active.add(syntaxNodeKey(node));
        node = node.parent;
      }
    }
  }
  return active;
}

function syntaxNodeIsActive(
  state: EditorState,
  node: { name: string; from: number; to: number },
  focused: boolean,
  activeNodes: Set<string>,
) {
  if (!focused) return false;
  if (activeNodes.has(syntaxNodeKey(node))) return true;
  return state.selection.ranges.some((selection) => !selection.empty && selection.from < node.to && selection.to > node.from);
}

function addHiddenOrVisibleMarker(
  decorations: Array<Range<Decoration>>,
  atomic: Array<Range<Decoration>>,
  markerDecoration: Decoration,
  from: number,
  to: number,
  active: boolean,
  widget?: WidgetType,
) {
  if (to <= from) return;
  if (active) {
    decorations.push(markerDecoration.range(from, to));
    return;
  }
  const replacement = Decoration.replace({ widget, inclusive: false });
  const range = replacement.range(from, to);
  decorations.push(range);
  atomic.push(range);
}

function rangeIsInsideHiddenBlock(from: number, to: number, hiddenBlocks: Array<{ from: number; to: number }>) {
  return hiddenBlocks.some((block) => from >= block.from && to <= block.to);
}

function addSyntaxTreeDecorations(
  state: EditorState,
  decorations: Array<Range<Decoration>>,
  atomic: Array<Range<Decoration>>,
  hiddenBlocks: Array<{ from: number; to: number }>,
  focused: boolean,
  readOnly: boolean,
  from = 0,
  to = state.doc.length,
) {
  const markerDecoration = Decoration.mark({ class: "marktwin-md-marker" });
  const activeNodes = activeSyntaxNodeKeys(state, focused);
  const tree = syntaxTree(state);

  tree.iterate({
    from,
    to,
    enter(reference) {
      const node = reference.node;
      if (rangeIsInsideHiddenBlock(node.from, node.to, hiddenBlocks)) return false;
      const parent = node.parent;

      if (/^ATXHeading[1-6]$/.test(node.name)) {
        // Heading line sizing is supplied by the direct block field so it can
        // participate in CodeMirror's vertical layout. HeaderMark children are
        // still handled below by this viewport-aware inline layer.
      } else if (node.name === "StrongEmphasis") {
        decorations.push(Decoration.mark({ class: "marktwin-live-strong" }).range(node.from, node.to));
      } else if (node.name === "Emphasis") {
        decorations.push(Decoration.mark({ class: "marktwin-live-em" }).range(node.from, node.to));
      } else if (node.name === "Strikethrough") {
        decorations.push(Decoration.mark({ class: "marktwin-live-strike" }).range(node.from, node.to));
      } else if (node.name === "InlineCode") {
        const active = syntaxNodeIsActive(state, node, focused, activeNodes);
        decorations.push(Decoration.mark({ class: "marktwin-live-inline-code" }).range(node.from, node.to));
        for (const marker of node.getChildren("CodeMark")) {
          addHiddenOrVisibleMarker(decorations, atomic, markerDecoration, marker.from, marker.to, active);
        }
        return false;
      } else if (node.name === "Escape") {
        const active = syntaxNodeIsActive(state, node, focused, activeNodes);
        addHiddenOrVisibleMarker(decorations, atomic, markerDecoration, node.from, Math.min(node.from + 1, node.to), active);
        return false;
      } else if (node.name === "Link" || node.name === "Image") {
        const marks = node.getChildren("LinkMark");
        if (marks.length >= 2) {
          const labelFrom = marks[0].to;
          const labelTo = marks[1].from;
          const active = syntaxNodeIsActive(state, node, focused, activeNodes);
          const footnoteId = node.name === "Link" && state.sliceDoc(labelFrom, labelTo).match(/^\^(.+)$/)?.[1];
          if (footnoteId) {
            const line = state.doc.lineAt(node.from);
            const isDefinition = state.sliceDoc(node.to, Math.min(node.to + 1, line.to)) === ":";
            const number = footnoteNumber(state, footnoteId);
            const markerTo = isDefinition
              ? includeFollowingHorizontalSpace(state, node.to + 1, line.to)
              : node.to;
            if (active) {
              decorations.push(markerDecoration.range(node.from, markerTo));
            } else {
              const widget = new TextMarkerWidget(
                isDefinition ? `${number}.` : String(number),
                isDefinition ? "marktwin-live-footnote-definition-marker" : "marktwin-live-footnote-ref",
                isDefinition ? `Footnote ${number}` : `Reference to footnote ${number}`,
                readOnly ? undefined : node.from,
              );
              const replacement = Decoration.replace({ widget, inclusive: false }).range(node.from, markerTo);
              decorations.push(replacement);
              atomic.push(replacement);
            }
            return false;
          }
          if (labelTo > labelFrom) {
            decorations.push(Decoration.mark({ class: node.name === "Image" ? "marktwin-live-image-label" : "marktwin-live-link" }).range(labelFrom, labelTo));
          }
          addHiddenOrVisibleMarker(decorations, atomic, markerDecoration, node.from, labelFrom, active);
          addHiddenOrVisibleMarker(decorations, atomic, markerDecoration, labelTo, node.to, active);
        }
      } else if (node.name === "Task") {
        const marker = node.getChild("TaskMarker");
        if (marker) {
          const active = syntaxNodeIsActive(state, node, focused, activeNodes);
          const markerTo = includeFollowingHorizontalSpace(state, marker.to, state.doc.lineAt(marker.to).to);
          if (active) {
            decorations.push(markerDecoration.range(marker.from, markerTo));
          } else {
            const checked = /[xX]/.test(state.sliceDoc(marker.from, marker.to));
            const replacement = Decoration.replace({ widget: new TaskWidget(checked, marker.from, readOnly), inclusive: false });
            const range = replacement.range(marker.from, markerTo);
            decorations.push(range);
            atomic.push(range);
          }
        }
      } else if (node.name === "HeaderMark" || node.name === "EmphasisMark" || node.name === "StrikethroughMark") {
        if (parent) {
          const active = syntaxNodeIsActive(state, parent, focused, activeNodes);
          const markerTo = node.name === "HeaderMark"
            ? includeFollowingHorizontalSpace(state, node.to, parent.to)
            : node.to;
          addHiddenOrVisibleMarker(decorations, atomic, markerDecoration, node.from, markerTo, active);
        }
      } else if (node.name === "ListMark" && parent) {
        const task = parent.getChild("Task");
        if (task) {
          const markerTo = includeFollowingHorizontalSpace(state, node.to, task.from);
          addHiddenOrVisibleMarker(decorations, atomic, markerDecoration, node.from, markerTo, false);
          return;
        }
        const active = syntaxNodeIsActive(state, parent, focused, activeNodes);
        const source = state.sliceDoc(node.from, node.to);
        const display = markdownListMarker(source, state.doc.lineAt(node.from).text);
        const widget = new TextMarkerWidget(display, "marktwin-live-list-marker", "List marker");
        addHiddenOrVisibleMarker(decorations, atomic, markerDecoration, node.from, node.to, active, widget);
      } else if (node.name === "QuoteMark" && parent) {
        const active = syntaxNodeIsActive(state, parent, focused, activeNodes);
        addHiddenOrVisibleMarker(decorations, atomic, markerDecoration, node.from, node.to, active);
      }
    },
  });
}

function buildInlineDecorations(view: EditorView, config: LiveMarkdownConfig) {
  const ranges: Array<Range<Decoration>> = [];
  const atomicRanges: Array<Range<Decoration>> = [];
  const visible = view.visibleRanges.length ? view.visibleRanges : [{ from: 0, to: view.state.doc.length }];
  const from = Math.min(...visible.map((range) => range.from));
  const to = Math.max(...visible.map((range) => range.to));
  const focused = view.hasFocus;
  const dim = Decoration.mark({ class: "marktwin-md-marker" });
  const codeRanges = fencedCodeRanges(view.state);

  addSyntaxTreeDecorations(view.state, ranges, atomicRanges, [], focused, Boolean(config.readOnly), from, to);

  const firstLine = view.state.doc.lineAt(from).number;
  const lastLine = view.state.doc.lineAt(to).number;
  for (let number = firstLine; number <= lastLine; number += 1) {
    const line = view.state.doc.line(number);
    if (positionInsideRanges(line.from, codeRanges)) continue;
    if (/^\s*<\/?details(?:\s[^>]*)?>\s*$/i.test(line.text)) {
      const active = localSelectionIntersects(view.state, line.from, line.to, focused);
      addHiddenOrVisibleMarker(ranges, atomicRanges, dim, line.from, line.to, active);
      continue;
    }
    const callout = line.text.match(/^\s*>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i);
    if (callout) {
      const markerOffset = line.text.indexOf("[!");
      const markerFrom = line.from + markerOffset;
      const markerTo = markerFrom + `[!${callout[1]}]`.length;
      const active = localSelectionIntersects(view.state, line.from, line.to, focused);
      const title = callout[1][0] + callout[1].slice(1).toLowerCase();
      addHiddenOrVisibleMarker(
        ranges,
        atomicRanges,
        dim,
        markerFrom,
        markerTo,
        active,
        new TextMarkerWidget(title, "marktwin-live-callout-title", `${title} callout`, config.readOnly ? undefined : markerFrom),
      );
    }

    addRegexMarks(line.text, line.from, /<(u|sup|sub|code|summary)(?:\s[^>]*)?>(.*?)<\/\1>/gi, (match, absolute) => {
      const openLength = match[0].indexOf(">") + 1;
      const closeLength = match[1].length + 3;
      const contentFrom = absolute + openLength;
      const contentTo = absolute + match[0].length - closeLength;
      const active = localSelectionIntersects(view.state, absolute, absolute + match[0].length, focused);
      const marks: Array<Range<Decoration> | null> = [];
      if (active) {
        marks.push(markRange(dim, absolute, contentFrom), markRange(dim, contentTo, absolute + match[0].length));
      } else {
        const opening = Decoration.replace({ inclusive: false }).range(absolute, contentFrom);
        const closing = Decoration.replace({ inclusive: false }).range(contentTo, absolute + match[0].length);
        marks.push(opening, closing);
        atomicRanges.push(opening, closing);
      }
      const tag = match[1].toLowerCase();
      const className = tag === "code" ? "marktwin-live-inline-code" : `marktwin-live-${tag}`;
      if (contentTo > contentFrom) marks.push(markRange(Decoration.mark({ class: className }), contentFrom, contentTo));
      return marks;
    }, ranges);

    const inlineCodeRanges = Array.from(line.text.matchAll(/`+[^`\n]*?`+/g)).map((match) => ({ from: match.index, to: match.index + match[0].length }));
    addRegexMarks(line.text, line.from, /(?<!\\)\$(?!\s|\d+(?:[.,]\d+)?(?:\s|$))([^$\n]+?)(?<!\\)\$|\\\((.+?)\\\)/g, (match, absolute) => {
      const localFrom = absolute - line.from;
      if (inlineCodeRanges.some((range) => localFrom >= range.from && localFrom < range.to)) return [];
      if (localSelectionIntersects(view.state, absolute, absolute + match[0].length, focused)) {
        return [markRange(Decoration.mark({ class: "marktwin-live-math-source" }), absolute, absolute + match[0].length)];
      }
      const source = match[1] ?? match[2];
      const replacement = Decoration.replace({ widget: new HtmlWidget(renderKatex(source, false), "marktwin-live-inline-math", absolute, "Inline mathematical formula", Boolean(config.readOnly)), inclusive: false });
      const range = replacement.range(absolute, absolute + match[0].length);
      atomicRanges.push(range);
      return [range];
    }, ranges);
  }

  return {
    decorations: Decoration.set(ranges, true),
    atomic: Decoration.set(atomicRanges, true),
  };
}

function liveInlineMarkdownPlugin(config: LiveMarkdownConfig): Extension {
  const plugin = ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    atomic: RangeSet<Decoration>;
    constructor(view: EditorView) {
      const built = buildInlineDecorations(view, config);
      this.decorations = built.decorations;
      this.atomic = built.atomic;
    }
    update(update: ViewUpdate) {
      if (!update.docChanged && !update.selectionSet && !update.viewportChanged && !update.focusChanged) return;
      const built = buildInlineDecorations(update.view, config);
      this.decorations = built.decorations;
      this.atomic = built.atomic;
    }
  }, {
    decorations: (value) => value.decorations,
    provide: (plugin) => EditorView.atomicRanges.of((view) => view.plugin(plugin)?.atomic ?? Decoration.none),
  });
  return plugin;
}

interface LiveDecorationState {
  decorations: DecorationSet;
  atomic: RangeSet<Decoration>;
  activeBlocks: Array<{ from: number; to: number }>;
  activeSourceBlock: { from: number; to: number } | null;
  focused: boolean;
}

function buildDecorations(
  state: EditorState,
  config: LiveMarkdownConfig,
  focused: boolean,
  activeSourceBlock: { from: number; to: number } | null = null,
): LiveDecorationState {
  const ranges: Array<Range<Decoration>> = [];
  const atomicRanges: Array<Range<Decoration>> = [];
  const lines = sourceLines(state);
  const hiddenLines = new Set<number>();
  const codeLines = new Set<number>();
  const activeBlocks: Array<{ from: number; to: number }> = [];
  const dim = Decoration.mark({ class: "marktwin-md-marker" });
  const replaceBlock = (from: number, to: number, widget: WidgetType) => {
    const replacement = Decoration.replace({ widget, block: true, inclusive: false });
    const range = replacement.range(from, to);
    ranges.push(range);
    atomicRanges.push(range);
  };

  const frontMatterEnd = lines[0]?.text === "---" ? lines.slice(1).findIndex((line) => line.text === "---") + 1 : -1;
  if (frontMatterEnd > 0) {
    for (let index = 0; index <= frontMatterEnd; index += 1) {
      ranges.push(Decoration.line({ class: "marktwin-live-frontmatter-line" }).range(lines[index].from));
      if (index === 0 || index === frontMatterEnd) pushMark(ranges, dim, lines[index].from, lines[index].to);
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fence = line.text.match(/^\s*(`{3,}|~{3,})[\t ]*([^\s`]*)/);
    if (fence) {
      const marker = fence[1];
      const markerCharacter = marker[0];
      const closingFence = new RegExp(`^\\s*${markerCharacter}{${marker.length},}\\s*$`);
      let end = index + 1;
      while (end < lines.length && !closingFence.test(lines[end].text)) end += 1;
      const closed = end < lines.length;
      if (!closed) end = lines.length - 1;
      const language = fence[2].toLowerCase();
      const from = line.from;
      const to = lines[end].to;
      const active = localSelectionIntersects(state, from, to, focused);
      if (closed && language === "mermaid" && !active) {
        const source = lines.slice(index + 1, end).map((candidate) => candidate.text).join("\n");
        replaceBlock(from, to, new MermaidWidget(source, from, config.theme, Boolean(config.readOnly)));
        for (let hidden = index; hidden <= end; hidden += 1) hiddenLines.add(hidden);
      } else if (closed && !active) {
        const source = lines.slice(index, end + 1).map((candidate) => candidate.text).join("\n");
        replaceBlock(from, to, new MarkdownCodeWidget(source, from, Boolean(config.readOnly)));
        for (let hidden = index; hidden <= end; hidden += 1) hiddenLines.add(hidden);
      } else {
        activeBlocks.push({ from, to });
        for (let codeLine = index; codeLine <= end; codeLine += 1) {
          ranges.push(Decoration.line({ class: "marktwin-live-code-fence" }).range(lines[codeLine].from));
        }
        addHiddenOrVisibleMarker(ranges, atomicRanges, dim, line.from, line.to, active);
        if (end !== index) addHiddenOrVisibleMarker(ranges, atomicRanges, dim, lines[end].from, lines[end].to, active);
      }
      for (let codeLine = index; codeLine <= end; codeLine += 1) codeLines.add(codeLine);
      index = end;
      continue;
    }

    const singleLineDisplayMath = line.text.match(/^\s*\$\$\s*(.+?)\s*\$\$\s*$/)
      ?? line.text.match(/^\s*\\\[\s*(.+?)\s*\\\]\s*$/);
    if (singleLineDisplayMath) {
      if (!localSelectionIntersects(state, line.from, line.to, focused)) {
        replaceBlock(line.from, line.to, new HtmlWidget(renderKatex(singleLineDisplayMath[1], true), "marktwin-live-math", line.from, "Equation", Boolean(config.readOnly)));
        hiddenLines.add(index);
      } else {
        activeBlocks.push({ from: line.from, to: line.to });
        pushMark(ranges, Decoration.mark({ class: "marktwin-live-math-source" }), line.from, line.to);
      }
      continue;
    }

    if (/^\s*\$\$\s*$/.test(line.text) || /^\s*\\\[\s*$/.test(line.text)) {
      const dollar = line.text.includes("$$");
      let end = index + 1;
      const closing = dollar ? /^\s*\$\$\s*$/ : /^\s*\\\]\s*$/;
      while (end < lines.length && !closing.test(lines[end].text)) end += 1;
      if (end < lines.length) {
        const from = line.from;
        const to = lines[end].to;
        if (!localSelectionIntersects(state, from, to, focused)) {
          const source = lines.slice(index + 1, end).map((candidate) => candidate.text).join("\n").trim();
          replaceBlock(from, to, new HtmlWidget(renderKatex(source, true), "marktwin-live-math", from, "Equation", Boolean(config.readOnly)));
          for (let hidden = index; hidden <= end; hidden += 1) hiddenLines.add(hidden);
        } else {
          activeBlocks.push({ from, to });
          pushMark(ranges, dim, line.from, line.to);
          pushMark(ranges, dim, lines[end].from, lines[end].to);
        }
        index = end;
        continue;
      }
    }

    const standaloneImage = parseStandaloneImage(line.text);
    if (standaloneImage) {
      if (!localSelectionIntersects(state, line.from, line.to, focused)) {
        replaceBlock(line.from, line.to, new ImageWidget(
          standaloneImage.source,
          standaloneImage.alt,
          line.from,
          standaloneImage.width,
          Boolean(config.readOnly),
          config.resolveImage,
        ));
        hiddenLines.add(index);
      } else {
        activeBlocks.push({ from: line.from, to: line.to });
      }
      continue;
    }

    const headerCells = line.text.includes("|") ? splitTableCells(line.text) : [];
    if (index + 1 < lines.length && isGfmTableDelimiter(lines[index + 1].text, headerCells.length)) {
      let end = index + 2;
      while (end < lines.length && lines[end].text.includes("|") && lines[end].text.trim()) end += 1;
      const toIndex = end - 1;
      const from = line.from;
      const to = lines[toIndex].to;
      const explicitlyActive = activeSourceBlock !== null
        && from <= activeSourceBlock.to
        && to >= activeSourceBlock.from;
      if (!explicitlyActive && !localSelectionIntersects(state, from, to, focused)) {
        replaceBlock(from, to, new MarkdownTableWidget(
          lines.slice(index, end).map((candidate) => candidate.text).join("\n"),
          from,
          Boolean(config.readOnly),
          config.tableAddColumnLabel,
          config.tableAddRowLabel,
          config.tableDeleteLabel,
        ));
        for (let hidden = index; hidden < end; hidden += 1) hiddenLines.add(hidden);
      } else {
        activeBlocks.push({ from, to });
      }
      index = toIndex;
      continue;
    }
  }

  let activeCallout: string | null = null;
  lines.forEach((line, index) => {
    if (hiddenLines.has(index) || codeLines.has(index)) return;
    const heading = line.text.match(/^ {0,3}(#{1,6})(?:\s+|$)/);
    if (heading) ranges.push(Decoration.line({ class: `marktwin-live-heading marktwin-live-h${heading[1].length}` }).range(line.from));
    const callout = line.text.match(/^\s*>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i);
    if (callout) activeCallout = callout[1].toLowerCase();
    if (activeCallout && /^\s*>/.test(line.text)) {
      ranges.push(Decoration.line({ class: `marktwin-live-callout marktwin-live-callout-${activeCallout}` }).range(line.from));
    } else if (!/^\s*>/.test(line.text)) {
      activeCallout = null;
    }
    if (/^\s*>/.test(line.text) && !activeCallout) ranges.push(Decoration.line({ class: "marktwin-live-quote" }).range(line.from));
    if (/^\s*(?:[-+*]|\d+[.)])\s+/.test(line.text)) ranges.push(Decoration.line({ class: "marktwin-live-list" }).range(line.from));
    if (/^\s*\[\^[^\]]+\]:/.test(line.text)) ranges.push(Decoration.line({ class: "marktwin-live-footnote-definition" }).range(line.from));
    if (/^\s*(?:[-*_]\s*){3,}$/.test(line.text)) {
      if (localSelectionIntersects(state, line.from, line.to, focused)) pushMark(ranges, dim, line.from, line.to);
      else ranges.push(Decoration.line({ class: "marktwin-live-rule" }).range(line.from));
    }
  });

  return {
    decorations: Decoration.set(ranges, true),
    atomic: Decoration.set(atomicRanges, true),
    activeBlocks,
    activeSourceBlock,
    focused,
  };
}

function rangeSetIntersects(set: RangeSet<Decoration>, from: number, to: number, docLength: number) {
  let intersects = false;
  const queryFrom = Math.max(0, from - 1);
  const queryTo = Math.min(docLength, Math.max(to, from) + 1);
  set.between(queryFrom, queryTo, (rangeFrom, rangeTo) => {
    if (from <= rangeTo && to >= rangeFrom) intersects = true;
  });
  return intersects;
}

function selectionTouchesBlock(state: EditorState, value: LiveDecorationState) {
  return state.selection.ranges.some((selection) => {
    if (rangeSetIntersects(value.atomic, selection.from, selection.to, state.doc.length)) return true;
    return value.activeBlocks.some((block) => selection.from <= block.to && selection.to >= block.from);
  });
}

function lineMayAffectBlockPresentation(text: string) {
  return /^(?:#{1,6}(?:\s|$)|\s*(?:>|[-+*]\s|\d+[.)]\s|```|~~~|\$\$|\\\[|!\[))/.test(text)
    || /^\s*(?:[-*_]\s*){3,}$/.test(text)
    || text.includes("|");
}

function documentChangeTouchesBlock(transaction: Transaction, value: LiveDecorationState) {
  let touches = false;
  transaction.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
    if (touches) return;
    if (rangeSetIntersects(value.atomic, fromA, toA, transaction.startState.doc.length)
      || value.activeBlocks.some((block) => fromA <= block.to && toA >= block.from)) {
      touches = true;
      return;
    }
    const oldStart = transaction.startState.doc.lineAt(fromA).number;
    const oldEnd = transaction.startState.doc.lineAt(toA).number;
    const newStart = transaction.state.doc.lineAt(fromB).number;
    const newEnd = transaction.state.doc.lineAt(toB).number;
    for (let line = oldStart; line <= oldEnd && !touches; line += 1) touches = lineMayAffectBlockPresentation(transaction.startState.doc.line(line).text);
    for (let line = newStart; line <= newEnd && !touches; line += 1) touches = lineMayAffectBlockPresentation(transaction.state.doc.line(line).text);
  });
  return touches;
}

export function liveMarkdownExtension(config: LiveMarkdownConfig): Extension {
  const field = StateField.define<LiveDecorationState>({
    create(state) { return buildDecorations(state, config, false); },
    update(value, transaction) {
      let focused = value.focused;
      let activeSourceBlock = value.activeSourceBlock;
      for (const effect of transaction.effects) {
        if (effect.is(setLiveEditorFocus)) focused = effect.value;
        if (effect.is(setLiveEditorActiveBlock)) activeSourceBlock = effect.value;
      }
      if (transaction.docChanged && activeSourceBlock) {
        activeSourceBlock = {
          from: transaction.changes.mapPos(activeSourceBlock.from, -1),
          to: transaction.changes.mapPos(activeSourceBlock.to, 1),
        };
      }
      if (focused !== value.focused) {
        return buildDecorations(transaction.state, config, focused, activeSourceBlock);
      }
      if (transaction.docChanged) {
        // Remote Yjs edits can arrive in the middle of a CodeMirror update
        // while block widgets are being measured. Mapping the old RangeSets
        // through that transaction can leave a stale widget boundary behind
        // and make CodeMirror throw while advancing its viewport tiles. A
        // fresh decoration pass is deterministic and keeps the live editor
        // renderable for both local and remote document changes.
        // A source activation can briefly lose the browser focus flag while
        // Yjs applies the first local edit. If that edit is still inside the
        // block that was active before the transaction, keep its source open;
        // otherwise CodeMirror re-inserts the widget and the next keystroke
        // is mapped to the widget boundary instead of the user's caret.
        return buildDecorations(transaction.state, config, focused, activeSourceBlock);
      }
      if (transaction.selection
        && (selectionTouchesBlock(transaction.startState, value) || selectionTouchesBlock(transaction.state, value)
          || activeSourceBlock !== value.activeSourceBlock)) {
        return buildDecorations(transaction.state, config, focused, activeSourceBlock);
      }
      if (activeSourceBlock !== value.activeSourceBlock) {
        return buildDecorations(transaction.state, config, focused, activeSourceBlock);
      }
      return value;
    },
    provide: (field) => [
      EditorView.decorations.from(field, (value) => value.decorations),
      EditorView.atomicRanges.of((view) => view.state.field(field).atomic),
    ],
  });
  const focusHandlers = EditorView.domEventHandlers({
    focus(_event, view) {
      window.setTimeout(() => {
        if (view.dom.isConnected && view.hasFocus) view.dispatch({ effects: setLiveEditorFocus.of(true) });
      }, 0);
      return false;
    },
    blur(_event, view) {
      window.setTimeout(() => {
        if (view.dom.isConnected && !view.hasFocus) {
          view.dispatch({
            effects: [setLiveEditorFocus.of(false), setLiveEditorActiveBlock.of(null)],
          });
        }
      }, 0);
      return false;
    },
  });
  return [field, focusHandlers, liveInlineMarkdownPlugin(config)];
}
