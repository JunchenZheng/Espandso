import YAML from "yaml";
import { Snippet } from "./types";

export interface ImportedMatch {
  snippet: Snippet;
  originalSnippet?: Snippet;
  originalMatchIndex: number;
  resourcePath?: string; // Path of the resource file to be copied
  resourceName?: string; // New filename of the resource file
}

export interface ImportResult {
  snippets: Snippet[];
  importedMatches: ImportedMatch[];
  warnings: string[];
}

function getResourceFilename(srcName: string): string {
  const lowercase = srcName.toLowerCase();
  if (lowercase.endsWith(".json")) {
    const stem = srcName.slice(0, -5);
    return `${stem}_data.json`;
  }
  return srcName;
}

function extractCatPath(varsBlock: any[]): string | null {
  let echoPath: string | null = null;
  let shellCmd: string | null = null;

  for (const v of varsBlock) {
    const vtype = v?.type || "";
    const params = v?.params || {};
    if (vtype === "echo") {
      echoPath = params.echo || null;
    } else if (vtype === "shell") {
      shellCmd = params.cmd || null;
    }
  }

  if (echoPath) {
    return echoPath;
  }
  if (shellCmd) {
    const m = /cat\s+"([^"]+)"/.exec(shellCmd);
    if (m) {
      return m[1];
    }
  }
  return null;
}

function onlyCatVarTypes(varsBlock: any[]): boolean {
  const allowed = new Set(["echo", "shell"]);
  return varsBlock.every((v) => allowed.has(v?.type || ""));
}

export function parseYamlMatch(
  match: any,
  fileName: string,
  originalMatchIndex = -1
): { matches: ImportedMatch[]; warnings: string[] } {
  const warnings: string[] = [];
  let triggers: string[] = [];

  if (match.triggers !== undefined && match.triggers !== null) {
    triggers = Array.isArray(match.triggers)
      ? match.triggers.map((t: any) => String(t))
      : [String(match.triggers)];
  } else if (match.trigger !== undefined && match.trigger !== null) {
    triggers = [String(match.trigger)];
  } else {
    return { matches: [], warnings: [`[${fileName}] Match has no trigger, skipping`] };
  }

  const varsBlock = match.vars || [];

  if (varsBlock.length > 0) {
    if (!onlyCatVarTypes(varsBlock)) {
      const bad = varsBlock
        .map((v: any) => v?.type)
        .filter((t: string) => t !== "echo" && t !== "shell");
      return {
        matches: [],
        warnings: [
          `[${fileName}] Snippet for ${triggers.join(", ")} has unsupported var type(s) [${bad.join(", ")}], skipping`,
        ],
      };
    }

    const catPath = extractCatPath(varsBlock);
    if (!catPath) {
      return {
        matches: [],
        warnings: [
          `[${fileName}] Snippet for ${triggers.join(", ")} has shell vars but no cat/echo path, skipping`,
        ],
      };
    }

    // Extract file name
    const parts = catPath.split(/[/\\]/);
    const originalName = parts[parts.length - 1];
    const resourceFilename = getResourceFilename(originalName);

    const originalSnippet: Snippet = triggers.length > 1
      ? { triggers, include_file: resourceFilename }
      : { trigger: triggers[0], include_file: resourceFilename };
    if (match.description) {
      originalSnippet.description = match.description;
    }

    const matches: ImportedMatch[] = triggers.map((trigger) => {
      const snippet: Snippet = {
        trigger,
        include_file: resourceFilename,
      };
      if (match.description) {
        snippet.description = match.description;
      }
      return {
        snippet,
        originalSnippet,
        originalMatchIndex,
        resourcePath: catPath,
        resourceName: resourceFilename,
      };
    });

    return { matches, warnings };
  }

  const replace = match.replace;
  if (replace === undefined || replace === null) {
    return {
      matches: [],
      warnings: [`[${fileName}] Snippet for ${triggers.join(", ")} has no replace block, skipping`],
    };
  }

  const originalSnippet: Snippet = triggers.length > 1
    ? { triggers, replace: String(replace) }
    : { trigger: triggers[0], replace: String(replace) };
  if (match.description) {
    originalSnippet.description = match.description;
  }

  const matches: ImportedMatch[] = triggers.map((trigger) => {
    const snippet: Snippet = {
      trigger,
      replace: String(replace),
    };
    if (match.description) {
      snippet.description = match.description;
    }
    return { snippet, originalSnippet, originalMatchIndex };
  });

  return { matches, warnings };
}

export function importYamlContent(
  yamlContent: string,
  fileName: string
): ImportResult {
  const warnings: string[] = [];
  const importedMatches: ImportedMatch[] = [];
  const snippets: Snippet[] = [];

  let data: any;
  try {
    data = YAML.parse(yamlContent);
  } catch (e: any) {
    return {
      snippets: [],
      importedMatches: [],
      warnings: [`[${fileName}] YAML parse error: ${e.message || e}`],
    };
  }

  if (!data || !Array.isArray(data.matches)) {
    return {
      snippets: [],
      importedMatches: [],
      warnings: [`[${fileName}] No matches key or matches is not an array`],
    };
  }

  for (let index = 0; index < data.matches.length; index++) {
    const match = data.matches[index];
    const { matches, warnings: matchWarnings } = parseYamlMatch(match, fileName, index);
    warnings.push(...matchWarnings);
    for (const m of matches) {
      importedMatches.push(m);
      snippets.push(m.snippet);
    }
  }

  return { snippets, importedMatches, warnings };
}
