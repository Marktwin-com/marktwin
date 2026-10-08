import { describe, expect, it } from "vitest";
import { builtInTemplates } from "./templates";

describe("workspace templates", () => {
  it("ships the five bounded first-use templates", () => {
    expect(builtInTemplates.map((template) => template.id)).toEqual(["blank-note", "decision", "project", "meeting", "outline"]);
    expect(builtInTemplates.every((template) => template.fileType === "markdown")).toBe(true);
  });
});
