import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  root: "src/renderer",
  base: "./",
  build: {
    outDir: "../../dist/renderer",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        desktop: resolve(__dirname, "src/renderer/desktop/index.html"),
        overlay: resolve(__dirname, "src/renderer/overlay/index.html")
      }
    }
  }
});
