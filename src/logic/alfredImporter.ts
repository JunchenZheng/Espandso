import JSZip from "jszip";

export interface ParsedAlfredSnippet {
  id: string;
  trigger: string;
  replace: string;
  name?: string;
  jsonPath: string;
}

export interface AlfredInfoPlist {
  snippetkeywordprefix?: string;
  snippetkeywordsuffix?: string;
}

export function unescapeXml(str: string): string {
  return str
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * Parses an Alfred info.plist XML file to extract snippet keyword prefix and suffix.
 */
export function parseAlfredInfoPlist(xmlContent: string): AlfredInfoPlist {
  const getKeyString = (keyName: string): string => {
    const regex = new RegExp(
      `<key>\\s*${keyName}\\s*<\\/key>\\s*(?:<string>([\\s\\S]*?)<\\/string>|<string\\s*\\/>)`,
      "i",
    );
    const match = xmlContent.match(regex);
    if (!match) return "";
    const rawVal = match[1] ?? "";
    return unescapeXml(rawVal);
  };

  return {
    snippetkeywordprefix: getKeyString("snippetkeywordprefix"),
    snippetkeywordsuffix: getKeyString("snippetkeywordsuffix"),
  };
}

/**
 * Parses a .alfredsnippets zip buffer and extracts valid snippet entries.
 * Does not modify the source archive.
 */
export function parseAlfredSnippetsZip(
  data: Uint8Array | ArrayBuffer,
): Promise<ParsedAlfredSnippet[]> {
  return JSZip.loadAsync(data).then(async (zip) => {
    const results: ParsedAlfredSnippet[] = [];

    let prefix = "";
    let suffix = "";

    // Look for info.plist file (ignoring macOS system hidden files ._*)
    const plistEntry = Object.entries(zip.files).find(([path, file]) => {
      if (file.dir) return false;
      const fileName = path.split("/").pop() || "";
      return fileName.toLowerCase() === "info.plist" && !fileName.startsWith("._");
    });

    if (plistEntry) {
      try {
        const plistText = await plistEntry[1].async("string");
        const info = parseAlfredInfoPlist(plistText);
        prefix = info.snippetkeywordprefix || "";
        suffix = info.snippetkeywordsuffix || "";
      } catch {
        // Ignore info.plist parsing errors gracefully
      }
    }

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
          const rawKeyword = typeof raw.keyword === "string" ? raw.keyword : "";
          const trigger = rawKeyword ? `${prefix}${rawKeyword}${suffix}` : "";
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
  });
}
