import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { applyCollaborationUpdate } from "./collaboration-update";

describe("collaboration update application", () => {
  it("keeps a valid update when an editor observer throws", () => {
    const source = new Y.Doc();
    source.getText("note").insert(0, "remote edit");
    const target = new Y.Doc();
    target.getText("note").observe(() => { throw new Error("render failed"); });
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(() => applyCollaborationUpdate(target, Y.encodeStateAsUpdate(source), "peer")).not.toThrow();
    expect(target.getText("note").toString()).toBe("remote edit");
    expect(warning).toHaveBeenCalledOnce();

    warning.mockRestore();
    source.destroy();
    target.destroy();
  });

  it("rejects malformed update bytes before touching the live document", () => {
    const target = new Y.Doc();
    expect(() => applyCollaborationUpdate(target, new Uint8Array([255, 255, 255]), "peer")).toThrow();
    expect(target.getText("note").toString()).toBe("");
    target.destroy();
  });
});
