import { describe, expect, it, vi } from "vitest";

import { requestLogLine } from "../../../server/request-log";

describe("request metadata logging", () => {
  it("uses the parsed path and never emits query secrets", () => {
    const request = {
      method: "GET",
      path: "/join",
      url: "/join?token=VERY_SECRET",
      originalUrl: "/join?token=VERY_SECRET",
    };
    const line = requestLogLine(request as never, new Date("2026-08-17T12:00:00.000Z"));
    expect(line).toContain("GET /join");
    expect(line).not.toContain("VERY_SECRET");
    expect(line).not.toContain("token=");
  });

});
