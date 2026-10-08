import { describe, expect, it } from "vitest";

import { removeRetiredPresentationMetadata } from "./retired-presentation-metadata";

describe("retired presentation metadata", () => {
  it("removes an otherwise empty metadata block", () => {
    expect(removeRetiredPresentationMetadata("---\nmarktwin-style: gallery\n---\n\n# Notes"))
      .toBe("# Notes");
  });

  it("preserves unrelated front matter and documents without retired metadata", () => {
    expect(removeRetiredPresentationMetadata("---\ntitle: Notes\nmarktwin-style: article\ntags: [work]\n---\n# Notes"))
      .toBe("---\ntitle: Notes\ntags: [work]\n---\n# Notes");
    expect(removeRetiredPresentationMetadata("# Notes")).toBe("# Notes");
  });
});
