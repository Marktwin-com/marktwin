import { describe, expect, it } from "vitest";
import {
  isDynamicImportFailure,
  shouldReloadForDynamicImportFailure,
} from "./navigation-recovery";

describe("navigation recovery", () => {
  it.each([
    "TypeError: Failed to fetch dynamically imported module: /assets/user-old.js",
    "TypeError: Importing a module script failed.",
    "ChunkLoadError: Loading chunk workspace-vault failed",
    "Error: Unable to preload CSS for /assets/workspace-old.css",
  ])("recognizes a stale build asset failure: %s", (message) => {
    expect(isDynamicImportFailure(new Error(message))).toBe(true);
  });

  it("does not reload for application errors", () => {
    expect(isDynamicImportFailure(new Error("Could not parse Cabinet metadata"))).toBe(false);
  });

  it("reloads a stale destination once and prevents a reload loop", () => {
    const error = new TypeError("Failed to fetch dynamically imported module");
    const href = "https://marktwin.com/user";

    expect(shouldReloadForDynamicImportFailure(error, href, null)).toBe(true);
    expect(shouldReloadForDynamicImportFailure(error, href, href)).toBe(false);
  });

  it("allows recovery again for a different destination", () => {
    const error = new TypeError("Failed to fetch dynamically imported module");

    expect(
      shouldReloadForDynamicImportFailure(
        error,
        "https://marktwin.com/my-cabinets",
        "https://marktwin.com/user",
      ),
    ).toBe(true);
  });
});
