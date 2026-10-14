import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
export default defineConfig({
  plugins: [react()],
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
