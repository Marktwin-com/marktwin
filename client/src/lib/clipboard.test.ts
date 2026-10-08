import { afterEach, describe, expect, it, vi } from "vitest";

import { copyText } from "./clipboard";

describe("copyText", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("waits for the Clipboard API to complete", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    await copyText("private link");
    expect(writeText).toHaveBeenCalledWith("private link");
  });

  it("falls back when Clipboard API permission is rejected", async () => {
    const remove = vi.fn();
    const textarea = { value: "", readOnly: false, style: {}, setAttribute: vi.fn(), focus: vi.fn(), select: vi.fn(), setSelectionRange: vi.fn(), remove };
    const execCommand = vi.fn().mockReturnValue(true);
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    vi.stubGlobal("document", {
      createElement: vi.fn().mockReturnValue(textarea),
      body: { appendChild: vi.fn() },
      execCommand,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    await copyText("HTTP link");
    expect(textarea.value).toBe("HTTP link");
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(remove).toHaveBeenCalled();
  });
});
