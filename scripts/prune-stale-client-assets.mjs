import { readdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";

const publicDir = path.resolve("dist/public");
const assetsDir = path.join(publicDir, "assets");
const manifestPath = path.join(publicDir, ".vite", "manifest.json");
const retentionMs = 7 * 24 * 60 * 60 * 1000;
const oldestAllowedMtime = Date.now() - retentionMs;

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const currentAssets = new Set();

for (const entry of Object.values(manifest)) {
  for (const file of [entry.file, ...(entry.css ?? []), ...(entry.assets ?? [])]) {
    if (typeof file === "string" && file.startsWith("assets/")) {
      currentAssets.add(path.basename(file));
    }
  }
}

let removed = 0;
for (const directoryEntry of await readdir(assetsDir, { withFileTypes: true })) {
  if (!directoryEntry.isFile() || currentAssets.has(directoryEntry.name)) continue;

  const assetPath = path.join(assetsDir, directoryEntry.name);
  if ((await stat(assetPath)).mtimeMs >= oldestAllowedMtime) continue;

  await rm(assetPath);
  removed += 1;
}

if (removed > 0) {
  console.log(`Removed ${removed} client assets older than seven days.`);
}
