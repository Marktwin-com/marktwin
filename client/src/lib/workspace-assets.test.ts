import { describe, expect, it } from "vitest";

import { MAX_WORKSPACE_ASSET_BYTES, filenameForDroppedAsset, isSupportedWorkspaceAsset, workspaceAssetDataUrl, workspaceAssetPreviewKind } from "./workspace-assets";

describe("workspace assets", () => {
  it("recognizes supported repository-backed asset extensions", () => {
    expect(isSupportedWorkspaceAsset({ name: "clip.mp4", type: "" })).toBe(true);
    expect(isSupportedWorkspaceAsset({ name: "paper.pdf", type: "application/pdf" })).toBe(true);
    expect(isSupportedWorkspaceAsset({ name: "not-a-pdf.exe", type: "application/pdf" })).toBe(false);
    expect(isSupportedWorkspaceAsset({ name: "archive.exe", type: "application/octet-stream" })).toBe(false);
    expect(filenameForDroppedAsset({ name: "clips/launch demo.mp4" })).toBe("launch demo.mp4");
  });

  it("keeps the raw size limit explicit and creates typed previews", () => {
    expect(MAX_WORKSPACE_ASSET_BYTES).toBe(25 * 1024 * 1024);
    expect(workspaceAssetPreviewKind("clip.mp4")).toBe("video");
    expect(workspaceAssetPreviewKind("voice.mp3")).toBe("audio");
    expect(workspaceAssetPreviewKind("paper.pdf")).toBe("pdf");
    expect(workspaceAssetPreviewKind("data.zip")).toBe("download");
    expect(workspaceAssetDataUrl("AQI=", "clip.mp4")).toBe("data:video/mp4;base64,AQI=");
  });
});
