import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_TOAST_DURATION,
  DESTRUCTIVE_TOAST_DURATION,
  subscribeToToastState,
  toast,
} from "./use-toast";

describe("toast lifetime", () => {
  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
  });

  it("dismisses ordinary notifications after four seconds", () => {
    vi.useFakeTimers();
    let open: boolean | undefined;
    const unsubscribe = subscribeToToastState((state) => { open = state.toasts[0]?.open; });
    toast({ title: "Saved" });

    expect(open).toBe(true);
    vi.advanceTimersByTime(DEFAULT_TOAST_DURATION - 1);
    expect(open).toBe(true);
    vi.advanceTimersByTime(1);
    expect(open).toBe(false);
    unsubscribe();
  });

  it("keeps destructive notifications visible for eight seconds", () => {
    vi.useFakeTimers();
    let open: boolean | undefined;
    const unsubscribe = subscribeToToastState((state) => { open = state.toasts[0]?.open; });
    toast({ title: "Failed", variant: "destructive" });

    vi.advanceTimersByTime(DESTRUCTIVE_TOAST_DURATION - 1);
    expect(open).toBe(true);
    vi.advanceTimersByTime(1);
    expect(open).toBe(false);
    unsubscribe();
  });
});
