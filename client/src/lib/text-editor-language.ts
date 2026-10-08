import { json } from "@codemirror/lang-json";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { yaml } from "@codemirror/lang-yaml";
import { HighlightStyle, StreamLanguage, syntaxHighlighting } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { tags } from "@lezer/highlight";
import { properties } from "@codemirror/legacy-modes/mode/properties";
import { stex } from "@codemirror/legacy-modes/mode/stex";
import { toml } from "@codemirror/legacy-modes/mode/toml";
import { xml } from "@codemirror/legacy-modes/mode/xml";

import { textDocumentKindForPath } from "./text-files";

const markdownLanguageSupport = markdown({ base: markdownLanguage });
const yamlLanguageSupport = yaml();
const jsonLanguageSupport = json();
const texLanguageSupport = StreamLanguage.define(stex);
const tomlLanguageSupport = StreamLanguage.define(toml);
const propertiesLanguageSupport = StreamLanguage.define(properties);
const xmlLanguageSupport = StreamLanguage.define(xml);

export const readableTextHighlighting = syntaxHighlighting(HighlightStyle.define([
  { tag: tags.heading, color: "hsl(var(--obsidian-accent))", fontWeight: "650" },
  { tag: [tags.keyword, tags.controlKeyword, tags.definitionKeyword, tags.moduleKeyword], color: "var(--syntax-keyword)", fontWeight: "650" },
  { tag: [tags.typeName, tags.className, tags.tagName, tags.namespace], color: "var(--syntax-type)" },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: "var(--syntax-function)" },
  { tag: [tags.propertyName, tags.attributeName, tags.labelName, tags.variableName], color: "var(--syntax-variable)" },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], color: "var(--syntax-string)" },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], color: "var(--syntax-number)" },
  { tag: [tags.operator, tags.punctuation, tags.separator], color: "var(--syntax-punctuation)" },
  { tag: [tags.comment, tags.meta, tags.docComment], color: "var(--syntax-comment)", fontStyle: "italic" },
  { tag: [tags.link, tags.url], color: "hsl(var(--obsidian-accent))", textDecoration: "underline" },
  { tag: tags.invalid, color: "hsl(var(--obsidian-error))", textDecoration: "underline wavy" },
]));

export function textEditorLanguageForPath(path: string): Extension[] {
  const kind = textDocumentKindForPath(path);
  if (kind === "markdown") return [markdownLanguageSupport];
  if (kind === "yaml") return [yamlLanguageSupport];
  if (kind === "json") return [jsonLanguageSupport];
  if (kind === "tex") return [texLanguageSupport];
  if (kind === "toml") return [tomlLanguageSupport];
  if (kind === "properties") return [propertiesLanguageSupport];
  if (kind === "xml") return [xmlLanguageSupport];
  return [];
}
