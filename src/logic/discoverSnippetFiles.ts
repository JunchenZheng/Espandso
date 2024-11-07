import { readDir } from "@tauri-apps/plugin-fs";
import { FileTreeItem } from "./types";

/**
 * Recursively builds a tree of JSON snippet files inside the snippets/ directory.
 * @param dirPath Absolute path to the directory (e.g. /path/to/repo/snippets)
 * @param basePath Relative path from the snippets root
 */
export async function buildSnippetTree(
  dirPath: string,
  basePath: string = ""
): Promise<FileTreeItem[]> {
  try {
    const entries = await readDir(dirPath);
    const items: FileTreeItem[] = [];

    for (const entry of entries) {
      if (entry.name.startsWith(".")) {
        continue; // Skip hidden files/directories
      }

      const fullPath = `${dirPath}/${entry.name}`;
      const relPath = basePath ? `${basePath}/${entry.name}` : entry.name;

      if (entry.isDirectory) {
        const children = await buildSnippetTree(fullPath, relPath);
        if (children.length > 0) {
          items.push({
            name: entry.name,
            path: relPath,
            isDir: true,
            children,
          });
        }
      } else if (entry.isFile && entry.name.endsWith(".json")) {
        items.push({
          name: entry.name,
          path: relPath,
          isDir: false,
        });
      }
    }

    // Sort: directories first, then alphabetically
    items.sort((a, b) => {
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      return a.name.localeCompare(b.name);
    });

    return items;
  } catch (e) {
    console.error(`Failed to build snippet tree for ${dirPath}:`, e);
    return [];
  }
}
