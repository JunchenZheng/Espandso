import YAML, { Document, isScalar, isSeq, visit } from "yaml";
import { Snippet } from "./types";

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
    match.form = snippet.form;
    if (snippet.form_fields && Object.keys(snippet.form_fields).length > 0) {
      match.form_fields = snippet.form_fields;
    }
  } else {
    match.replace = snippet.replace || "";
  }

  if (snippet.description) {
    match.description = snippet.description;
  }

  return match;
}

type EditableYamlDocument = Document<any, true>;

function parseYamlDocument(yamlContent: string): EditableYamlDocument {
  const doc = yamlContent.trim()
    ? YAML.parseDocument(yamlContent)
    : new Document({ matches: [] });

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

    if (inMatches && /^  - /.test(line)) {
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

export function replaceSnippetInYamlContent(yamlContent: string, matchIndex: number, snippet: Snippet): string {
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

export interface SnippetLineRange {
  startLine: number;
  endLine: number;
}

export function findSnippetLineRangeInYaml(yamlContent: string, matchIndex: number): SnippetLineRange | null {
  try {
    if (!yamlContent || matchIndex < 0) return null;
    const doc = YAML.parseDocument(yamlContent);
    const matchesNode = doc.get("matches", true);
    if (!isSeq(matchesNode) || matchesNode.items.length === 0) return null;

    const idx = Math.min(Math.max(0, matchIndex), matchesNode.items.length - 1);
    const targetItem = matchesNode.items[idx] as any;
    if (!targetItem || !targetItem.range) return null;

    const [startOffset, endOffset] = targetItem.range;
    const startLine = yamlContent.slice(0, startOffset).split("\n").length;
    const validEndOffset = Math.min(endOffset, yamlContent.length);
    let endLine = yamlContent.slice(0, validEndOffset).split("\n").length;

    if (endLine > startLine && yamlContent[validEndOffset - 1] === "\n") {
      endLine = Math.max(startLine, endLine - 1);
    }

    return { startLine, endLine };
  } catch {
    return null;
  }
}

