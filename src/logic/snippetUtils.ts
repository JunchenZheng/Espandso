import { Snippet } from "./types";

/**
 * Returns all effective triggers for a snippet.
 * If `triggers` is present and non-empty, returns `triggers`.
 * Else if `trigger` is present, returns `[trigger]`.
 * Otherwise returns an empty array.
 */
export function getSnippetTriggers(snippet: Snippet): string[] {
  if (snippet.triggers && Array.isArray(snippet.triggers) && snippet.triggers.length > 0) {
    return snippet.triggers;
  }
  if (snippet.trigger) {
    return [snippet.trigger];
  }
  return [];
}

/**
 * Splits multiline string input into normalized trigger strings.
 * Trims whitespace, filters empty lines, and preserves user order.
 */
export function normalizeTriggerLines(input: string): string[] {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export interface TriggerInputState {
  mode: "single" | "multiple";
  single: string;
  multiline: string;
}

/**
 * Formats a snippet's trigger fields into UI input initial state.
 */
export function buildTriggerInput(snippet: Snippet): TriggerInputState {
  if (snippet.triggers && Array.isArray(snippet.triggers) && snippet.triggers.length > 0) {
    return {
      mode: "multiple",
      single: snippet.triggers[0] || "",
      multiline: snippet.triggers.join("\n"),
    };
  }
  const single = snippet.trigger || "";
  return {
    mode: "single",
    single,
    multiline: single,
  };
}
