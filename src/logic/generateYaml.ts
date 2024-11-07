import { Document, isScalar, visit } from "yaml";
import { Snippet } from "./types";

export interface GenerateOptions {
  snippetsDir?: string;
  resolvePath?: (relativePath: string) => string;
}

export function generateYaml(
  snippets: Snippet[],
  options?: GenerateOptions
): string {
  const matches = snippets.map((snippet) => {
    const match: Record<string, any> = {};
    match.trigger = snippet.trigger;

    if (snippet.include_file) {
      let absPath = snippet.include_file;
      if (options?.resolvePath) {
        absPath = options.resolvePath(snippet.include_file);
      } else if (options?.snippetsDir) {
        // Simple join for fallback
        absPath = `${options.snippetsDir}/${snippet.include_file}`;
      }

      // Extract filename
      const parts = snippet.include_file.split(/[/\\]/);
      const fileName = parts[parts.length - 1];

      match.replace = "{{output}}";
      match.vars = [
        {
          name: "path",
          type: "echo",
          params: {
            echo: absPath,
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
      match.description = snippet.description || `[source: ${fileName}]`;
    } else {
      // Strip trailing newlines from replace block
      const replace = (snippet.replace || "").replace(/\n+$/, "");
      match.replace = replace;

      if (snippet.description) {
        match.description = snippet.description;
      }
    }

    return match;
  });

  const data = { matches };
  const doc = new Document(data);

  // Visit the AST to force block literal style for multi-line string scalars
  visit(doc, (_key, node) => {
    if (isScalar(node) && typeof node.value === "string" && node.value.includes("\n")) {
      node.type = "BLOCK_LITERAL";
    }
  });

  return doc.toString({
    lineWidth: 0,
  });
}
