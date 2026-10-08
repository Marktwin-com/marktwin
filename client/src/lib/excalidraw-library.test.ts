import { describe, expect, it } from "vitest";

import { parseStoredExcalidrawLibrary } from "./excalidraw-library";

describe("Excalidraw library persistence", () => {
  it("starts with an empty library when nothing has been saved", () => {
    expect(parseStoredExcalidrawLibrary(null)).toEqual([]);
  });

  it("keeps saved library items for Excalidraw to restore", () => {
    const items = [{ id: "marktwin-card", status: "published", elements: [] }];
    expect(parseStoredExcalidrawLibrary(JSON.stringify(items))).toEqual(items);
  });

  it("recovers safely from invalid or non-library browser data", () => {
    expect(parseStoredExcalidrawLibrary("not json")).toEqual([]);
    expect(parseStoredExcalidrawLibrary('{"items":[]}')).toEqual([]);
  });
});
