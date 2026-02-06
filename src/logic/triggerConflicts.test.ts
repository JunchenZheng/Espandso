import { describe, expect, it } from "vitest";
import type { EspansoConfigPreview } from "../features/espanso-configs/types";
import {
  detectTriggerPrefixConflicts,
  filterTriggerConflictsByConfigPath,
} from "./triggerConflicts";
import type { Snippet } from "./types";

function preview(path: string, snippets: Snippet[]): EspansoConfigPreview {
  return {
    config: {
      name: path.split("/").pop() || path,
      path: `/matches/${path}`,
      relativePath: path,
    },
    snippetCount: snippets.length,
    inlineCount: snippets.length,
    resourceCount: 0,
    imageCount: 0,
    formCount: 0,
    warningCount: 0,
    warnings: [],
    snippets,
    importedMatches: [],
  };
}

describe("trigger prefix conflicts", () => {
  it("detects strict prefix conflicts and ignores exact duplicate triggers", () => {
    const conflicts = detectTriggerPrefixConflicts([
      preview("base.yml", [
        { trigger: ":hello", replace: "Hello" },
        { trigger: ":hello", replace: "Choose me too" },
        { trigger: ":helloworld", replace: "Hello world" },
        { triggers: [":sig", ":signature"], replace: "Signature" },
      ]),
    ]);

    expect(conflicts.map((conflict) => [conflict.blocking.trigger, conflict.blocked.trigger])).toEqual([
      [":hello", ":helloworld"],
      [":sig", ":signature"],
    ]);
  });

  it("reports conflicts across files and filters conflicts involving a selected file", () => {
    const personal = preview("personal.yml", [{ trigger: ":addr", replace: "Home" }]);
    const work = preview("work.yml", [{ trigger: ":address", replace: "Office" }]);
    const unrelated = preview("dates.yml", [{ trigger: ":date", replace: "Today" }]);

    const conflicts = detectTriggerPrefixConflicts([personal, work, unrelated]);
    const workConflicts = filterTriggerConflictsByConfigPath(conflicts, work.config.path);

    expect(conflicts).toHaveLength(1);
    expect(workConflicts).toHaveLength(1);
    expect(workConflicts[0].blocking.relativePath).toBe("personal.yml");
    expect(workConflicts[0].blocked.relativePath).toBe("work.yml");
  });
});
