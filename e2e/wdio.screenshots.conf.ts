import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { seedDocsScreenshotFiles, docsFixturePaths } from "./helpers/docsFixture";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appBinaryPath = resolve(repoRoot, "src-tauri/target/debug/expandso");

seedDocsScreenshotFiles();
process.env.PATH = `${docsFixturePaths.fakeBinDir}:${process.env.PATH || ""}`;
process.env.EXPANDSO_E2E_MATCH_DIR = docsFixturePaths.matchDir;

export const config = {
  runner: "local",
  specs: ["./specs/docs-screenshots.e2e.ts"],
  maxInstances: 1,
  services: [
    [
      "@wdio/tauri-service",
      {
        appBinaryPath,
        driverProvider: "embedded",
        embeddedPort: 4446,
        startTimeout: 90000,
        captureBackendLogs: true,
        captureFrontendLogs: true,
        logLevel: "info",
      },
    ],
  ],
  capabilities: [
    {
      browserName: "tauri",
      "tauri:options": {
        application: appBinaryPath,
      },
    },
  ],
  logLevel: "info",
  bail: 0,
  waitforTimeout: 10000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 2,
  framework: "mocha",
  reporters: ["spec"],
  mochaOpts: {
    ui: "bdd",
    timeout: 180000,
  },
};
