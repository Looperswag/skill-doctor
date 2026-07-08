import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    exclude: ["**/node_modules/**", "**/dist/**", "**/dist-types/**"]
  },
  resolve: {
    alias: {
      "@skill-doctor/core": resolve(root, "packages/core/src/index.ts")
    }
  }
});
