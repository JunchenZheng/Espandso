import { describe, expect, it } from "vitest";

import type { EspansoConfigFile } from "../logic/espansoPaths";
import {
  buildEspansoConfigPreviewFromContent,
  buildFailedEspansoConfigPreview,
} from "./espansoConfigRepository";

const config: EspansoConfigFile = {
  name: "base.yml",
  path: "/espanso/match/base.yml",
  relativePath: "base.yml",
};

describe("espansoConfigRepository", () => {
  it("builds preview counts from Espanso YAML content", () => {
    const preview = buildEspansoConfigPreviewFromContent(
      config,
      [
        "matches:",
        "  - trigger: :hello",
        "    replace: Hello",
        "  - trigger: :image",
        "    image_path: /tmp/image.png",
        "  - triggers: [\":form\", \":form2\"]",
        "    form: \"Hi [[name]]\"",
        "    form_fields:",
        "      name:",
        "        type: text",
      ].join("\n"),
    );

    expect(preview.snippetCount).toBe(4);
    expect(preview.inlineCount).toBe(1);
    expect(preview.imageCount).toBe(1);
    expect(preview.formCount).toBe(2);
    expect(preview.resourceCount).toBe(0);
    expect(preview.warningCount).toBe(0);
    expect(preview.importedMatches).toHaveLength(4);
  });

  it("builds a safe failed preview without snippets", () => {
    const preview = buildFailedEspansoConfigPreview(config, "Read failed");

    expect(preview.snippetCount).toBe(0);
    expect(preview.warningCount).toBe(1);
    expect(preview.warnings).toEqual(["Read failed"]);
    expect(preview.snippets).toEqual([]);
  });
});
