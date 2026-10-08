import { StateField, type EditorState, type Extension, type Range } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";
import { codeFolding, foldEffect, foldedRanges, unfoldEffect } from "@codemirror/language";

export interface MarkdownSectionRange {
  from: number;
  to: number;
}

/** Find the body controlled by an ATX heading (`#` through `######`). */
export function markdownSectionRange(state: EditorState, headingLineFrom: number): MarkdownSectionRange | null {
  const headingLine = state.doc.lineAt(headingLineFrom);
  const heading = headingLine.text.match(/^(#{1,6})\s+/);
  if (!heading) return null;
  const level = heading[1].length;
  let sectionEnd = state.doc.length;
  for (let number = headingLine.number + 1; number <= state.doc.lines; number += 1) {
    const candidate = state.doc.line(number);
    const nextHeading = candidate.text.match(/^(#{1,6})\s+/);
    if (nextHeading && nextHeading[1].length <= level) {
      // Keep the line break before the next peer/parent heading visible.
      sectionEnd = Math.max(headingLine.to, candidate.from - 1);
      break;
    }
  }
  return sectionEnd > headingLine.to ? { from: headingLine.to, to: sectionEnd } : null;
}

function isRangeFolded(state: EditorState, range: MarkdownSectionRange) {
  let folded = false;
  foldedRanges(state).between(range.from, range.to, (from, to) => {
    if (from === range.from && to === range.to) folded = true;
  });
  return folded;
}

class SectionFoldWidget extends WidgetType {
  constructor(private range: MarkdownSectionRange, private folded: boolean) { super(); }

  eq(other: SectionFoldWidget) {
    return this.folded === other.folded && this.range.from === other.range.from && this.range.to === other.range.to;
  }

  toDOM(view: EditorView) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "marktwin-section-fold";
    button.textContent = this.folded ? "▸" : "▾";
    button.title = this.folded ? "Expand section" : "Collapse section";
    button.setAttribute("aria-label", button.title);
    button.setAttribute("aria-expanded", String(!this.folded));
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      view.dispatch({ effects: (this.folded ? unfoldEffect : foldEffect).of(this.range) });
      view.focus();
    });
    return button;
  }

  ignoreEvent() { return true; }
}

function sectionFoldDecorations(state: EditorState) {
  const widgets: Array<Range<Decoration>> = [];
  for (let number = 1; number <= state.doc.lines; number += 1) {
    const line = state.doc.line(number);
    const range = markdownSectionRange(state, line.from);
    if (!range) continue;
    widgets.push(Decoration.widget({
      widget: new SectionFoldWidget(range, isRangeFolded(state, range)),
      side: -1,
    }).range(line.from));
  }
  return Decoration.set(widgets, true);
}

/** Local visual folding. It never changes the Markdown document. */
export function markdownSectionFolding(): Extension {
  const decorations = StateField.define<DecorationSet>({
    create: sectionFoldDecorations,
    update(previous, transaction) {
      if (transaction.docChanged || transaction.effects.some((effect) => effect.is(foldEffect) || effect.is(unfoldEffect))) {
        return sectionFoldDecorations(transaction.state);
      }
      return previous;
    },
    provide: (field) => EditorView.decorations.from(field),
  });
  return [codeFolding({ placeholderText: "…" }), decorations];
}

/** Reveal a position selected from Outline when it is inside folded sections. */
export function unfoldMarkdownAt(view: EditorView, position: number) {
  const effects: Array<ReturnType<typeof unfoldEffect.of>> = [];
  foldedRanges(view.state).between(0, view.state.doc.length, (from, to) => {
    if (position > from && position <= to) effects.push(unfoldEffect.of({ from, to }));
  });
  if (effects.length) view.dispatch({ effects });
}
