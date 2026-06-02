import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { isAbsolute, resolve } from "node:path";

const host = process.env.TAURI_DEV_HOST;
const externalTauriMockModule = process.env.EXPANDSO_TAURI_MOCK_MODULE;
const tauriMockModule = externalTauriMockModule
  ? isAbsolute(externalTauriMockModule)
    ? externalTauriMockModule
    : resolve(__dirname, externalTauriMockModule)
  : undefined;

const tauriMockAliases = tauriMockModule
  ? {
      "@tauri-apps/api/core": tauriMockModule,
      "@tauri-apps/api/event": tauriMockModule,
      "@tauri-apps/api/path": tauriMockModule,
      "@tauri-apps/plugin-dialog": tauriMockModule,
      "@tauri-apps/plugin-fs": tauriMockModule,
      "@tauri-apps/plugin-opener": tauriMockModule,
      "@tauri-apps/plugin-shell": tauriMockModule,
      "@tauri-apps/plugin-store": tauriMockModule,
    }
  : undefined;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],
  resolve: tauriMockAliases
    ? {
        alias: tauriMockAliases,
      }
    : undefined,
  build: {
    outDir: "dist-gui",
    emptyOutDir: true,
  },
  optimizeDeps: tauriMockAliases
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
