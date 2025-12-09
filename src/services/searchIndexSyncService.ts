import { listen } from "@tauri-apps/api/event";

import {
  markSearchIndexInternalWrite,
  refreshSearchIndexFile,
  startSearchIndexSync,
  startSearchIndexWatcher,
  stopSearchIndexWatcher,
} from "../tauri/searchIndex";

export function syncSearchIndex(matchDir: string): void {
  startSearchIndexSync(matchDir).catch((error) => {
    console.warn("Background SQLite search indexing failed:", error);
  });
}

export async function markSearchIndexWrite(filePath: string): Promise<void> {
  await markSearchIndexInternalWrite(filePath);
}

export function refreshSearchIndexForFile(filePath: string, matchDir: string): void {
  refreshSearchIndexFile(filePath, matchDir).catch((error) => {
    console.warn("Index refresh failed:", error);
  });
}

export async function startSearchIndexFileWatcher(matchDir: string): Promise<void> {
  await startSearchIndexWatcher(matchDir);
}

export async function stopSearchIndexFileWatcher(): Promise<void> {
  await stopSearchIndexWatcher();
}

export interface SearchIndexEventHandlers {
  onStatusChanged: () => void;
  onWatchError: (message: string) => void;
}

export async function subscribeSearchIndexEvents(
  handlers: SearchIndexEventHandlers,
): Promise<() => void> {
  const [statusUnlisten, errorUnlisten] = await Promise.all([
    listen("search-index-status-changed", handlers.onStatusChanged),
    listen<string>("search-index-watch-error", (event) => {
      handlers.onWatchError(event.payload);
    }),
  ]);

  return () => {
    statusUnlisten();
    errorUnlisten();
  };
}
