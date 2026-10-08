import { afterEach, describe, expect, it, vi } from "vitest";

import { getCollaborationTransportPreference, setCollaborationTransportPreference } from "./collaboration-preferences";

describe("collaboration transport preference", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses direct P2P by default and persists an explicit browser choice", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });

    expect(getCollaborationTransportPreference()).toBe("direct");
    setCollaborationTransportPreference("relay");
    expect(getCollaborationTransportPreference()).toBe("relay");
    setCollaborationTransportPreference("direct");
    expect(getCollaborationTransportPreference()).toBe("direct");
  });

  it("migrates the previous remembered relay choice", () => {
    const values = new Map<string, string>([["marktwin-collaboration-relay-preference", "allowed"]]);
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });

    expect(getCollaborationTransportPreference()).toBe("relay");
  });
});
