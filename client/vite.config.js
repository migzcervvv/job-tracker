import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { cpSync } from "node:fs";
import { join } from "node:path";
const pdfAssets = fileURLToPath(
  new URL("./node_modules/pdfjs-dist/", import.meta.url),
).replaceAll("\\", "/");
export default defineConfig({
  plugins: [
    react(),
    {
      name: "resume-pdf-assets",
      apply: "build",
      writeBundle({ dir }) {
        for (const directory of ["cmaps", "standard_fonts", "wasm"])
          cpSync(join(pdfAssets, directory), join(dir, "pdf", directory), {
            recursive: true,
          });
      },
    },
  ],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "animation",
              test: /node_modules\/(framer-motion|motion-dom|motion-utils)/,
            },
            { name: "drag", test: /node_modules\/@dnd-kit/ },
          ],
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.js"],
    restoreMocks: true,
    clearMocks: true,
  },
});
