type EventHandler<T = unknown> = (event: { payload: T }) => void | Promise<void>;

const matchDir = "/tmp/expandso-docs/espanso-config/match";
const configDir = "/tmp/expandso-docs/espanso-config";
const files = new Map<string, string>();
const directories = new Set<string>();
const listeners = new Map<string, Set<EventHandler>>();

function normalizePath(path: string) {
  return path.replace(/\/+$/u, "") || "/";
}

function ensureDir(path: string) {
  const normalized = normalizePath(path);
  directories.add(normalized);
  if (normalized === "/") return;
  ensureDir(normalized.slice(0, normalized.lastIndexOf("/")) || "/");
}

function seedFile(path: string, content: string) {
  const normalized = normalizePath(path);
  ensureDir(normalized.slice(0, normalized.lastIndexOf("/")) || "/");
  files.set(normalized, content);
}

function getFixtureScenario() {
  if (typeof window === "undefined") return "docs-basic";
  return new URLSearchParams(window.location.search).get("fixture") || "docs-basic";
}

function seedFixture() {
  files.clear();
  directories.clear();
  ensureDir(matchDir);
  ensureDir(`${matchDir}/writing`);
  ensureDir(`${matchDir}/media`);

  const scenario = getFixtureScenario();
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

  seedFile(`${matchDir}/base.yml`, ["matches:", ...baseMatches, ""].join("\n"));
  seedFile(
    `${matchDir}/work.yml`,
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
  seedFile(
    `${matchDir}/writing/email.yml`,
    [
      "matches:",
      "  - trigger: :followup",
      "    replace: Just following up on our conversation.",
      "    description: Follow-up sentence",
      "",
    ].join("\n"),
  );
  seedFile(
    `${matchDir}/writing/meetings.yml`,
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
  seedFile(
    `${matchDir}/media/images.yml`,
    [
      "matches:",
      "  - trigger: :logo",
      "    image_path: /tmp/expandso-docs/logo-placeholder.png",
      "    description: Demo image snippet",
      "  - trigger: :bio",
      "    include_file: /tmp/expandso-docs/profile.txt",
      "    description: Demo external text resource",
      "",
    ].join("\n"),
  );
}

seedFixture();

function listChildren(path: string) {
  const normalized = normalizePath(path);
  const prefix = normalized === "/" ? "/" : `${normalized}/`;
  const childNames = new Set<string>();

  for (const directory of directories) {
    if (!directory.startsWith(prefix) || directory === normalized) continue;
    const rest = directory.slice(prefix.length);
    if (rest && !rest.includes("/")) childNames.add(rest);
  }

  for (const filePath of files.keys()) {
    if (!filePath.startsWith(prefix)) continue;
    const rest = filePath.slice(prefix.length);
    if (rest && !rest.includes("/")) childNames.add(rest);
  }

  return Array.from(childNames)
    .sort((a, b) => a.localeCompare(b))
    .map((name) => {
      const fullPath = normalized === "/" ? `/${name}` : `${normalized}/${name}`;
      return {
        name,
        isDirectory: directories.has(fullPath),
        isFile: files.has(fullPath),
      };
    });
}

function getTriggerSources() {
  const sources: Array<{
    trigger: string;
    configPath: string;
    relativePath: string;
    snippetIndex: number;
    triggerIndex: number;
  }> = [];

  for (const [filePath, content] of files.entries()) {
    if (!filePath.startsWith(`${matchDir}/`)) continue;
    const relativePath = filePath.slice(matchDir.length + 1);
    let snippetIndex = -1;

    for (const line of content.split(/\r?\n/u)) {
      if (/^\s*-\s+/u.test(line)) snippetIndex += 1;
      const trigger = line.match(/^\s*(?:-\s*)?trigger:\s*["']?([^"'\n]+)["']?\s*$/u);
      if (trigger) {
        if (snippetIndex < 0) snippetIndex = 0;
        sources.push({
          trigger: trigger[1].trim(),
          configPath: filePath,
          relativePath,
          snippetIndex,
          triggerIndex: 0,
        });
      }
    }
  }

  return sources;
}

function searchResults(query: string) {
  const lowerQuery = query.toLowerCase();
  return getTriggerSources()
    .filter((source) => source.trigger.toLowerCase().includes(lowerQuery))
    .map((source) => ({
      filePath: source.configPath,
      fileRelativePath: source.relativePath,
      filename: source.relativePath.split("/").pop() || source.relativePath,
      snippet: { trigger: source.trigger, replace: "Demo result", description: "Documentation fixture" },
      snippetIndex: source.snippetIndex,
      originalMatchIndex: source.snippetIndex,
      triggerIndex: source.triggerIndex,
      matchedFields: ["trigger"],
    }));
}

export async function readDir(path: string) {
  return listChildren(path);
}

export async function readTextFile(path: string) {
  const normalized = normalizePath(path);
  const content = files.get(normalized);
  if (content === undefined) throw new Error(`File not found: ${path}`);
  return content;
}

export async function writeTextFile(path: string, content: string) {
  seedFile(path, content);
}

export async function mkdir(path: string) {
  ensureDir(path);
}

export async function readFile(path: string) {
  return new TextEncoder().encode(await readTextFile(path));
}

export async function exists(path: string) {
  const normalized = normalizePath(path);
  return files.has(normalized) || directories.has(normalized);
}

export async function invoke(command: string, args?: any) {
  if (command === "set_app_language" || command === "mark_search_index_internal_write") {
    return undefined;
  }

  if (
    command === "start_search_index_sync" ||
    command === "refresh_search_index_file" ||
    command === "get_search_index_status"
  ) {
    return {
      state: "ready",
      indexedFiles: files.size,
      totalFiles: files.size,
      indexedMatches: getTriggerSources().length,
    };
  }

  if (command === "search_snippet_index") {
    const results = searchResults(args?.request?.query || "");
    return {
      results,
      total: results.length,
      indexStatus: {
        state: "ready",
        indexedFiles: files.size,
        totalFiles: files.size,
        indexedMatches: getTriggerSources().length,
      },
    };
  }

  if (command === "detect_trigger_prefix_conflicts") {
    const sources = getTriggerSources();
    const conflicts = [];
    for (const blocking of sources) {
      for (const blocked of sources) {
        if (blocking.trigger === blocked.trigger) continue;
        if (!blocked.trigger.startsWith(blocking.trigger)) continue;
        conflicts.push({ blocking, blocked });
      }
    }
    return {
      conflicts,
      indexStatus: {
        state: "ready",
        indexedFiles: files.size,
        totalFiles: files.size,
        indexedMatches: sources.length,
      },
    };
  }

  return undefined;
}

export async function listen(eventName: string, handler: EventHandler) {
  if (!listeners.has(eventName)) listeners.set(eventName, new Set());
  listeners.get(eventName)!.add(handler);
  return () => listeners.get(eventName)?.delete(handler);
}

export async function homeDir() {
  return "/tmp/expandso-docs/home";
}

export async function tempDir() {
  return "/tmp";
}

export const Command = {
  create: () => ({
    execute: async () => ({
      code: 0,
      stdout: `Config: ${configDir}\nPackages: ${configDir}/packages\n`,
      stderr: "",
    }),
  }),
};

export async function openPath() {
  return undefined;
}

export async function openUrl() {
  return undefined;
}

export async function open() {
  return null;
}

export async function save() {
  return null;
}

export async function load() {
  return {
    get: async (key: string) => window.localStorage.getItem(key),
    set: async (key: string, value: unknown) => window.localStorage.setItem(key, String(value)),
    save: async () => undefined,
  };
}
