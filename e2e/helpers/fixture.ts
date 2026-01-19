import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const e2eTmpDir = resolve(tmpdir(), "expandso-e2e");

export const e2ePaths = {
  matchDir: resolve(e2eTmpDir, "espanso-config/match"),
  baseYaml: resolve(e2eTmpDir, "espanso-config/match/base.yml"),
};

export function readBaseYaml() {
  return readFileSync(e2ePaths.baseYaml, "utf8");
}
