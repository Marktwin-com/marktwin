import { afterEach, describe, expect, it, vi } from "vitest";
import { scrubProductEventMetadata, trackProductEvent } from "./analytics";

describe("product analytics", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("keeps only the allowlisted coarse metadata", () => {
    expect(scrubProductEventMetadata({
      artifactType: "markdown",
      source: "workspace",
      route: "/cabinet/1",
      returning: true,
      content: "private note",
      token: "secret",
    } as never)).toEqual({
      artifactType: "markdown",
      source: "workspace",
      route: "/cabinet/1",
      returning: true,
    });
  });

  it("does not send events or create tracking identifiers in the OSS edition", () => {
    const storage = { getItem: vi.fn(), setItem: vi.fn() };
    vi.stubGlobal("window", { localStorage: storage });
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    trackProductEvent("checkpoint_completed", { cabinetId: 123, metadata: { source: "workspace" } });
    expect(fetcher).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});
