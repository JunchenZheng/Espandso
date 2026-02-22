import { vi } from "vitest";

type EventHandler<T = unknown> = (event: { payload: T }) => void | Promise<void>;

interface FileSystemSeed {
  matchDir?: string;
  files?: Record<string, string>;
  directories?: string[];
}

const normalizePath = (path: string) => path.replace(/\/+$/u, "") || "/";

const harnessState = vi.hoisted(() => {
  const matchDirDefault = "/tmp/expandso-integration/config/match";
  const files = new Map<string, string>();
  const directories = new Set<string>();
  const store = new Map<string, unknown>();
  const listeners = new Map<string, Set<EventHandler>>();
  let matchDir = matchDirDefault;

  function ensureDir(path: string) {
    const normalized = normalizePath(path);
    directories.add(normalized);

    if (normalized === "/") return;
    const parent = normalized.slice(0, normalized.lastIndexOf("/")) || "/";
    if (!directories.has(parent)) {
      ensureDir(parent);
    }
  }

  function seedFile(path: string, content: string) {
    const normalized = normalizePath(path);
    const parent = normalized.slice(0, normalized.lastIndexOf("/")) || "/";
    ensureDir(parent);
    files.set(normalized, content);
  }

  function reset(seed: FileSystemSeed = {}) {
    files.clear();
    directories.clear();
    store.clear();
    listeners.clear();
    matchDir = normalizePath(seed.matchDir || matchDirDefault);
    ensureDir(matchDir);

    for (const directory of seed.directories || []) {
      ensureDir(directory);
    }

    for (const [path, content] of Object.entries(seed.files || {})) {
      seedFile(path, content);
    }

    invoke.mockClear();
    readDir.mockClear();
    readTextFile.mockClear();
    writeTextFile.mockClear();
    mkdir.mockClear();
    readFile.mockClear();
    exists.mockClear();
    openPath.mockClear();
    openDialog.mockClear();
    saveDialog.mockClear();
  }

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

  const readDir = vi.fn(async (path: string) => listChildren(path));
  const readTextFile = vi.fn(async (path: string) => {
    const normalized = normalizePath(path);
    if (!files.has(normalized)) {
      throw new Error(`File not found: ${path}`);
    }
    return files.get(normalized)!;
  });
  const writeTextFile = vi.fn(async (path: string, content: string) => {
    seedFile(path, content);
  });
  const mkdir = vi.fn(async (path: string) => {
    ensureDir(path);
  });
  const readFile = vi.fn(async (path: string) => {
    const content = await readTextFile(path);
    return new TextEncoder().encode(content);
  });
  const exists = vi.fn(async (path: string) => {
    const normalized = normalizePath(path);
    return files.has(normalized) || directories.has(normalized);
  });
  const openPath = vi.fn(async () => undefined);
  const openDialog = vi.fn(async () => null);
  const saveDialog = vi.fn(async () => null);

  function getIndexedTriggerSources() {
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
      const lines = content.split(/\r?\n/u);
      let snippetIndex = -1;

      for (const line of lines) {
        if (/^\s*-\s+/u.test(line)) {
          snippetIndex += 1;
        }

        const single = line.match(/^\s*-\s*trigger:\s*["']?([^"'\n]+)["']?\s*$/u);
        if (single) {
          if (snippetIndex < 0) snippetIndex = 0;
          sources.push({
            trigger: single[1].trim(),
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

  const invoke = vi.fn(async (command: string, args?: any) => {
    if (
      command === "set_app_language" ||
      command === "mark_search_index_internal_write" ||
      command === "start_search_index_watcher" ||
      command === "stop_search_index_watcher"
    ) {
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
        indexedMatches: 0,
      };
    }

    if (command === "search_snippet_index") {
      return {
        results: [],
        total: 0,
        indexStatus: {
          state: "ready",
          indexedFiles: files.size,
          totalFiles: files.size,
          indexedMatches: 0,
        },
      };
    }

    if (command === "detect_trigger_prefix_conflicts") {
      const localTriggers = args?.request?.localTriggers || [];
      const indexedSources = getIndexedTriggerSources();
      const conflicts: Array<{ blocking: any; blocked: any }> = [];
      const seenPairs = new Set<string>();

      for (const local of localTriggers) {
        for (const indexed of indexedSources) {
          if (local.trigger === indexed.trigger) continue;

          const conflict = indexed.trigger.startsWith(local.trigger)
            ? { blocking: local, blocked: indexed }
            : local.trigger.startsWith(indexed.trigger)
              ? { blocking: indexed, blocked: local }
              : null;

          if (!conflict) continue;
          const pairKey = [
            conflict.blocking.trigger,
            conflict.blocking.configPath,
            conflict.blocking.snippetIndex,
            conflict.blocked.trigger,
            conflict.blocked.configPath,
            conflict.blocked.snippetIndex,
          ].join("\0");
          if (seenPairs.has(pairKey)) continue;
          seenPairs.add(pairKey);
          conflicts.push(conflict);
        }
      }

      return {
        conflicts,
        indexStatus: {
          state: "ready",
          indexedFiles: files.size,
          totalFiles: files.size,
          indexedMatches: indexedSources.length,
        },
      };
    }

    return undefined;
  });

  const listen = vi.fn(async (eventName: string, handler: EventHandler) => {
    if (!listeners.has(eventName)) listeners.set(eventName, new Set());
    listeners.get(eventName)!.add(handler);
    return () => listeners.get(eventName)?.delete(handler);
  });

  async function emit<T>(eventName: string, payload: T) {
    for (const handler of listeners.get(eventName) || []) {
      await handler({ payload });
    }
  }

  return {
    files,
    directories,
    store,
    reset,
    seedFile,
    ensureDir,
    getMatchDir: () => matchDir,
    getFile: (path: string) => files.get(normalizePath(path)),
    readDir,
    readTextFile,
    writeTextFile,
    mkdir,
    readFile,
    exists,
    openPath,
    openDialog,
    saveDialog,
    invoke,
    listen,
    emit,
  };
});

export const tauriHarness = harnessState;

vi.mock("@tauri-apps/plugin-fs", () => ({
  readDir: harnessState.readDir,
  readTextFile: harnessState.readTextFile,
  writeTextFile: harnessState.writeTextFile,
  mkdir: harnessState.mkdir,
  readFile: harnessState.readFile,
  exists: harnessState.exists,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: harnessState.invoke,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: harnessState.listen,
}));

vi.mock("@tauri-apps/api/path", () => ({
  homeDir: vi.fn(async () => "/tmp/expandso-integration/home"),
  tempDir: vi.fn(async () => "/tmp"),
}));

vi.mock("@tauri-apps/plugin-shell", () => ({
  Command: {
    create: vi.fn(() => ({
      execute: vi.fn(async () => ({
        code: 0,
        stdout: "Config: /tmp/expandso-integration/config\nPackages: /tmp/expandso-integration/packages\n",
        stderr: "",
      })),
    })),
  },
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openPath: harnessState.openPath,
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: harnessState.openDialog,
  save: harnessState.saveDialog,
}));

vi.mock("@tauri-apps/plugin-store", () => ({
  load: vi.fn(async () => ({
    get: async (key: string) => harnessState.store.get(key),
    set: async (key: string, value: unknown) => {
      harnessState.store.set(key, value);
    },
    save: async () => undefined,
  })),
}));
