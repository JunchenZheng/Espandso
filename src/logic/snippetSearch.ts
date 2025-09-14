import { Snippet } from "./types";
import { getSnippetTriggers } from "./snippetUtils";

export interface SearchScope {
  trigger: boolean;
  description: boolean;
  content: boolean;
}

export interface SearchableConfigPreview {
  config: {
    path: string;
    relativePath: string;
    name?: string;
  };
  snippets: Snippet[];
}

export type MatchedField = "trigger" | "description" | "content";

export interface SearchResult {
  filePath: string;
  fileRelativePath: string;
  filename: string;
  snippet: Snippet;
  snippetIndex: number;
  matchedFields: MatchedField[];
}

/**
 * Searches snippets across preview files based on query string and enabled scopes.
 */
export function searchSnippets<T extends SearchableConfigPreview>(
  previews: T[],
  query: string,
  scope: SearchScope
): SearchResult[] {
  const trimmedQuery = query.trim().toLowerCase();
  if (!trimmedQuery) return [];

  // If no scope selected, return empty
  if (!scope.trigger && !scope.description && !scope.content) {
    return [];
  }

  const results: SearchResult[] = [];

  for (const preview of previews) {
    const filename = preview.config.name || preview.config.relativePath.split("/").pop() || "";

    preview.snippets.forEach((snippet, index) => {
      const matchedFields: MatchedField[] = [];

      // Check trigger scope
      if (scope.trigger) {
        const triggers = getSnippetTriggers(snippet);
        const matchesTrigger = triggers.some((t) =>
          t.toLowerCase().includes(trimmedQuery)
        );
        if (matchesTrigger) {
          matchedFields.push("trigger");
        }
      }

      // Check description scope
      if (scope.description && snippet.description) {
        if (snippet.description.toLowerCase().includes(trimmedQuery)) {
          matchedFields.push("description");
        }
      }

      // Check content scope
      if (scope.content) {
        let contentText = "";
        if (snippet.replace) {
          contentText = snippet.replace;
        } else if (snippet.form) {
          contentText = snippet.form;
        } else if (snippet.image_path) {
          contentText = snippet.image_path;
        } else if (snippet.include_file) {
          contentText = snippet.include_file;
        }

        if (contentText && contentText.toLowerCase().includes(trimmedQuery)) {
          matchedFields.push("content");
        }
      }

      if (matchedFields.length > 0) {
        results.push({
          filePath: preview.config.path,
          fileRelativePath: preview.config.relativePath,
          filename,
          snippet,
          snippetIndex: index,
          matchedFields,
        });
      }
    });
  }

  return results;
}
