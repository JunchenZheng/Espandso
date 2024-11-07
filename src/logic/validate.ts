import { ValidationError } from "./types";

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
    const replace = snippet.replace;
    const includeFile = snippet.include_file;
    const description = snippet.description;

    // Trigger validation
    if (typeof trigger !== "string" || !trigger) {
      errors.push({ message: `snippet #${i}: 'trigger' must be a non-empty string` });
    } else {
      if (trigger in seenTriggers) {
        errors.push({
          message: `snippet #${i}: duplicate trigger '${trigger}' (first at #${seenTriggers[trigger]})`,
        });
      } else {
        seenTriggers[trigger] = i;
        if (!trigger.startsWith(":")) {
          warnings.push(`snippet #${i}: trigger '${trigger}' does not start with ':'`);
        }
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
