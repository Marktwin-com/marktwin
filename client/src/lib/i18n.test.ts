import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  detectBrowserLocale,
  formatCurrency,
  formatDate,
  formatList,
  formatMessage,
  formatNumber,
  formatRelativeTime,
  getLocaleDirection,
  loadCatalog,
  normalizeLocale,
  resolveLocale,
  validateCatalogKeys,
} from "./i18n";
import { messages as enMessages } from "../i18n/locales/en";
import { messages as esMessages } from "../i18n/locales/es";

describe("locale resolution and fallback", () => {
  it("normalizes supported and unsupported locale values", () => {
    expect(normalizeLocale("es-CL")).toBe("es");
    expect(normalizeLocale("fr-FR")).toBe("fr");
    expect(normalizeLocale("zh-CN")).toBe("zh");
    expect(normalizeLocale("en-US")).toBe("en");
    expect(resolveLocale("ar-SA")).toBe("ar");
  });

  it("selects the first supported browser language before falling back to English", () => {
    expect(detectBrowserLocale(["fr-FR", "es-ES"])).toBe("fr");
    expect(detectBrowserLocale(["ar-SA", "en-US"])).toBe("ar");
    expect(detectBrowserLocale(["pt-BR", "en-US"])).toBe("en");
  });

  it("exposes RTL metadata independently from translated copy", () => {
    expect(getLocaleDirection("ar")).toBe("rtl");
    expect(getLocaleDirection("es")).toBe("ltr");
  });

  it("loads the beta language catalogs and keeps an English fallback path", async () => {
    for (const locale of ["fr", "de", "zh", "hi", "ar"]) {
      const catalog = await loadCatalog(locale);
      expect(catalog["nav.language"]).toBeTruthy();
      expect(formatMessage(locale, catalog, "common.loading")).not.toBe("common.loading");
      expect(formatMessage(locale, catalog, "workspace.editorVisual")).not.toBe("");
    }
  });
});

describe("message catalogs", () => {
  it("supports interpolation, plurals, and select messages", async () => {
    const catalog = await loadCatalog("es");
    expect(formatMessage("es", catalog, "cabinet.removeConfirm", { name: "Notas" })).toContain("Notas");
    expect(formatMessage("es", catalog, "common.fileCount", { count: 1 })).toContain("archivo");
    expect(formatMessage("es", catalog, "common.fileCount", { count: 4 })).toContain("archivos");
    expect(formatMessage("es", catalog, "common.status", { status: "implemented" })).toContain("Implementado");
    expect(formatMessage("es", catalog, "missing.message")).toBe("missing.message");
  });

  it("keeps reviewed English and Spanish catalogs key-complete", () => {
    expect(validateCatalogKeys(enMessages, esMessages)).toEqual([]);
    expect(validateCatalogKeys(esMessages, enMessages)).toEqual([]);
  });

  it("defines every literal translation key used by client source", () => {
    const sourceRoot = join(process.cwd(), "client", "src");
    const files: string[] = [];
    const visit = (directory: string) => {
      for (const entry of readdirSync(directory)) {
        const path = join(directory, entry);
        if (statSync(path).isDirectory()) visit(path);
        else if (/\.(?:ts|tsx)$/.test(entry) && !entry.endsWith(".test.ts")) files.push(path);
      }
    };
    visit(sourceRoot);
    const used = new Set<string>();
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/\bt\(\s*["']([^"']+)["']/g)) used.add(match[1]);
    }
    expect(Array.from(used).filter((key) => !(key in enMessages))).toEqual([]);
    expect(Array.from(used).filter((key) => !(key in esMessages))).toEqual([]);
  });

  it("formats new recovery and activity plurals in both reviewed locales", () => {
    expect(formatMessage("en", enMessages, "workspace.reviewOperations", { count: 2 })).toContain("2 staged operations");
    expect(formatMessage("es", esMessages, "workspace.reviewOperations", { count: 1 })).toContain("1 operación preparada");
    expect(formatMessage("es", esMessages, "drawing.liveWith", { count: 2 })).toContain("2 colaboradores");
  });
});

describe("locale-aware formatting", () => {
  it("formats numbers, currency, dates, relative time, and lists with the active locale", () => {
    expect(formatNumber("en", 1234567.89)).toContain("1,234,567");
    expect(formatNumber("es", 1234567.89)).toContain("1.234.567");
    expect(formatCurrency("es", 12.5, "USD")).toContain("12,50");
    expect(formatDate("en", "2026-08-16T12:00:00Z")).not.toBe("");
    expect(formatDate("es", "2026-08-16T12:00:00Z")).not.toBe("");
    expect(formatRelativeTime("es", -1, "day")).toContain("ayer");
    expect(formatList("es", ["uno", "dos", "tres"])).toContain("y");
  });
});
