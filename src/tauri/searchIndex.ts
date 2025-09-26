import { invoke } from "@tauri-apps/api/core";
import { Snippet } from "../logic/types";

export interface SearchScope {
  trigger: boolean;
  description: boolean;
  content: boolean;
}

export interface SearchIndexRequest {
  matchDir: string;
  query: string;
  scope: SearchScope;
  limit: number;
  offset: number;
}

export type MatchedField = "trigger" | "description" | "content";

export interface SearchIndexResult {
  filePath: string;
  fileRelativePath: string;
  filename: string;
  snippet: Snippet;
  snippetIndex: number;
  originalMatchIndex: number;
  triggerIndex: number;
  matchedFields: MatchedField[];
}

export type SearchIndexState = "idle" | "indexing" | "ready" | "error";

export interface SearchIndexStatus {
  state: SearchIndexState;
  indexedFiles: number;
  totalFiles: number;
  indexedMatches: number;
  lastError?: string;
}

export interface SearchIndexResponse {
  results: SearchIndexResult[];
  total: number;
  indexStatus: SearchIndexStatus;
}

export async function startSearchIndexSync(matchDir: string): Promise<SearchIndexStatus> {
  return await invoke<SearchIndexStatus>("start_search_index_sync", { matchDir });
}

export async function getSearchIndexStatus(matchDir: string): Promise<SearchIndexStatus> {
  return await invoke<SearchIndexStatus>("get_search_index_status", { matchDir });
}

export async function searchSnippetIndex(request: SearchIndexRequest): Promise<SearchIndexResponse> {
  return await invoke<SearchIndexResponse>("search_snippet_index", { request });
}

export async function refreshSearchIndexFile(filePath: string, matchDir: string): Promise<SearchIndexStatus> {
  return await invoke<SearchIndexStatus>("refresh_search_index_file", { filePath, matchDir });
}
