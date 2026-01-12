import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.integration.test.ts", "src/**/*.integration.test.tsx"],
    setupFiles: ["src/test/integration/setup.ts"],
  },
});
