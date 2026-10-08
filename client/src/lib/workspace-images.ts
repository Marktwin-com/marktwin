import type { WorkspaceNote } from "./cabinet-files";
import { normalizeDirectoryPath, normalizeRepositoryPath } from "./cabinet-files";
import { imageExtensionForMimeType, imageMimeTypeForPath } from "./workspace-github";

export const MAX_REPOSITORY_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_SESSION_CACHE_BYTES = 50 * 1024 * 1024;
export const FIGURES_FOLDER = ".marktwin/figures";

export function isFiguresFolderPath(path: string) {
  const normalized = normalizeRepositoryPath(path).toLocaleLowerCase("en-US");
  const figures = FIGURES_FOLDER.toLocaleLowerCase("en-US");
  return normalized === figures || normalized.startsWith(`${figures}/`) || normalized.endsWith(`/${figures}`) || normalized.includes(`/${figures}/`);
}

export function isSupportedImageFile(file: File) {
  const type = file.type.toLowerCase().split(";", 1)[0];
  if (type) return type.startsWith("image/") && imageMimeTypeForPath(`file${imageExtensionForMimeType(type)}`) === type;
  return Boolean(imageMimeTypeForPath(file.name));
}

export function filenameForDroppedImage(file: File) {
  const basename = file.name.replace(/\\/g, "/").split("/").pop()?.trim() || "image";
  const safeName = basename.replace(/[^A-Za-z0-9._ -]+/g, "-").replace(/^\.+/, "") || "image";
  const type = file.type.toLowerCase().split(";", 1)[0];
  if (imageMimeTypeForPath(safeName) && (!type || imageMimeTypeForPath(safeName) === type)) return safeName;
  return `${safeName.replace(/\.[^./]+$/, "")}${imageExtensionForMimeType(type)}`;
}

export async function fileToBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string) {
  const binary = atob(base64.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function imageDataUrl(content: string, path: string) {
  const mimeType = imageMimeTypeForPath(path);
  return mimeType ? `data:${mimeType};base64,${content}` : null;
}

export function relativeRepositoryAssetPath(note: WorkspaceNote, targetPath: string) {
  const notePath = note.path === "/" ? note.filename : `${note.path}${note.filename}`;
  const sourceDirectory = normalizeRepositoryPath(notePath).split("/").slice(0, -1).filter(Boolean);
  const targetParts = normalizeRepositoryPath(targetPath).split("/").filter(Boolean);
  let common = 0;
  while (common < sourceDirectory.length && common < targetParts.length && sourceDirectory[common] === targetParts[common]) common += 1;
  return [...sourceDirectory.slice(common).map(() => ".."), ...targetParts.slice(common)].join("/") || targetParts[targetParts.length - 1] || targetPath;
}

export function resolveRepositoryImagePath(note: WorkspaceNote, source: string) {
  if (!source || /^(https?:|data:|blob:)/i.test(source)) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(source.split(/[?#]/, 1)[0]);
  } catch {
    throw new Error("Image path is malformed.");
  }
  const sourceParts = decoded.replace(/\\/g, "/").split("/");
  if (sourceParts.some((part) => part === ".." || part === ".")) throw new Error("Image paths cannot traverse repository folders.");
  const directory = normalizeDirectoryPath(note.path) === "/" ? "" : normalizeDirectoryPath(note.path);
  return normalizeRepositoryPath(`${directory}${decoded.replace(/^\/+/, "")}`);
}
