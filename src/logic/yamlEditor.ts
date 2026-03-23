import YAML, { Document, isScalar, isSeq, visit } from "yaml";
import { Snippet, SnippetVar } from "./types";

const FORM_VAR_NAME = "form1";

function formLayoutToReplacement(form: string): string {
  return form.replace(
    /\[\[([^\][\n]+)\]\]/g,
    (_placeholder, fieldName) => `{{${FORM_VAR_NAME}.${String(fieldName).trim()}}}`,
  );
}

function buildFormVar(snippet: Snippet): SnippetVar {
  const params: Record<string, any> = {
    layout: snippet.form || "",
  };

  if (snippet.form_fields && Object.keys(snippet.form_fields).length > 0) {
    params.fields = snippet.form_fields;
  }

  return {
    name: FORM_VAR_NAME,
    type: "form",
    params,
  };
}

export function snippetToYamlMatch(snippet: Snippet): Record<string, any> {
  const match: Record<string, any> = {};

  if (snippet.triggers && snippet.triggers.length > 0) {
    match.triggers = snippet.triggers;
  } else {
    match.trigger = snippet.trigger;
  }

  if (snippet.include_file) {
    match.replace = "{{output}}";
    match.vars = [
      {
        name: "output",
        type: "shell",
        params: {
          cmd: `cat "${snippet.include_file}"`,
        },
      },
    ];
  } else if (snippet.image_path !== undefined) {
    match.image_path = snippet.image_path;
  } else if (snippet.form !== undefined) {
    const formDateVars = snippet.vars || [];
    if (formDateVars.length > 0) {
      match.replace = formLayoutToReplacement(snippet.form);
      match.vars = [...formDateVars, buildFormVar(snippet)];
    } else {
      match.form = snippet.form;
      if (snippet.form_fields && Object.keys(snippet.form_fields).length > 0) {
        match.form_fields = snippet.form_fields;
      }
    }
  } else {
    if (snippet.markdown !== undefined) {
      match.markdown = snippet.markdown;
    } else if (snippet.html !== undefined) {
      match.html = snippet.html;
    } else {
      match.replace = snippet.replace || "";
    }
    if (snippet.vars && snippet.vars.length > 0) {
      match.vars = snippet.vars;
    }
  }

  if (snippet.description) {
    match.description = snippet.description;
  }

  return match;
}

type EditableYamlDocument = Document<any, true>;

function parseYamlDocument(yamlContent: string): EditableYamlDocument {
  const doc = yamlContent.trim() ? YAML.parseDocument(yamlContent) : new Document({ matches: [] });

  if (doc.errors.length > 0) {
    throw new Error(doc.errors[0].message);
  }

  return doc;
}

function getMatchesNode(doc: EditableYamlDocument, action: string, createIfMissing = false) {
  let matchesNode = doc.get("matches", true);
  if (!matchesNode && createIfMissing) {
    doc.set("matches", []);
    matchesNode = doc.get("matches", true);
  }

  if (!isSeq(matchesNode)) {
    throw new Error(`YAML root 'matches' must be a list before snippets can be ${action}.`);
  }

  matchesNode.flow = false;
  return matchesNode;
}

function createSnippetNode(doc: EditableYamlDocument, snippet: Snippet) {
  const snippetNode = doc.createNode(snippetToYamlMatch(snippet));
  if (snippetNode && typeof snippetNode === "object" && "flow" in snippetNode) {
    snippetNode.flow = false;
  }
  return snippetNode;
}

export function ensureBlankLinesBetweenMatches(yamlContent: string): string {
  const lines = yamlContent.split("\n");
  const result: string[] = [];
  let inMatches = false;
  let matchItemCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/^\s*matches:\s*$/.test(line)) {
      inMatches = true;
      matchItemCount = 0;
      result.push(line);
      continue;
    }

    if (inMatches && /^[^\s#]/.test(line)) {
      inMatches = false;
    }

    if (inMatches && /^ {2}- /.test(line)) {
      matchItemCount++;
      if (matchItemCount > 1 && result.length > 0 && result[result.length - 1].trim() !== "") {
        result.push("");
      }
    }

    result.push(line);
  }

  return result.join("\n");
}

function formatYamlDocument(doc: EditableYamlDocument): string {
  visit(doc, (_key, node) => {
    if (isScalar(node) && typeof node.value === "string" && node.value.includes("\n")) {
      node.type = "BLOCK_LITERAL";
    }
  });

  const rawFormatted = doc.toString({ lineWidth: 0 });
  return ensureBlankLinesBetweenMatches(rawFormatted);
}

export function appendSnippetToYamlContent(yamlContent: string, snippet: Snippet): string {
  const doc = parseYamlDocument(yamlContent);
  const matchesNode = getMatchesNode(doc, "added", true);

  matchesNode.add(createSnippetNode(doc, snippet));

  return formatYamlDocument(doc);
}

export function replaceSnippetInYamlContent(
  yamlContent: string,
  matchIndex: number,
  snippet: Snippet,
): string {
  const doc = parseYamlDocument(yamlContent);
  const matchesNode = getMatchesNode(doc, "edited");

  if (matchIndex < 0 || matchIndex >= matchesNode.items.length) {
    throw new Error(`Snippet #${matchIndex + 1} no longer exists in this YAML file.`);
  }

  matchesNode.set(matchIndex, createSnippetNode(doc, snippet));

  return formatYamlDocument(doc);
}

export function deleteSnippetFromYamlContent(yamlContent: string, matchIndex: number): string {
  const doc = parseYamlDocument(yamlContent);
  const matchesNode = getMatchesNode(doc, "deleted");

  if (matchIndex < 0 || matchIndex >= matchesNode.items.length) {
    throw new Error(`Snippet #${matchIndex + 1} no longer exists in this YAML file.`);
  }

  matchesNode.delete(matchIndex);

  return formatYamlDocument(doc);
}

export function deleteMultipleSnippetsFromYamlContent(
  yamlContent: string,
  matchIndices: number[],
): string {
  if (matchIndices.length === 0) return yamlContent;

  const doc = parseYamlDocument(yamlContent);
  const matchesNode = getMatchesNode(doc, "deleted");

  // Sort indices in descending order to prevent index shifting during deletion
  const sortedIndices = Array.from(new Set(matchIndices)).sort((a, b) => b - a);

  for (const matchIndex of sortedIndices) {
    if (matchIndex >= 0 && matchIndex < matchesNode.items.length) {
      matchesNode.delete(matchIndex);
    }
  }

  return formatYamlDocument(doc);
}

export interface DeleteTriggerSelection {
  matchIndex: number;
  triggerIndex: number;
}

function getSelectedTriggerIndicesByMatch(
  selections: DeleteTriggerSelection[],
): Map<number, Set<number>> {
  const selectedByMatch = new Map<number, Set<number>>();

  for (const selection of selections) {
    if (selection.matchIndex < 0 || selection.triggerIndex < 0) continue;
    const current = selectedByMatch.get(selection.matchIndex) || new Set<number>();
    current.add(selection.triggerIndex);
    selectedByMatch.set(selection.matchIndex, current);
  }

  return selectedByMatch;
}

export function deleteSelectedTriggersFromYamlContent(
  yamlContent: string,
  selections: DeleteTriggerSelection[],
): string {
  if (selections.length === 0) return yamlContent;

  const doc = parseYamlDocument(yamlContent);
  const matchesNode = getMatchesNode(doc, "deleted");
  const selectedByMatch = getSelectedTriggerIndicesByMatch(selections);
  const matchIndices = Array.from(selectedByMatch.keys()).sort((a, b) => b - a);

  for (const matchIndex of matchIndices) {
    if (matchIndex < 0 || matchIndex >= matchesNode.items.length) continue;

    const selectedTriggerIndices = selectedByMatch.get(matchIndex);
    if (!selectedTriggerIndices || selectedTriggerIndices.size === 0) continue;

    const matchNode = matchesNode.items[matchIndex] as any;
    const triggersNode = matchNode?.get?.("triggers", true);
    if (!isSeq(triggersNode)) {
      matchesNode.delete(matchIndex);
      continue;
    }

    if (selectedTriggerIndices.size >= triggersNode.items.length) {
      matchesNode.delete(matchIndex);
      continue;
    }

    const triggerIndices = Array.from(selectedTriggerIndices).sort((a, b) => b - a);
    for (const triggerIndex of triggerIndices) {
      if (triggerIndex >= 0 && triggerIndex < triggersNode.items.length) {
        triggersNode.delete(triggerIndex);
      }
    }
  }

  return formatYamlDocument(doc);
}

export interface SnippetLineRange {
  startLine: number;
  endLine: number;
}

function collectSnippetLineRangesInYaml(yamlContent: string): Array<SnippetLineRange | null> {
  const doc = YAML.parseDocument(yamlContent);
  const matchesNode = doc.get("matches", true);
  if (!isSeq(matchesNode) || matchesNode.items.length === 0) return [];

  return matchesNode.items.map((item: any) => {
    return getNodeLineRange(yamlContent, item);
  });
}

function getNodeLineRange(yamlContent: string, node: any): SnippetLineRange | null {
  if (!node || !node.range) return null;

  const [startOffset, endOffset] = node.range;
  const startLine = yamlContent.slice(0, startOffset).split("\n").length;
  const validEndOffset = Math.min(endOffset, yamlContent.length);
  let endLine = yamlContent.slice(0, validEndOffset).split("\n").length;

  if (endLine > startLine && yamlContent[validEndOffset - 1] === "\n") {
    endLine = Math.max(startLine, endLine - 1);
  }

  return { startLine, endLine };
}

export function findSnippetLineRangeInYaml(
  yamlContent: string,
  matchIndex: number,
): SnippetLineRange | null {
  try {
    if (!yamlContent || matchIndex < 0) return null;
    const ranges = collectSnippetLineRangesInYaml(yamlContent);
    if (ranges.length === 0) return null;

    const idx = Math.min(Math.max(0, matchIndex), ranges.length - 1);
    return ranges[idx] || null;
  } catch {
    return null;
  }
}

export function findSnippetLineRangesInYaml(
  yamlContent: string,
  matchIndices: number[],
): SnippetLineRange[] {
  try {
    if (!yamlContent || matchIndices.length === 0) return [];
    const ranges = collectSnippetLineRangesInYaml(yamlContent);
    const uniqueIndices = Array.from(new Set(matchIndices));

    return uniqueIndices
      .map((matchIndex) => ranges[matchIndex])
      .filter((range): range is SnippetLineRange => Boolean(range));
  } catch {
    return [];
  }
}

export function findDeleteSelectionLineRangesInYaml(
  yamlContent: string,
  selections: DeleteTriggerSelection[],
): SnippetLineRange[] {
  try {
    if (!yamlContent || selections.length === 0) return [];

    const doc = YAML.parseDocument(yamlContent);
    const matchesNode = doc.get("matches", true);
    if (!isSeq(matchesNode) || matchesNode.items.length === 0) return [];

    const selectedByMatch = getSelectedTriggerIndicesByMatch(selections);
    const ranges: SnippetLineRange[] = [];

    for (const [matchIndex, selectedTriggerIndices] of selectedByMatch) {
      if (matchIndex < 0 || matchIndex >= matchesNode.items.length) continue;

      const matchNode = matchesNode.items[matchIndex] as any;
      const triggersNode = matchNode?.get?.("triggers", true);

      if (!isSeq(triggersNode) || selectedTriggerIndices.size >= triggersNode.items.length) {
        const matchRange = getNodeLineRange(yamlContent, matchNode);
        if (matchRange) ranges.push(matchRange);
        continue;
      }

      for (const triggerIndex of Array.from(selectedTriggerIndices).sort((a, b) => a - b)) {
        if (triggerIndex < 0 || triggerIndex >= triggersNode.items.length) continue;
        const triggerRange = getNodeLineRange(yamlContent, triggersNode.items[triggerIndex]);
        if (triggerRange) ranges.push(triggerRange);
      }
    }

    return ranges;
  } catch {
    return [];
  }
}
