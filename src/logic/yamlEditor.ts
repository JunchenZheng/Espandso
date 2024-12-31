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
        name: "path",
        type: "echo",
        params: {
          echo: snippet.include_file,
        },
      },
      {
        name: "output",
        type: "shell",
        params: {
          cmd: 'cat "{{path}}"',
        },
      },
    ];
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

function formatYamlDocument(doc: EditableYamlDocument): string {
  visit(doc, (_key, node) => {
    if (isScalar(node) && typeof node.value === "string" && node.value.includes("\n")) {
      node.type = "BLOCK_LITERAL";
    }
  });

  return doc.toString({ lineWidth: 0 });
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
