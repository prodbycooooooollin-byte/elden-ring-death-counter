import { resolve } from "node:path";
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  main: {
    build: { externalizeDeps: true },
  },
  preload: {
    build: { externalizeDeps: true },
  },
  renderer: {
    root: "src/renderer",
    resolve: { alias: { "@": resolve("src/renderer/src") } },
    plugins: [react(), tailwindcss()],
    build: { rollupOptions: { input: resolve("src/renderer/index.html") } },
  },
});
