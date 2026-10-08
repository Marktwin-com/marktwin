import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import path from "node:path";
const publicDir = path.resolve("dist/public");
const manifest = JSON.parse(await readFile(path.join(publicDir, ".vite/manifest.json"), "utf8"));
const entry = manifest["index.html"];
if (!entry?.file) throw new Error("Missing production client entry.");
const eager = new Set();
function visit(key) {
  if (eager.has(key)) return;
  eager.add(key);
  for (const imported of manifest[key]?.imports || []) visit(imported);
}
visit("index.html");
let gzipBytes = 0;
for (const key of eager) {
  if (/workspace-vault|workspace-drawing-editor|workspace-canvas-editor/.test(key)) throw new Error(`Workspace editor loaded eagerly: ${key}`);
  gzipBytes += gzipSync(await readFile(path.join(publicDir, manifest[key].file)), { level: 9 }).byteLength;
}
if (gzipBytes > 150 * 1024) throw new Error(`Initial JavaScript is ${(gzipBytes / 1024).toFixed(1)} KiB gzip; budget is 150 KiB.`);
if (![...eager].some(key => (manifest[key].dynamicImports || []).some(imported => imported.includes("workspace-vault")))) throw new Error("Workspace route must remain lazy.");
console.log(`Initial JavaScript: ${(gzipBytes / 1024).toFixed(1)} KiB gzip across ${eager.size} chunks; workspace route remains lazy.`);
