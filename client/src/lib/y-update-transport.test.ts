import { describe, expect, it } from "vitest";

import { MAX_Y_UPDATE_BYTES, splitYUpdate, Y_UPDATE_CHUNK_BYTES, YUpdateAssembler } from "./y-update-transport";

describe("collaboration Yjs update transport", () => {
  it("reassembles a multi-chunk workspace snapshot without changing its bytes", () => {
    const update = Uint8Array.from({ length: Y_UPDATE_CHUNK_BYTES * 3 + 137 }, (_, index) => index % 251);
    const assembler = new YUpdateAssembler();
    let result: Uint8Array | null = null;
    for (const payload of splitYUpdate(update, "initial-workspace")) result = assembler.accept(payload) || result;
    expect(result).toEqual(update);
  });

  it("accepts chunks arriving out of order", () => {
    const update = Uint8Array.from({ length: Y_UPDATE_CHUNK_BYTES + 5 }, (_, index) => index % 199);
    const [metadata, first, second, complete] = splitYUpdate(update, "out-of-order");
    const assembler = new YUpdateAssembler();
    assembler.accept(metadata);
    assembler.accept(second);
    assembler.accept(first);
    expect(assembler.accept(complete)).toEqual(update);
  });

  it("rejects incomplete, malformed, and oversized transfers", () => {
    const assembler = new YUpdateAssembler();
    expect(assembler.accept({ type: "y-update-metadata", updateId: "bad", size: 10, chunks: 99 })).toBeNull();
    expect(assembler.accept({ type: "y-update-complete", updateId: "bad" })).toBeNull();
    expect(() => splitYUpdate(new Uint8Array(MAX_Y_UPDATE_BYTES + 1), "too-large")).toThrow(/50 MB/);
  });
});
