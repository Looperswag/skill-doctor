import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "../../packages/cli/dist/clinic",
    emptyOutDir: true
  }
});
