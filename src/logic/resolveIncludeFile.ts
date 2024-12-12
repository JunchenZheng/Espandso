export interface ResolveIncludeFileOptions {
  includeFile: string;
  baseDir?: string;
  currentYamlFile?: string;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function stripTrailingSlashes(path: string): string {
  return path.replace(/\/+$/, "");
}

function stripLeadingSlashes(path: string): string {
  return path.replace(/^\/+/, "");
}

function isAbsolutePath(path: string): boolean {
  return path.startsWith("/") || /^[a-zA-Z]:[/\\]/.test(path);
}

function joinPath(base: string, child: string): string {
  return `${stripTrailingSlashes(base)}/${stripLeadingSlashes(child)}`;
}

function getDirectory(path: string): string {
  const normalized = normalizePath(path);
  const parts = normalized.split("/");
  parts.pop();
  return parts.join("/");
}

function addUnique(candidates: string[], path: string) {
  if (path && !candidates.includes(path)) {
    candidates.push(path);
  }
}

export function getIncludeFileCandidates(options: ResolveIncludeFileOptions): string[] {
  const { includeFile, baseDir, currentYamlFile } = options;
  if (!includeFile) return [];

  const normalized = normalizePath(includeFile);

  // Absolute path check (macOS/Linux /... or Windows C:\...)
  if (isAbsolutePath(normalized)) {
    return [includeFile];
  }

  const candidates: string[] = [];

  if (baseDir) {
    addUnique(candidates, joinPath(baseDir, normalized));
  }

  if (currentYamlFile) {
    const currentFolder = getDirectory(currentYamlFile);
    if (currentFolder) {
      addUnique(candidates, joinPath(currentFolder, normalized));
    }
  }

  addUnique(candidates, normalized);

  return candidates;
}

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export function buildIncludeFileShellCommand(absPath: string): string {
  return `cat ${shellQuote(absPath)}`;
}

export async function resolveExistingIncludeFilePath(
  options: ResolveIncludeFileOptions,
  checkExists: (path: string) => Promise<boolean>
): Promise<string | null> {
  const candidates = getIncludeFileCandidates(options);

  for (const path of candidates) {
    try {
      if (await checkExists(path)) {
        return path;
      }
    } catch {
      // Try next candidate path
    }
  }

  return null;
}

export interface ReadIncludeFileResult {
  found: boolean;
  resolvedPath?: string;
  command?: string;
  content?: string;
  error?: string;
  candidatesTried: string[];
}

export async function resolveAndExecuteIncludeFileCommand(
  options: ResolveIncludeFileOptions,
  checkExists: (path: string) => Promise<boolean>,
  executeCmd: (cmd: string) => Promise<string>,
  readTextFallback?: (path: string) => Promise<string>
): Promise<ReadIncludeFileResult> {
  const candidates = getIncludeFileCandidates(options);
  if (candidates.length === 0) {
    return {
      found: false,
      error: "No include_file path specified",
      candidatesTried: [],
    };
  }

  const tryReadPath = async (path: string, allowReadFallback: boolean): Promise<ReadIncludeFileResult | null> => {
    const command = buildIncludeFileShellCommand(path);

    try {
      const content = await executeCmd(command);
      return {
        found: true,
        resolvedPath: path,
        command,
        content,
        candidatesTried: candidates,
      };
    } catch (execErr: any) {
      // If shell command execution is unavailable or fails, fallback to direct text read if available
      if (allowReadFallback && readTextFallback) {
        try {
          const content = await readTextFallback(path);
          return {
            found: true,
            resolvedPath: path,
            command,
            content,
            candidatesTried: candidates,
          };
        } catch (readErr: any) {
          return {
            found: false,
            resolvedPath: path,
            command,
            error: readErr?.message || String(readErr),
            candidatesTried: candidates,
          };
        }
      }

      return {
        found: false,
        resolvedPath: path,
        command,
        error: execErr?.message || String(execErr),
        candidatesTried: candidates,
      };
    }
  };

  const resolvedPath = await resolveExistingIncludeFilePath(options, checkExists);
  let lastError = "";

  if (resolvedPath) {
    const result = await tryReadPath(resolvedPath, true);
    if (result?.found) {
      return result;
    }
    lastError = result?.error || "";
  }

  for (const path of candidates) {
    if (path === resolvedPath) {
      continue;
    }

    const result = await tryReadPath(path, false);
    if (result?.found) {
      return result;
    }
    lastError = result?.error || lastError;
  }

  return {
    found: false,
    error: lastError || "File not found in expected locations",
    candidatesTried: candidates,
  };
}

// Backward compatible alias
export const resolveAndReadIncludeFile = resolveAndExecuteIncludeFileCommand;
