import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

import { attachSignalingErrorBoundary, signalingErrorMetadata } from "../../../server/signaling-safety";

describe("signaling error boundaries", () => {
  it("handles socket errors without exposing their message or arbitrary code", () => {
    const source = new EventEmitter();
    const report = vi.fn();
    attachSignalingErrorBoundary(source, "socket", report);

    const error = Object.assign(new RangeError("frame contains token=VERY_SECRET"), {
      code: "VERY_SECRET",
    });
    expect(() => source.emit("error", error)).not.toThrow();
    expect(report).toHaveBeenCalledWith("socket", { name: "RangeError" });
    expect(JSON.stringify(report.mock.calls)).not.toContain("VERY_SECRET");
  });

  it("keeps only bounded machine-readable error codes", () => {
    expect(signalingErrorMetadata(Object.assign(new Error("private payload"), { code: "WS_ERR_UNEXPECTED_RSV_1" })))
      .toEqual({ name: "Error", code: "WS_ERR_UNEXPECTED_RSV_1" });
  });
});
