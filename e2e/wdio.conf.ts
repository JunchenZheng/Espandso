import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(new URL(import.meta.url).pathname), "..");
const e2eTmpDir = resolve(repoRoot, "e2e/.tmp");
const configDir = resolve(e2eTmpDir, "espanso-config");
const matchDir = resolve(configDir, "match");
const fakeBinDir = resolve(e2eTmpDir, "bin");
const appBinaryPath = resolve(repoRoot, "src-tauri/target/debug/expandso");

function seedE2eFiles() {
  rmSync(e2eTmpDir, { force: true, recursive: true });
  mkdirSync(matchDir, { recursive: true });
  mkdirSync(fakeBinDir, { recursive: true });

  writeFileSync(
    resolve(matchDir, "base.yml"),
    [
      "matches:",
      "  - trigger: :hello",
      "    replace: Hello from E2E",
      "    description: Greeting fixture",
      "  - trigger: :bye",
      "    replace: Goodbye from E2E",
      "    description: Farewell fixture",
      "",
    ].join("\n"),
  );

  writeFileSync(
    resolve(fakeBinDir, "espanso"),
    [
      "#!/bin/sh",
      "case \"$1\" in",
      "  path)",
      `    printf 'Config: ${configDir}\\nPackages: ${resolve(configDir, "packages")}\\n'`,
      "    ;;",
      "  restart)",
      "    exit 0",
      "    ;;",
      "  log)",
      "    printf 'expandso e2e espanso log stub\\n'",
      "    ;;",
      "  *)",
      "    exit 0",
      "    ;;",
      "esac",
      "",
    ].join("\n"),
    { mode: 0o755 },
  );
}

seedE2eFiles();
process.env.PATH = `${fakeBinDir}:${process.env.PATH || ""}`;
process.env.EXPANDSO_E2E_MATCH_DIR = matchDir;

export const config = {
  runner: "local",
  specs: ["./specs/**/*.e2e.ts"],
  maxInstances: 1,
  services: [
    [
      "@wdio/tauri-service",
      {
        appBinaryPath,
        driverProvider: "embedded",
        embeddedPort: 4445,
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
    timeout: 120000,
  },
};
