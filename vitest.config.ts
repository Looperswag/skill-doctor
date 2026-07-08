import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node"
  },
  resolve: {
    alias: {
      "@skill-doctor/core": resolve(root, "packages/core/src/index.ts")
    }
  }
});
