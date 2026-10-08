import { describe, expect, it } from "vitest";

import { reconcileDrawingElements } from "./excalidraw-collaboration";

describe("Excalidraw collaboration reconciliation", () => {
  it("keeps a newer local stroke instead of replacing it with stale shared geometry", () => {
    const incoming = [{ id: "stroke", version: 2, versionNonce: 20, points: [[0, 0], [1, 1]] }];
    const local = [{ id: "stroke", version: 4, versionNonce: 40, points: [[0, 0], [1, 1], [2, 2], [3, 3]] }];

    expect(reconcileDrawingElements(incoming, local)).toEqual(local);
  });

  it("accepts a newer incoming element and preserves unrelated local elements", () => {
    const incoming = [{ id: "remote", version: 3, versionNonce: 30, x: 30 }];
    const local = [
      { id: "remote", version: 2, versionNonce: 20, x: 20 },
      { id: "local-only", version: 1, versionNonce: 10, x: 10 },
    ];

    expect(reconcileDrawingElements(incoming, local)).toEqual([
      incoming[0],
      local[1],
    ]);
  });

  it("resolves equal-version conflicts deterministically by version nonce", () => {
    const higherNonce = [{ id: "shape", version: 5, versionNonce: 90, x: 90 }];
    const lowerNonce = [{ id: "shape", version: 5, versionNonce: 10, x: 10 }];

    expect(reconcileDrawingElements(higherNonce, lowerNonce)).toEqual(lowerNonce);
    expect(reconcileDrawingElements(lowerNonce, higherNonce)).toEqual(lowerNonce);
  });
});
