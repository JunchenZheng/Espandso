/**
 * Logic and helpers for creating subdirectories and YAML config files in Espanso.
 */

export interface DirectoryOption {
  relativePath: string; // "" for root match dir, or "work", "work/email" etc.
  fullPath: string;     // Absolute path
}

export function normalizeYamlFileName(fileName: string): string {
  const trimmed = fileName.trim();
  if (!trimmed) return "";
  if (/\.ya?ml$/i.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed}.yml`;
}

export function validateFileName(fileName: string, existingFileNames: string[] = []): string | null {
  const normalized = normalizeYamlFileName(fileName);
  if (!normalized) {
    return "File name cannot be empty.";
  }

  // Check invalid filename characters
  if (/[\\/:*?"<>|]/.test(fileName.trim())) {
    return "File name contains invalid characters (/ \\ : * ? \" < > |).";
  }

  const lowerNormalized = normalized.toLowerCase();
  const isDuplicate = existingFileNames.some(
    (existing) => existing.toLowerCase() === lowerNormalized
  );

  if (isDuplicate) {
    return `File "${normalized}" already exists in the selected directory.`;
  }

  return null;
}

export function validateFolderName(folderName: string, existingFolderNames: string[] = []): string | null {
  const trimmed = folderName.trim();
  if (!trimmed) {
    return "Folder name cannot be empty.";
  }

  if (/[\\/:*?"<>|]/.test(trimmed)) {
    return "Folder name contains invalid characters (/ \\ : * ? \" < > |).";
  }

  const lowerTrimmed = trimmed.toLowerCase();
  const isDuplicate = existingFolderNames.some(
    (existing) => existing.toLowerCase() === lowerTrimmed
  );

  if (isDuplicate) {
    return `Folder "${trimmed}" already exists in the selected directory.`;
  }

  return null;
}

export function getInitialYamlTemplate(fileName: string): string {
  const baseName = fileName.replace(/\.ya?ml$/i, "");
  return `# Espanso match file: ${baseName}
# For documentation, see: https://espanso.org/docs/matches/basics/

matches:
  # - trigger: ":hello"
  #   replace: "world"
`;
}

export function resolveTargetPath(parentPath: string, name: string): string {
  const cleanParent = parentPath.replace(/[/\\]+$/, "");
  const cleanName = name.replace(/^[/\\]+/, "");
  return `${cleanParent}/${cleanName}`;
}
