import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

const host = process.env.TAURI_DEV_HOST;
const docsScreenshotMode = process.env.VITE_EXPANDSO_DOCS_SCREENSHOTS === "1";
const docsTauriMock = resolve(__dirname, "src/test/docsTauriMocks.ts");

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],
  resolve: docsScreenshotMode
    ? {
        alias: {
          "@tauri-apps/api/core": docsTauriMock,
          "@tauri-apps/api/event": docsTauriMock,
          "@tauri-apps/api/path": docsTauriMock,
          "@tauri-apps/plugin-dialog": docsTauriMock,
          "@tauri-apps/plugin-fs": docsTauriMock,
          "@tauri-apps/plugin-opener": docsTauriMock,
          "@tauri-apps/plugin-shell": docsTauriMock,
          "@tauri-apps/plugin-store": docsTauriMock,
        },
      }
    : undefined,
  build: {
    outDir: "dist-gui",
    emptyOutDir: true,
  },
  optimizeDeps: docsScreenshotMode
    ? {
        entries: ["index.html"],
      }
    : undefined,
  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
