import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
 resolve: { alias: { "@": path.resolve(import.meta.dirname, "client/src"), "@shared": path.resolve(import.meta.dirname, "shared") } },
 test: { include: ["client/src/**/*.test.ts", "shared/**/*.test.ts"], environment: "node" },
});
