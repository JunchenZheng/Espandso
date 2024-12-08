export interface ResolveIncludeFileOptions {
  includeFile: string;
  repoPath?: string;
  currentSnippetFile?: string;
}

export function getIncludeFileCandidates(options: ResolveIncludeFileOptions): string[] {
  const { includeFile, repoPath, currentSnippetFile } = options;
  if (!includeFile) return [];

  const normalized = includeFile.replace(/\\/g, "/");

  // Absolute path check (macOS/Linux /... or Windows C:\...)
  if (normalized.startsWith("/") || /^[a-zA-Z]:[/\\]/.test(includeFile)) {
    return [includeFile];
  }

  const candidates: string[] = [];

  if (repoPath) {
    const cleanRepo = repoPath.replace(/\/+$/, "");

    // 1. Relative to repoPath/snippets/
    candidates.push(`${cleanRepo}/snippets/${normalized}`);

    // 2. Relative to current snippet file folder
    if (currentSnippetFile) {
      const parts = currentSnippetFile.replace(/\\/g, "/").split("/");
      parts.pop(); // remove file name
      if (parts.length > 0) {
        const folder = parts.join("/");
        candidates.push(`${cleanRepo}/snippets/${folder}/${normalized}`);
      }
    }

    // 3. Relative to repoPath root
    candidates.push(`${cleanRepo}/${normalized}`);
  } else {
    candidates.push(normalized);
  }

  // Return unique candidates
  return Array.from(new Set(candidates));
}

export interface ReadIncludeFileResult {
  found: boolean;
  resolvedPath?: string;
  content?: string;
  error?: string;
  candidatesTried: string[];
}

export async function resolveAndReadIncludeFile(
  options: ResolveIncludeFileOptions,
  checkExists: (path: string) => Promise<boolean>,
  readText: (path: string) => Promise<string>
): Promise<ReadIncludeFileResult> {
  const candidates = getIncludeFileCandidates(options);
  if (candidates.length === 0) {
    return {
      found: false,
      error: "No include_file path specified",
      candidatesTried: [],
    };
  }

  for (const path of candidates) {
    try {
      const exists = await checkExists(path);
      if (exists) {
        const content = await readText(path);
        return {
          found: true,
          resolvedPath: path,
          content,
          candidatesTried: candidates,
        };
      }
    } catch {
      // Try next candidate path
    }
  }

  return {
    found: false,
    error: "File not found in expected locations",
    candidatesTried: candidates,
  };
}
