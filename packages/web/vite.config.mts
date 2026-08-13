import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const rootDir = import.meta.dirname;

export default defineConfig({
  root: path.resolve(rootDir),
  plugins: [react()],
  css: {
    postcss: {
      plugins: [],
    },
  },
  build: {
    outDir: path.resolve(rootDir, "dist"),
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    proxy: {
      "/api": "http://127.0.0.1:8787",
    },
  },
});
