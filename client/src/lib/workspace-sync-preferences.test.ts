import { describe, expect, it } from "vitest";

import {
  AUTO_SYNC_INTERVAL_OPTIONS,
  DEFAULT_AUTO_SYNC_INTERVAL_SECONDS,
  autoSyncDelayMs,
  formatAutoSyncInterval,
  normalizeAutoSyncIntervalSeconds,
  syncControlState,
} from "./workspace-sync-preferences";

describe("workspace sync preferences", () => {
  it("accepts only supported intervals", () => {
    for (const seconds of AUTO_SYNC_INTERVAL_OPTIONS) {
      expect(normalizeAutoSyncIntervalSeconds(seconds)).toBe(seconds);
      expect(normalizeAutoSyncIntervalSeconds(String(seconds))).toBe(seconds);
    }
  });

  it("falls back to one minute for missing or invalid values", () => {
    expect(normalizeAutoSyncIntervalSeconds(null)).toBe(DEFAULT_AUTO_SYNC_INTERVAL_SECONDS);
    expect(normalizeAutoSyncIntervalSeconds("1500")).toBe(DEFAULT_AUTO_SYNC_INTERVAL_SECONDS);
    expect(normalizeAutoSyncIntervalSeconds(Number.NaN)).toBe(DEFAULT_AUTO_SYNC_INTERVAL_SECONDS);
  });

  it("schedules supported intervals in milliseconds", () => {
    expect(autoSyncDelayMs(30)).toBe(30_000);
    expect(autoSyncDelayMs(60)).toBe(60_000);
    expect(autoSyncDelayMs(300)).toBe(300_000);
    expect(autoSyncDelayMs(1.5)).toBe(60_000);
  });

  it("formats compact labels for settings", () => {
    expect(formatAutoSyncInterval(30)).toBe("30s");
    expect(formatAutoSyncInterval(60)).toBe("1 min");
    expect(formatAutoSyncInterval(300)).toBe("5 min");
  });

  it("maps dirty to publishing to synced and exposes errors", () => {
    expect(syncControlState({ unpublishedCount: 3, publishing: false, error: false })).toBe("unpublished");
    expect(syncControlState({ unpublishedCount: 3, publishing: true, error: false })).toBe("publishing");
    expect(syncControlState({ unpublishedCount: 0, publishing: false, error: false })).toBe("synced");
    expect(syncControlState({ unpublishedCount: 2, publishing: false, error: true })).toBe("error");
  });
});
