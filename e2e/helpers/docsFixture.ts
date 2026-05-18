import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const e2eTmpDir = resolve(tmpdir(), "expandso-e2e");
const configDir = resolve(e2eTmpDir, "espanso-config");
const matchDir = resolve(configDir, "match");
const fakeBinDir = resolve(e2eTmpDir, "bin");

export type DocsFixtureScenario = "docs-basic" | "docs-conflicts";

export const docsFixturePaths = {
  e2eTmpDir,
  configDir,
  matchDir,
  fakeBinDir,
};

export function seedDocsScreenshotFiles(scenario: DocsFixtureScenario = "docs-basic") {
  rmSync(e2eTmpDir, { force: true, recursive: true });
  mkdirSync(resolve(matchDir, "writing"), { recursive: true });
  mkdirSync(resolve(matchDir, "media"), { recursive: true });
  mkdirSync(fakeBinDir, { recursive: true });

  const baseMatches =
    scenario === "docs-conflicts"
      ? [
          "  - trigger: :meet",
          "    replace: Meeting starts at 10:00.",
          "    description: Short meeting note",
          "  - trigger: :meeting",
          "    replace: Meeting notes template",
          "    description: Longer trigger blocked by :meet",
        ]
      : [
          "  - trigger: :hello",
          "    replace: Hello, thanks for reaching out.",
          "    description: Friendly greeting",
          "  - trigger: :sig",
          "    replace: |",
          "      Taylor Morgan",
          "      Customer Success",
          "      Expandso Demo Team",
          "    description: Email signature",
          "  - triggers:",
          "      - :thanks",
          "      - :ty",
          "    replace: Thanks for your help.",
          "    description: Thank-you message",
        ];

  writeFileSync(resolve(matchDir, "base.yml"), ["matches:", ...baseMatches, ""].join("\n"));

  writeFileSync(
    resolve(matchDir, "work.yml"),
    [
      "matches:",
      "  - trigger: :addr",
      "    replace: 123 Example Street, Brisbane QLD 4000",
      "    description: Demo office address",
      "  - trigger: :meeting",
      "    replace: |",
      "      Agenda:",
      "      - Updates",
      "      - Decisions",
      "      - Next steps",
      "    description: Meeting notes outline",
      "",
    ].join("\n"),
  );

  writeFileSync(
    resolve(matchDir, "writing", "email.yml"),
    [
      "matches:",
      "  - trigger: :followup",
      "    replace: Just following up on our conversation.",
      "    description: Follow-up sentence",
      "",
    ].join("\n"),
  );

  writeFileSync(
    resolve(matchDir, "writing", "meetings.yml"),
    [
      "matches:",
      "  - trigger: :standup",
      "    form: |",
      "      Daily update:",
      "      [[notes]]",
      "    form_fields:",
      "      notes:",
      "        multiline: true",
      "    description: Daily standup form",
      "",
    ].join("\n"),
  );

  writeFileSync(
    resolve(matchDir, "media", "images.yml"),
    [
      "matches:",
      "  - trigger: :logo",
      "    image_path: /tmp/expandso-docs/logo-placeholder.png",
      "    description: Demo image snippet",
      "  - trigger: :bio",
      "    replace: file:///tmp/expandso-docs/profile.txt",
      "    description: Demo external text resource",
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
      "    printf 'expandso documentation screenshot log stub\\n'",
      "    ;;",
      "  *)",
      "    exit 0",
      "    ;;",
      "esac",
      "",
    ].join("\n"),
    { mode: 0o755 },
  );

  process.env.PATH = `${fakeBinDir}:${process.env.PATH || ""}`;
  process.env.EXPANDSO_E2E_MATCH_DIR = matchDir;
}
