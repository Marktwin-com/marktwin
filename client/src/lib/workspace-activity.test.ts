import { describe, expect, it } from "vitest";

import type { WorkspaceActivity } from "@shared/schema";
import { workspaceActivityPresentation } from "./workspace-activity";

const base = {
  id: "activity-one",
  actor: { sessionId: "session", displayName: "Person", color: "#000", role: "owner" as const },
  timestamp: 1,
};

describe("workspace activity presentation", () => {
  it("maps semantic records to locale-independent message keys", () => {
    expect(workspaceActivityPresentation({ ...base, operationCode: "file.created", params: { fileType: "canvas" } })).toEqual({
      key: "activity.fileCreated",
      params: { fileType: "canvas" },
    });
  });

  it("keeps legacy operation text readable without rewriting it", () => {
    const legacy: WorkspaceActivity = { ...base, operation: "moved file" };
    expect(workspaceActivityPresentation(legacy)).toEqual({ legacy: "moved file" });
  });
});
