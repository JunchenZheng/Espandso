import JSZip from "jszip";

export interface ParsedAlfredSnippet {
  id: string;
  trigger: string;
  replace: string;
  name?: string;
  jsonPath: string;
}

/**
 * Parses a .alfredsnippets zip buffer and extracts valid snippet entries.
 * Does not modify the source archive.
 */
export async function parseAlfredSnippetsZip(
  data: Uint8Array | ArrayBuffer,
): Promise<ParsedAlfredSnippet[]> {
  const zip = await JSZip.loadAsync(data);
  const results: ParsedAlfredSnippet[] = [];

  for (const [relativePath, file] of Object.entries(zip.files)) {
    if (file.dir) continue;
    const fileName = relativePath.split("/").pop() || "";
    // Filter out macOS hidden system metadata files and non-json files
    if (fileName.startsWith("._") || !fileName.toLowerCase().endsWith(".json")) {
      continue;
    }

    try {
      const contentText = await file.async("string");
      const json = JSON.parse(contentText);

      const raw = json?.alfredsnippet || json;
      if (
        raw &&
        typeof raw === "object" &&
        (typeof raw.keyword === "string" || typeof raw.snippet === "string")
      ) {
        const trigger = typeof raw.keyword === "string" ? raw.keyword : "";
        const replace = typeof raw.snippet === "string" ? raw.snippet : "";
        const name = typeof raw.name === "string" ? raw.name : undefined;
        const uid = typeof raw.uid === "string" ? raw.uid : undefined;

        if (trigger.length > 0 || replace.length > 0) {
          results.push({
            id: uid || `${relativePath}-${Math.random().toString(36).slice(2, 9)}`,
            trigger,
            replace,
            name,
            jsonPath: relativePath,
          });
        }
      }
    } catch {
      // Ignore corrupted json entries and continue
    }
  }

  return results;
}
