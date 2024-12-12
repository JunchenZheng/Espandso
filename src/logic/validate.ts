import { ValidationError } from "./types";
import { getSnippetTriggers } from "./snippetUtils";

export interface ValidateOptions {
  snippetsDir?: string;
  checkFileExists?: (filePath: string) => Promise<boolean>;
}

export async function validate(
  data: any,
  options?: ValidateOptions
): Promise<{ errors: ValidationError[]; warnings: string[] }> {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];

  if (!data || typeof data !== "object") {
    errors.push({ message: "Root must be a JSON object" });
    return { errors, warnings };
  }

  if (typeof data.version !== "number" || !Number.isInteger(data.version)) {
    errors.push({ message: "root 'version' must be an integer" });
  }

  const snippets = data.snippets;
  if (!Array.isArray(snippets)) {
    errors.push({ message: "root 'snippets' must be a list" });
    return { errors, warnings };
  }

  const seenTriggers: Record<string, number> = {};

  for (let i = 0; i < snippets.length; i++) {
    const snippet = snippets[i];
    if (!snippet || typeof snippet !== "object") {
      errors.push({ message: `snippet #${i}: must be an object` });
      continue;
    }

    const trigger = snippet.trigger;
    const triggers = snippet.triggers;
    const replace = snippet.replace;
    const includeFile = snippet.include_file;
    const description = snippet.description;

    const hasTrigger = trigger !== undefined && trigger !== null;
    const hasTriggers = triggers !== undefined && triggers !== null;

    if (hasTrigger && hasTriggers) {
      errors.push({ message: `snippet #${i}: cannot have both 'trigger' and 'triggers'` });
    } else if (!hasTrigger && !hasTriggers) {
      errors.push({ message: `snippet #${i}: must have either 'trigger' or 'triggers'` });
    } else if (hasTrigger) {
      if (typeof trigger !== "string" || !trigger) {
        errors.push({ message: `snippet #${i}: 'trigger' must be a non-empty string` });
      }
    } else if (hasTriggers) {
      if (!Array.isArray(triggers) || triggers.length === 0) {
        errors.push({ message: `snippet #${i}: 'triggers' must be a non-empty list` });
      } else {
        for (const item of triggers) {
          if (typeof item !== "string" || !item) {
            errors.push({ message: `snippet #${i}: 'triggers' elements must be non-empty strings` });
            break;
          }
        }
      }
    }

    const effectiveTriggers = getSnippetTriggers(snippet);
    for (const tr of effectiveTriggers) {
      if (tr in seenTriggers) {
        errors.push({
          message: `snippet #${i}: duplicate trigger '${tr}' (first at #${seenTriggers[tr]})`,
        });
      } else {
        seenTriggers[tr] = i;
      }
    }

    // Replace vs Include File validation
    const hasReplace = replace !== undefined && replace !== null;
    const hasInclude = includeFile !== undefined && includeFile !== null;

    if (!hasReplace && !hasInclude) {
      errors.push({ message: `snippet #${i}: must have either 'replace' or 'include_file'` });
    } else if (hasReplace && hasInclude) {
      errors.push({ message: `snippet #${i}: cannot have both 'replace' and 'include_file'` });
    } else if (hasReplace) {
      if (typeof replace !== "string" || !replace) {
        errors.push({ message: `snippet #${i}: 'replace' must be a non-empty string` });
      }
    } else {
      if (typeof includeFile !== "string" || !includeFile) {
        errors.push({ message: `snippet #${i}: 'include_file' must be a non-empty string` });
      } else if (options?.snippetsDir && options?.checkFileExists) {
        // Resolve absolute or relative path
        // For simplicity, we pass the relative includeFile to checkFileExists helper
        const exists = await options.checkFileExists(includeFile);
        if (!exists) {
          errors.push({
            message: `snippet #${i}: include_file '${includeFile}' not found`,
          });
        }
      }
    }

    // Description validation
    if (description !== undefined && description !== null && typeof description !== "string") {
      errors.push({ message: `snippet #${i}: 'description' must be a string` });
    }
  }

  return { errors, warnings };
}
