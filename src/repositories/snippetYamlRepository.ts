import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import {
  markSearchIndexWrite,
  refreshSearchIndexForFile,
} from "../services/searchIndexSyncService";
import {
  appendSnippetToYamlContent,
  replaceSnippetInYamlContent,
  deleteSnippetFromYamlContent,
  deleteMultipleSnippetsFromYamlContent,
  deleteSelectedTriggersFromYamlContent,
} from "../logic/yamlEditor";
import type { Snippet } from "../logic/types";
import type { DeleteTriggerSelection } from "../logic/yamlEditor";

/**
 * Repository for reading, writing and mutating Espanso snippet YAML files.
 * Coordinates database search index updates on writes.
 */

export async function readYamlFile(path: string): Promise<string> {
  return await readTextFile(path);
}

export async function writeYamlFile(
  path: string,
  content: string,
  matchDir?: string,
): Promise<void> {
  await markSearchIndexWrite(path);
  await writeTextFile(path, content);
  if (matchDir) {
    refreshSearchIndexForFile(path, matchDir);
  }
}

export async function saveSnippetToYamlFile(
  path: string,
  snippet: Snippet,
  originalMatchIndex?: number,
  matchDir?: string,
): Promise<string> {
  const content = await readYamlFile(path);
  const updatedContent =
    typeof originalMatchIndex === "number"
      ? replaceSnippetInYamlContent(content, originalMatchIndex, snippet)
      : appendSnippetToYamlContent(content, snippet);
  await writeYamlFile(path, updatedContent, matchDir);
  return updatedContent;
}

export async function deleteSnippetFromYamlFile(
  path: string,
  originalMatchIndex: number,
  matchDir?: string,
): Promise<string> {
  const content = await readYamlFile(path);
  const updatedContent = deleteSnippetFromYamlContent(content, originalMatchIndex);
  await writeYamlFile(path, updatedContent, matchDir);
  return updatedContent;
}

export async function batchDeleteSnippetsFromYamlFile(
  path: string,
  matchIndices: number[],
  matchDir?: string,
): Promise<string> {
  const content = await readYamlFile(path);
  const updatedContent = deleteMultipleSnippetsFromYamlContent(content, matchIndices);
  await writeYamlFile(path, updatedContent, matchDir);
  return updatedContent;
}

export async function deleteSelectedTriggersFromYamlFile(
  path: string,
  selections: DeleteTriggerSelection[],
  matchDir?: string,
): Promise<string> {
  const content = await readYamlFile(path);
  const updatedContent = deleteSelectedTriggersFromYamlContent(content, selections);
  await writeYamlFile(path, updatedContent, matchDir);
  return updatedContent;
}
