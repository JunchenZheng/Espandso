import { mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

import type { EspansoConfigFile } from "../logic/espansoPaths";
import { scanEspansoConfigFiles } from "../logic/espansoPaths";
import { importYamlContent } from "../logic/importYaml";
import type { EspansoConfigPreview } from "../features/espanso-configs/types";

export function buildEspansoConfigPreviewFromContent(
  config: EspansoConfigFile,
  content: string,
): EspansoConfigPreview {
  const result = importYamlContent(content, config.name);

  return {
    config,
    snippetCount: result.snippets.length,
    inlineCount: result.snippets.filter(
      (snippet) => snippet.replace !== undefined || snippet.markdown !== undefined || snippet.html !== undefined,
    ).length,
    resourceCount: result.snippets.filter((snippet) => snippet.include_file).length,
    imageCount: result.snippets.filter((snippet) => snippet.image_path !== undefined).length,
    formCount: result.snippets.filter((snippet) => snippet.form !== undefined).length,
    warningCount: result.warnings.length,
    warnings: result.warnings,
    snippets: result.snippets,
    importedMatches: result.importedMatches,
  };
}

export function buildFailedEspansoConfigPreview(
  config: EspansoConfigFile,
  warning: string,
): EspansoConfigPreview {
  return {
    config,
    snippetCount: 0,
    inlineCount: 0,
    resourceCount: 0,
    imageCount: 0,
    formCount: 0,
    warningCount: 1,
    warnings: [warning],
    snippets: [],
    importedMatches: [],
  };
}

export async function loadEspansoConfigPreview(
  config: EspansoConfigFile,
  getReadErrorMessage: (error: unknown) => string,
): Promise<EspansoConfigPreview> {
  try {
    const content = await readTextFile(config.path);
    return buildEspansoConfigPreviewFromContent(config, content);
  } catch (error) {
    return buildFailedEspansoConfigPreview(config, getReadErrorMessage(error));
  }
}

export async function scanEspansoConfigDirectory() {
  return await scanEspansoConfigFiles();
}

export async function writeYamlConfigFile(path: string, content: string): Promise<void> {
  await writeTextFile(path, content);
}

export async function createEspansoDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}
