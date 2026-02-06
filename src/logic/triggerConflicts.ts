import type { EspansoConfigPreview } from "../features/espanso-configs/types";
import { getSnippetTriggers } from "./snippetUtils";

export interface TriggerConflictSource {
  trigger: string;
  configPath: string;
  relativePath: string;
  snippetIndex: number;
  triggerIndex: number;
}

export interface TriggerPrefixConflict {
  blocking: TriggerConflictSource;
  blocked: TriggerConflictSource;
}

function compareTriggerSources(a: TriggerConflictSource, b: TriggerConflictSource): number {
  return (
    a.trigger.localeCompare(b.trigger) ||
    a.relativePath.localeCompare(b.relativePath) ||
    a.snippetIndex - b.snippetIndex ||
    a.triggerIndex - b.triggerIndex
  );
}

export function getTriggerConflictSources(
  previews: EspansoConfigPreview[],
): TriggerConflictSource[] {
  return previews.flatMap((preview) =>
    preview.snippets.flatMap((snippet, snippetIndex) =>
      getSnippetTriggers(snippet)
        .map((trigger) => trigger.trim())
        .filter((trigger) => trigger.length > 0)
        .map((trigger, triggerIndex) => ({
          trigger,
          configPath: preview.config.path,
          relativePath: preview.config.relativePath,
          snippetIndex,
          triggerIndex,
        })),
    ),
  );
}

export function detectTriggerPrefixConflicts(
  previews: EspansoConfigPreview[],
): TriggerPrefixConflict[] {
  const sources = getTriggerConflictSources(previews).sort(compareTriggerSources);
  const conflicts: TriggerPrefixConflict[] = [];
  const seenPairs = new Set<string>();

  for (let i = 0; i < sources.length; i += 1) {
    const candidate = sources[i];
    for (let j = i + 1; j < sources.length; j += 1) {
      const other = sources[j];

      if (candidate.trigger === other.trigger) continue;

      const conflict = other.trigger.startsWith(candidate.trigger)
        ? { blocking: candidate, blocked: other }
        : candidate.trigger.startsWith(other.trigger)
          ? { blocking: other, blocked: candidate }
          : null;

      if (!conflict) continue;

      const pairKey = `${conflict.blocking.trigger}\u0000${conflict.blocked.trigger}`;
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);
      conflicts.push(conflict);
    }
  }

  return conflicts.sort(
    (a, b) =>
      compareTriggerSources(a.blocking, b.blocking) || compareTriggerSources(a.blocked, b.blocked),
  );
}

export function filterTriggerConflictsByConfigPath(
  conflicts: TriggerPrefixConflict[],
  configPath: string,
): TriggerPrefixConflict[] {
  return conflicts.filter(
    (conflict) =>
      conflict.blocking.configPath === configPath || conflict.blocked.configPath === configPath,
  );
}
