import { beforeEach, describe, expect, it } from "vitest";

import { loadWorkingSet, toggleWorkingSetItem } from "./working-set";

const storage = new Map<string, string>();
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  },
});

describe("Working Set", () => {
  beforeEach(() => storage.clear());

  it("caps a personal Multi-view at four recent artifacts", () => {
    for (let index = 1; index <= 5; index += 1) {
      toggleWorkingSetItem("cabinet", {
        id: String(index),
        path: `notes/${index}.md`,
        fileType: "markdown",
        label: `${index}.md`,
      }, "reader");
    }
    expect(loadWorkingSet("cabinet", "reader").map((item) => item.id)).toEqual(["5", "4", "3", "2"]);
  });

  it("removes an already pinned artifact without affecting the others", () => {
    toggleWorkingSetItem("cabinet", { id: "one", path: "one.md", fileType: "markdown" }, "reader");
    toggleWorkingSetItem("cabinet", { id: "two", path: "two.canvas", fileType: "canvas" }, "reader");
    toggleWorkingSetItem("cabinet", { id: "one", path: "one.md", fileType: "markdown" }, "reader");
    expect(loadWorkingSet("cabinet", "reader").map((item) => item.id)).toEqual(["two"]);
  });
});
