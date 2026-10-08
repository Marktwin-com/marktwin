import { describe, expect, it } from "vitest";
import { diffReturnContext } from "./return-context";

describe("return context", () => {
  it("reports file changes without decision-specific entries", () => {
    const entries = diffReturnContext(
      { commitSha: "old", files: [{ path: "old.md", sha: "1", fileType: "markdown" }, { path: "same.md", sha: "1", fileType: "markdown" }], decisionIds: ["d1"] },
      { commitSha: "new", files: [{ path: "same.md", sha: "2", fileType: "markdown" }, { path: "new.md", sha: "3", fileType: "markdown" }], decisionIds: ["d1", "d2"] },
    );
    expect(entries.map((entry) => entry.kind)).toEqual(["modified", "added", "deleted"]);
  });
});
