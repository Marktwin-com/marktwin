import { assetMimeTypeForFile, assetMimeTypeForPath } from "./workspace-github";

export const MAX_WORKSPACE_ASSET_BYTES = 25 * 1024 * 1024;

export type WorkspaceAssetPreviewKind = "image" | "video" | "audio" | "pdf" | "download";

export function workspaceAssetMimeType(path: string) {
  return assetMimeTypeForPath(path);
}

export function isSupportedWorkspaceAsset(file: Pick<File, "name" | "type">) {
  return Boolean(assetMimeTypeForFile(file));
}

export function filenameForDroppedAsset(file: Pick<File, "name">) {
  const basename = file.name.replace(/\\/g, "/").split("/").pop()?.trim() || "asset";
  const safeName = basename.replace(/[^A-Za-z0-9._ -]+/g, "-").replace(/^\.+/, "") || "asset";
  return assetMimeTypeForPath(safeName) ? safeName : "asset.bin";
}

export function workspaceAssetPreviewKind(path: string): WorkspaceAssetPreviewKind {
  const mimeType = workspaceAssetMimeType(path) || "";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType === "application/pdf") return "pdf";
  return "download";
}

export function workspaceAssetDataUrl(content: string, path: string) {
  const mimeType = workspaceAssetMimeType(path);
  return mimeType ? `data:${mimeType};base64,${content.replace(/\s/g, "")}` : null;
}
