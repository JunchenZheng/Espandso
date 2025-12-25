import { homeDir } from "@tauri-apps/api/path";
import { readDir } from "@tauri-apps/plugin-fs";
import { Command } from "@tauri-apps/plugin-shell";

export interface EspansoConfigFile {
  name: string;
  path: string;
  relativePath: string;
}

export interface EspansoDirectoryInfo {
  name: string;
  path: string;
  relativePath: string;
}

export interface EspansoConfigScanResult {
  matchDir: string;
  pathSource: EspansoPathSource;
  files: EspansoConfigFile[];
  directories: EspansoDirectoryInfo[];
}

export type EspansoPathSource = "cli" | "default";

export interface EspansoMatchDirResult {
  matchDir: string;
  configDir?: string;
  source: EspansoPathSource;
  commandStdout?: string;
}

export function parseEspansoConfigDir(pathOutput: string): string | null {
  const lines = pathOutput.split(/\r?\n/);
  const configLine = lines.find((line) => line.trim().toLowerCase().startsWith("config:"));

  if (!configLine) {
    return null;
  }

  const configDir = configLine.replace(/^config:\s*/i, "").trim();
  return configDir || null;
}

async function getDefaultEspansoMatchDir(): Promise<string> {
  const home = await homeDir();
  const userAgent = navigator.userAgent.toLowerCase();

  const isMac = userAgent.includes("mac") || userAgent.includes("osx");
  const isWindows = userAgent.includes("win");

  if (isMac) {
    return `${home}/Library/Application Support/espanso/match`;
  } else if (isWindows) {
    return `${home}/AppData/Roaming/espanso/match`;
  } else {
    // Default Linux
    return `${home}/.config/espanso/match`;
  }
}

export async function getEspansoMatchDir(): Promise<string> {
  const result = await getEspansoMatchDirDetails();
  return result.matchDir;
}

export async function getEspansoMatchDirDetails(): Promise<EspansoMatchDirResult> {
  try {
    const command = Command.create("espanso", ["path"]);
    const output = await command.execute();

    if (output.code === 0) {
      const configDir = parseEspansoConfigDir(output.stdout);
      if (configDir) {
        return {
          matchDir: `${configDir}/match`,
          configDir,
          source: "cli",
          commandStdout: output.stdout,
        };
      }
    }
  } catch (e) {
    console.warn("Failed to resolve Espanso path via CLI, falling back to platform default:", e);
  }

  return {
    matchDir: await getDefaultEspansoMatchDir(),
    source: "default",
  };
}

export function isEspansoYamlConfigFile(name: string): boolean {
  const lowerName = name.toLowerCase();
  return lowerName.endsWith(".yml") || lowerName.endsWith(".yaml");
}

export function sortEspansoConfigFiles(files: EspansoConfigFile[]): EspansoConfigFile[] {
  return [...files].sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

export function sortEspansoDirectories(
  directories: EspansoDirectoryInfo[],
): EspansoDirectoryInfo[] {
  return [...directories].sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

export async function scanEspansoConfigFiles(
  matchDir?: string,
  basePath: string = "",
): Promise<EspansoConfigScanResult> {
  const pathResult = matchDir
    ? { matchDir, source: "default" as EspansoPathSource }
    : await getEspansoMatchDirDetails();
  const rootDir = pathResult.matchDir;
  const files: EspansoConfigFile[] = [];
  const directories: EspansoDirectoryInfo[] = [];

  async function scanDir(dirPath: string, relativeBase: string) {
    try {
      const entries = await readDir(dirPath);

      for (const entry of entries) {
        if (entry.name.startsWith(".") || entry.name.toLowerCase() === "packages") {
          continue;
        }

        const fullPath = `${dirPath}/${entry.name}`;
        const relativePath = relativeBase ? `${relativeBase}/${entry.name}` : entry.name;

        if (entry.isDirectory) {
          directories.push({
            name: entry.name,
            path: fullPath,
            relativePath,
          });
          await scanDir(fullPath, relativePath);
        } else if (entry.isFile && isEspansoYamlConfigFile(entry.name)) {
          files.push({
            name: entry.name,
            path: fullPath,
            relativePath,
          });
        }
      }
    } catch (e) {
      console.warn(`Failed to read directory ${dirPath}:`, e);
    }
  }

  await scanDir(rootDir, basePath);

  return {
    matchDir: rootDir,
    pathSource: pathResult.source,
    files: sortEspansoConfigFiles(files),
    directories: sortEspansoDirectories(directories),
  };
}
