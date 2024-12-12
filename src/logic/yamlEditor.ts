import YAML, { Document, isScalar, isSeq, visit } from "yaml";
import { Snippet } from "./types";

export function snippetToYamlMatch(snippet: Snippet): Record<string, any> {
  const match: Record<string, any> = {};

  if (snippet.triggers && snippet.triggers.length > 0) {
    match.triggers = snippet.triggers;
  } else {
    match.trigger = snippet.trigger;
  }

  match.replace = snippet.replace || "";

  if (snippet.description) {
    match.description = snippet.description;
  }

  return match;
}

export function appendSnippetToYamlContent(yamlContent: string, snippet: Snippet): string {
  const doc = yamlContent.trim()
    ? YAML.parseDocument(yamlContent)
    : new Document({ matches: [] });

  if (doc.errors.length > 0) {
    throw new Error(doc.errors[0].message);
  }

  let matchesNode = doc.get("matches", true);
  if (!matchesNode) {
    doc.set("matches", []);
    matchesNode = doc.get("matches", true);
  }

  if (!isSeq(matchesNode)) {
    throw new Error("YAML root 'matches' must be a list before snippets can be added.");
  }

  matchesNode.flow = false;

  const snippetNode = doc.createNode(snippetToYamlMatch(snippet));
  if (snippetNode && typeof snippetNode === "object" && "flow" in snippetNode) {
    snippetNode.flow = false;
  }
  matchesNode.add(snippetNode);

  visit(doc, (_key, node) => {
    if (isScalar(node) && typeof node.value === "string" && node.value.includes("\n")) {
      node.type = "BLOCK_LITERAL";
    }
  });

  return doc.toString({ lineWidth: 0 });
}
