import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(new URL(import.meta.url).pathname), "../..");

export const e2ePaths = {
  matchDir: resolve(repoRoot, "e2e/.tmp/espanso-config/match"),
  baseYaml: resolve(repoRoot, "e2e/.tmp/espanso-config/match/base.yml"),
};

export function readBaseYaml() {
  return readFileSync(e2ePaths.baseYaml, "utf8");
}
