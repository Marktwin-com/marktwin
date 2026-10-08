import { describe, expect, it, vi } from "vitest";

import { getAvatarColor, getUserAvatarColor, IDENTITY_COLOR_PALETTE, resolveUserIdentity } from "./user-identity";

describe("user identity colors", () => {
  const whiteContrast = (hex: string) => {
    const channels = hex.slice(1).match(/.{2}/g)!.map((value) => {
      const channel = Number.parseInt(value, 16) / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    return 1.05 / (luminance + 0.05);
  };

  it("returns the same identity and color for the same stable account", () => {
    const first = resolveUserIdentity({ id: "account-42", username: "Alex" });
    const second = resolveUserIdentity({ id: "account-42", username: "Changed display name" });
    expect(second.stableId).toBe(first.stableId);
    expect(second.color).toBe(first.color);
  });

  it("distributes representative stable identities across the palette", () => {
    const colors = new Set(Array.from({ length: 32 }, (_, index) => getAvatarColor(`account-${index}`)));
    expect(colors.size).toBeGreaterThanOrEqual(6);
  });

  it("always returns a deliberate allowed palette color", () => {
    for (const value of ["owner", "USER@example.com", "用户", "مسافر", 12345]) {
      expect(IDENTITY_COLOR_PALETTE).toContain(getAvatarColor(value));
    }
  });

  it("keeps white avatar initials readable on every palette color", () => {
    for (const color of IDENTITY_COLOR_PALETTE) expect(whiteContrast(color)).toBeGreaterThanOrEqual(4.5);
  });

  it("uses the saved avatar background for collaboration colors", () => {
    expect(getUserAvatarColor({ colorIndex: 4 }, "#legacy")).toBe("hsl(340 82% 65%)");
    expect(getUserAvatarColor({ colorIndex: 99 }, "#legacy")).toBe("hsl(325 55% 45%)");
    expect(getUserAvatarColor(undefined, "#legacy")).toBe("#legacy");
  });

  it("ignores Cabinet and room context for authenticated accounts", () => {
    const account = { id: "stable-user-id", username: "Owner" };
    const cabinetA = resolveUserIdentity({ ...account, cabinetId: 1, roomId: "alpha" } as never);
    const cabinetB = resolveUserIdentity({ ...account, cabinetId: 99, roomId: "omega" } as never);
    expect(cabinetB.color).toBe(cabinetA.color);
  });

  it("does not require randomness", () => {
    const random = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("identity resolution must not use randomness");
    });
    expect(resolveUserIdentity({ id: "deterministic", email: "person@example.com" }).color).toBe(getAvatarColor("account:deterministic"));
    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
  });
});
