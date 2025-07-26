import { describe, it, expect } from "vitest";
import { validate } from "./validate";
import { importYamlContent } from "./importYaml";
import { appendSnippetToYamlContent, deleteSnippetFromYamlContent, deleteMultipleSnippetsFromYamlContent, deleteSelectedTriggersFromYamlContent, findSnippetLineRangeInYaml, findSnippetLineRangesInYaml, findDeleteSelectionLineRangesInYaml, replaceSnippetInYamlContent, snippetToYamlMatch } from "./yamlEditor";
import { isEspansoYamlConfigFile, parseEspansoConfigDir, sortEspansoConfigFiles } from "./espansoPaths";
import {
  getIncludeFileCandidates,
  buildIncludeFileShellCommand,
  resolveAndExecuteIncludeFileCommand,
  resolveExistingIncludeFilePath,
} from "./resolveIncludeFile";
import { getSnippetTriggers, normalizeTriggerLines, buildTriggerInput, isImageFilePath } from "./snippetUtils";
import { isBinaryData, checkIsBinaryFilePath } from "./fileCheck";

describe("snippetUtils", () => {
  it("should return triggers for single and multiple trigger snippets", () => {
    expect(getSnippetTriggers({ trigger: ":hello" })).toEqual([":hello"]);
    expect(getSnippetTriggers({ triggers: [":hello", ":hi"] })).toEqual([":hello", ":hi"]);
    expect(getSnippetTriggers({})).toEqual([]);
  });

  it("should normalize trigger lines correctly", () => {
    const raw = "  :hello \n\n  :hi  \r\n :hey ";
    expect(normalizeTriggerLines(raw)).toEqual([":hello", ":hi", ":hey"]);
  });

  it("should build trigger input state for UI", () => {
    expect(buildTriggerInput({ trigger: ":single" })).toEqual({
      mode: "single",
      single: ":single",
      multiline: ":single",
    });
    expect(buildTriggerInput({ triggers: [":hi", ":hello"] })).toEqual({
      mode: "multiple",
      single: ":hi",
      multiline: ":hi\n:hello",
    });
  });

  it("should correctly identify image file paths", () => {
    expect(isImageFilePath("/path/to/cat.PNG")).toBe(true);
    expect(isImageFilePath("image.jpg")).toBe(true);
    expect(isImageFilePath("icon.svg")).toBe(true);
    expect(isImageFilePath("photo.webp")).toBe(true);
    expect(isImageFilePath("/path/to/document.pdf")).toBe(false);
    expect(isImageFilePath("notes.txt")).toBe(false);
    expect(isImageFilePath("")).toBe(false);
  });
});

describe("fileCheck", () => {
  it("should identify text vs binary buffers", () => {
    const textBuffer = new TextEncoder().encode("Hello world! This is a standard plain text file.");
    expect(isBinaryData(textBuffer)).toBe(false);

    const binaryBuffer = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0xff]);
    expect(isBinaryData(binaryBuffer)).toBe(true);

    const pdfBuffer = new TextEncoder().encode("%PDF-1.5 header content");
    expect(isBinaryData(pdfBuffer)).toBe(true);
  });

  it("should check binary file path using mock byte reader", async () => {
    const mockReader = async (p: string) => {
      if (p.endsWith(".bin")) return new Uint8Array([0x00, 0x01]);
      return new TextEncoder().encode("Text file content");
    };

    expect(await checkIsBinaryFilePath("/tmp/test.txt", mockReader)).toBe(false);
    expect(await checkIsBinaryFilePath("/tmp/test.bin", mockReader)).toBe(true);
    expect(await checkIsBinaryFilePath("/tmp/cat.png", mockReader)).toBe(true);
  });
});

describe("validate", () => {
  it("should validate correct snippets", async () => {
    const data = {
      version: 1,
      snippets: [
        { trigger: ":hello", replace: "world", description: "simple" },
        { triggers: [":hi", ":hey"], replace: "world 2" },
        { trigger: ":file", include_file: "test.txt" },
        { trigger: ":cat", image_path: "/path/to/cat.png" },
        { trigger: ":form", form: "Hello [[name]]", form_fields: { name: { default: "Ada" } } },
      ],
    };

    const { errors, warnings } = await validate(data);
    expect(errors).toHaveLength(0);
    expect(warnings).toHaveLength(0);
  });

  it("should catch validation errors", async () => {
    const data = {
      version: "1", // not an integer
      snippets: [
        { trigger: "", replace: "world" }, // empty trigger
        { trigger: ":dup", replace: "1" },
        { trigger: ":dup", replace: "2" }, // duplicate trigger
        { trigger: ":both", replace: "yes", include_file: "test.txt" }, // multiple content kinds
        { trigger: ":none" }, // neither replace nor include
        { trigger: "no-colon", replace: "valid custom trigger style" },
        { trigger: ":conflict", triggers: [":conflict2"], replace: "both" }, // both trigger and triggers
        { triggers: [":t1", ":t1"], replace: "dup in triggers" }, // duplicate inside triggers
        { trigger: ":empty-form", form: "" }, // empty form
        { trigger: ":fields", replace: "x", form_fields: { value: { multiline: true } } }, // fields without form
        { trigger: ":bad-img", image_path: "" }, // empty image_path
      ],
    };

    const { errors, warnings } = await validate(data);
    expect(errors).not.toHaveLength(0);
    expect(warnings).toHaveLength(0);

    const messages = errors.map((e) => e.message);
    expect(messages).toContain("root 'version' must be an integer");
    expect(messages).toContain("snippet #0: 'trigger' must be a non-empty string");
    expect(messages).toContain("snippet #2: duplicate trigger ':dup' (first at #1)");
    expect(messages).toContain("snippet #3: cannot combine 'replace', 'include_file', and 'form'");
    expect(messages).toContain("snippet #4: must have either 'replace', 'include_file', 'image_path', or 'form'");
    expect(messages).toContain("snippet #6: cannot have both 'trigger' and 'triggers'");
    expect(messages).toContain("snippet #7: duplicate trigger ':t1' (first at #7)");
    expect(messages).toContain("snippet #8: 'form' must be a non-empty string");
    expect(messages).toContain("snippet #9: 'form_fields' can only be used with 'form'");
    expect(messages).toContain("snippet #10: 'image_path' must be a non-empty string");
  });

  it("should check include_file existence", async () => {
    const data = {
      version: 1,
      snippets: [{ trigger: ":test", include_file: "missing.txt" }],
    };

    const checkFileExists = async (p: string) => p === "exists.txt";
    const { errors } = await validate(data, {
      snippetsDir: "/some/dir",
      checkFileExists,
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("include_file 'missing.txt' not found");
  });

  it("should reject include_file if it is an image file", async () => {
    const data = {
      version: 1,
      snippets: [{ trigger: ":test", include_file: "picture.png" }],
    };

    const { errors } = await validate(data);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("'include_file' cannot be an image file");
  });
});

describe("importYaml", () => {
  it("should import basic triggers", () => {
    const yaml = `
matches:
  - trigger: :hello
    replace: world
    description: simple
  - triggers:
      - :hi
      - :hey
    replace: greeting
  - trigger: :cat
    image_path: /path/to/cat.png
    description: cat image
`;
    const res = importYamlContent(yaml, "base.yml");
    expect(res.warnings).toHaveLength(0);
    expect(res.snippets).toHaveLength(4);
    expect(res.snippets[0]).toEqual({ trigger: ":hello", replace: "world", description: "simple" });
    expect(res.snippets[1]).toEqual({ trigger: ":hi", replace: "greeting" });
    expect(res.snippets[2]).toEqual({ trigger: ":hey", replace: "greeting" });
    expect(res.snippets[3]).toEqual({ trigger: ":cat", image_path: "/path/to/cat.png", description: "cat image" });
    expect(res.importedMatches[1].originalMatchIndex).toBe(1);
    expect(res.importedMatches[1].triggerIndex).toBe(0);
    expect(res.importedMatches[2].originalMatchIndex).toBe(1);
    expect(res.importedMatches[2].triggerIndex).toBe(1);
    expect(res.importedMatches[1].originalSnippet).toEqual({ triggers: [":hi", ":hey"], replace: "greeting" });
  });

  it("should import include_file snippets and snippets with custom vars (like date) with replace block", () => {
    const yaml = `
matches:
  - trigger: :inc_legacy
    replace: "{{output}}"
    vars:
      - name: path
        type: echo
        params:
          echo: /path/to/resource.json
      - name: output
        type: shell
        params:
          cmd: cat "{{path}}"
  - trigger: :inc_single
    replace: "{{output}}"
    vars:
      - name: output
        type: shell
        params:
          cmd: cat "/path/to/single_resource.json"
  - trigger: :custom_var
    replace: "ISO date: {{bad}}"
    vars:
      - name: bad
        type: date
        params:
          format: "%Y"
`;
    const res = importYamlContent(yaml, "test.yml");
    expect(res.snippets).toHaveLength(3);
    expect(res.snippets[0]).toEqual({ trigger: ":inc_legacy", include_file: "resource_data.json" });
    expect(res.snippets[1]).toEqual({ trigger: ":inc_single", include_file: "single_resource_data.json" });
    expect(res.snippets[2]).toEqual({
      trigger: ":custom_var",
      replace: "ISO date: {{bad}}",
      vars: [
        {
          name: "bad",
          type: "date",
          params: { format: "%Y" },
        },
      ],
    });
    expect(res.warnings).toHaveLength(0);
  });

  it("should import empty or comment-only YAML files without warnings", () => {
    const yaml = `# Espanso match file: Under-first
# For documentation, see: https://espanso.org/docs/matches/basics/
`;
    const res = importYamlContent(yaml, "empty.yml");
    expect(res.snippets).toHaveLength(0);
    expect(res.warnings).toHaveLength(0);
  });

  it("should import form snippets with fields", () => {
    const yaml = `
matches:
  - trigger: :greet
    form: |
      Hey [[name]],
      [[message]]
    form_fields:
      message:
        multiline: true
    description: greeting form
`;

    const res = importYamlContent(yaml, "forms.yml");

    expect(res.snippets).toHaveLength(1);
    expect(res.snippets[0]).toEqual({
      trigger: ":greet",
      form: "Hey [[name]],\n[[message]]\n",
      form_fields: { message: { multiline: true } },
      description: "greeting form",
    });
  });

  it("should import all snippet types including date vars, forms, images, and cat shell vars from ad-block-rules.yml format", () => {
    const yaml = `
matches:
  - trigger: :adblock
    replace: "rule1"
  - trigger: :ad-block
    replace: "rule2"
  - triggers:
      - non-im
      - -non
    replace: "rule3"
  - trigger: :plan
    replace: "test plan"
  - trigger: ":form1"
    form: "Hello [[name]]"
  - trigger: :pic
    image_path: /path/to/img.png
  - trigger: :file
    replace: "{{output}}"
    vars:
      - name: output
        type: shell
        params:
          cmd: cat "/path/to/script.py"
  - trigger: ":date1"
    replace: "ISO date: {{mydate}}"
    vars:
      - name: mydate
        type: date
        params:
          format: "%Y-%m-%d"
`;
    const res = importYamlContent(yaml, "ad-block-rules.yml");
    expect(res.warnings).toHaveLength(0);
    // 1 (adblock) + 1 (ad-block) + 2 (non-im, -non) + 1 (plan) + 1 (form1) + 1 (pic) + 1 (file) + 1 (date1) = 9 snippets imported
    expect(res.snippets).toHaveLength(9);
    expect(res.snippets.map((s) => s.trigger)).toEqual([
      ":adblock",
      ":ad-block",
      "non-im",
      "-non",
      ":plan",
      ":form1",
      ":pic",
      ":file",
      ":date1",
    ]);
    expect(res.snippets[8]).toEqual({
      trigger: ":date1",
      replace: "ISO date: {{mydate}}",
      vars: [
        {
          name: "mydate",
          type: "date",
          params: { format: "%Y-%m-%d" },
        },
      ],
    });
  });
});

describe("yamlEditor", () => {
  it("should append a static snippet to an existing YAML config", () => {
    const yaml = `
matches:
  - trigger: :hello
    replace: world
`;

    const updated = appendSnippetToYamlContent(yaml, {
      trigger: ":bye",
      replace: "goodbye",
      description: "farewell",
    });

    expect(updated).toContain("trigger: :hello");
    expect(updated).toContain("trigger: :bye");
    expect(updated).toContain("replace: goodbye");
    expect(updated).toContain("description: farewell");
  });

  it("should preserve unsupported match fields when appending", () => {
    const yaml = `
matches:
  - trigger: :date
    replace: "{{today}}"
    vars:
      - name: today
        type: date
        params:
          format: "%Y-%m-%d"
`;

    const updated = appendSnippetToYamlContent(yaml, {
      triggers: [":a", ":alias"],
      replace: "alpha",
    });

    expect(updated).toContain("type: date");
    expect(updated).toContain("triggers:");
    expect(updated).toContain("- :alias");
  });

  it("should format multiline replacement as a block scalar", () => {
    const updated = appendSnippetToYamlContent("matches: []\n", {
      trigger: ":multi",
      replace: "line one\nline two",
    });

    expect(updated).toContain("replace: |-\n      line one\n      line two");
  });

  it("should ensure blank line between match items when appending", () => {
    const yaml = `matches:
  - trigger: :hello
    replace: world`;

    const updated = appendSnippetToYamlContent(yaml, {
      trigger: ":bye",
      replace: "goodbye",
    });

    expect(updated).toBe(`matches:
  - trigger: :hello
    replace: world

  - trigger: :bye
    replace: goodbye
`);
  });

  it("should calculate correct line range for snippet in YAML", () => {
    const yaml = `matches:
  - trigger: :hello
    replace: world
  - trigger: :bye
    replace: goodbye`;

    const range0 = findSnippetLineRangeInYaml(yaml, 0);
    const range1 = findSnippetLineRangeInYaml(yaml, 1);

    expect(range0).not.toBeNull();
    expect(range0?.startLine).toBe(2);
    expect(range1).not.toBeNull();
    expect(range1?.startLine).toBe(4);
  });

  it("should calculate delete preview line ranges from original match indices", () => {
    const yaml = `matches:
  - trigger: :one
    replace: first
  - trigger: :two
    replace: second
  - trigger: :three
    replace: third
`;

    const deletedYaml = deleteMultipleSnippetsFromYamlContent(yaml, [2]);
    const previewRanges = findSnippetLineRangesInYaml(yaml, [2]);
    const oldShiftedRange = findSnippetLineRangeInYaml(deletedYaml, 1);

    expect(previewRanges).toEqual([{ startLine: 6, endLine: 7 }]);
    expect(oldShiftedRange).toEqual({ startLine: 5, endLine: 6 });
    expect(oldShiftedRange).not.toEqual(previewRanges[0]);
  });

  it("should append a file snippet using Espanso shell vars", () => {
    const updated = appendSnippetToYamlContent("matches: []\n", {
      trigger: ":file",
      include_file: "/Users/test/snippets/note.md",
      description: "external note",
    });

    expect(updated).toContain("trigger: :file");
    expect(updated).toContain('replace: "{{output}}"');
    expect(updated).toContain("name: output");
    expect(updated).toContain('cmd: cat "/Users/test/snippets/note.md"');
    expect(updated).toContain("description: external note");
  });

  it("should append an image snippet with image_path", () => {
    const updated = appendSnippetToYamlContent("matches: []\n", {
      trigger: ":cat",
      image_path: "/path/to/cat.png",
      description: "cat image snippet",
    });

    expect(updated).toContain("trigger: :cat");
    expect(updated).toContain('image_path: /path/to/cat.png');
    expect(updated).toContain("description: cat image snippet");
  });

  it("should append a form snippet with field controls", () => {
    const updated = appendSnippetToYamlContent("matches: []\n", {
      trigger: ":greet",
      form: "Hey [[name]],\n[[message]]",
      form_fields: {
        message: {
          multiline: true,
        },
        fruit: {
          type: "choice",
          values: ["Apples", "Bananas"],
        },
      },
      description: "greeting form",
    });

    expect(updated).toContain("trigger: :greet");
    expect(updated).toContain("form: |-\n      Hey [[name]],\n      [[message]]");
    expect(updated).toContain("form_fields:");
    expect(updated).toContain("message:");
    expect(updated).toContain("multiline: true");
    expect(updated).toContain("type: choice");
    expect(updated).toContain("- Apples");
    expect(updated).toContain("description: greeting form");
  });

  it("should replace an existing snippet with a file snippet by match index", () => {
    const yaml = `
matches:
  - trigger: :hello
    replace: world
  - trigger: :plan
    replace: "{{output}}"
    vars:
      - name: output
        type: shell
        params:
          cmd: cat "old-plan.md"
`;

    const updated = replaceSnippetInYamlContent(yaml, 1, {
      trigger: ":new-plan",
      include_file: "/Users/test/snippets/new-plan.md",
      description: "updated external plan",
    });

    expect(updated).toContain("trigger: :hello");
    expect(updated).toContain("trigger: :new-plan");
    expect(updated).toContain('cmd: cat "/Users/test/snippets/new-plan.md"');
    expect(updated).toContain("description: updated external plan");
    expect(updated).not.toContain("old-plan.md");
  });

  it("should replace an existing snippet by match index", () => {
    const yaml = `
matches:
  - trigger: :hello
    replace: world
  - triggers:
      - :bye
      - :goodbye
    replace: old
`;

    const updated = replaceSnippetInYamlContent(yaml, 1, {
      triggers: [":bye", ":later"],
      replace: "new\nvalue",
      description: "updated",
    });

    expect(updated).toContain("trigger: :hello");
    expect(updated).toContain("- :later");
    expect(updated).toContain("description: updated");
    expect(updated).toContain("replace: |-\n      new\n      value");
    expect(updated).not.toContain(":goodbye");
  });

  it("should delete an existing snippet by match index", () => {
    const yaml = `
matches:
  - trigger: :hello
    replace: world
  - trigger: :bye
    replace: goodbye
`;

    const updated = deleteSnippetFromYamlContent(yaml, 0);

    expect(updated).not.toContain(":hello");
    expect(updated).toContain("trigger: :bye");
  });

  it("should delete multiple snippets by match indices in descending order", () => {
    const yaml = `
matches:
  - trigger: :one
    replace: first
  - trigger: :two
    replace: second
  - trigger: :three
    replace: third
`;

    const updated = deleteMultipleSnippetsFromYamlContent(yaml, [0, 2]);

    expect(updated).not.toContain(":one");
    expect(updated).toContain("trigger: :two");
    expect(updated).not.toContain(":three");
  });

  it("should delete one trigger from a multi-trigger match without deleting the match", () => {
    const yaml = `matches:
  - triggers:
      - non-im
      - -non
      - :non
    replace: shared
`;

    const updated = deleteSelectedTriggersFromYamlContent(yaml, [
      { matchIndex: 0, triggerIndex: 1 },
    ]);

    expect(updated).toContain("- non-im");
    expect(updated).not.toContain("- -non");
    expect(updated).toContain("- :non");
    expect(updated).toContain("replace: shared");
  });

  it("should delete the whole match when every trigger in a multi-trigger match is selected", () => {
    const yaml = `matches:
  - triggers:
      - non-im
      - -non
      - :non
    replace: shared
  - trigger: :keep
    replace: keep
`;

    const updated = deleteSelectedTriggersFromYamlContent(yaml, [
      { matchIndex: 0, triggerIndex: 0 },
      { matchIndex: 0, triggerIndex: 1 },
      { matchIndex: 0, triggerIndex: 2 },
    ]);

    expect(updated).not.toContain("non-im");
    expect(updated).not.toContain("-non");
    expect(updated).not.toContain(":non");
    expect(updated).not.toContain("replace: shared");
    expect(updated).toContain("trigger: :keep");
  });

  it("should preview a single selected trigger line until the full group is selected", () => {
    const yaml = `matches:
  - triggers:
      - non-im
      - -non
      - :non
    replace: shared
`;

    const partialRanges = findDeleteSelectionLineRangesInYaml(yaml, [
      { matchIndex: 0, triggerIndex: 1 },
    ]);
    const fullRanges = findDeleteSelectionLineRangesInYaml(yaml, [
      { matchIndex: 0, triggerIndex: 0 },
      { matchIndex: 0, triggerIndex: 1 },
      { matchIndex: 0, triggerIndex: 2 },
    ]);

    expect(partialRanges).toEqual([{ startLine: 4, endLine: 4 }]);
    expect(fullRanges).toEqual([{ startLine: 2, endLine: 6 }]);
  });

  it("should parse and format date vars in YAML content", () => {
    const yamlInput = `matches:
  - trigger: ":date1"
    replace: "ISO date: {{mydate}}"
    vars:
      - name: mydate
        type: date
        params:
          format: "%Y-%m-%d"
`;

    const imported = importYamlContent(yamlInput, "test.yml");
    expect(imported.snippets.length).toBe(1);
    expect(imported.snippets[0].vars).toEqual([
      {
        name: "mydate",
        type: "date",
        params: { format: "%Y-%m-%d" },
      },
    ]);

    const formattedYaml = snippetToYamlMatch(imported.snippets[0]);
    expect(formattedYaml.vars).toEqual([
      {
        name: "mydate",
        type: "date",
        params: { format: "%Y-%m-%d" },
      },
    ]);
  });
});

describe("espansoPaths", () => {
  it("should parse the Config directory from espanso path output", () => {
    const output = [
      "Config: /Users/test/Library/Application Support/espanso",
      "Packages: /Users/test/Library/Application Support/espanso/match/packages",
      "Runtime: /Users/test/Library/Caches/espanso",
    ].join("\n");

    expect(parseEspansoConfigDir(output)).toBe("/Users/test/Library/Application Support/espanso");
  });

  it("should return null when espanso path output has no Config line", () => {
    expect(parseEspansoConfigDir("Runtime: /tmp/espanso")).toBeNull();
  });

  it("should identify Espanso YAML config files case-insensitively", () => {
    expect(isEspansoYamlConfigFile("base.yml")).toBe(true);
    expect(isEspansoYamlConfigFile("package.YAML")).toBe(true);
    expect(isEspansoYamlConfigFile("snippets.json")).toBe(false);
  });

  it("should sort scanned config files by relative path", () => {
    const files = sortEspansoConfigFiles([
      { name: "z.yml", path: "/match/z.yml", relativePath: "z.yml" },
      { name: "a.yml", path: "/match/nested/a.yml", relativePath: "nested/a.yml" },
    ]);

    expect(files.map((file) => file.relativePath)).toEqual(["nested/a.yml", "z.yml"]);
  });
});

describe("resolveIncludeFile", () => {
  it("should handle absolute paths directly", () => {
    const candidates = getIncludeFileCandidates({
      includeFile: "/Users/test/data.json",
    });
    expect(candidates).toEqual(["/Users/test/data.json"]);
  });

  it("should generate YAML-relative candidate paths in order of preference", () => {
    const candidates = getIncludeFileCandidates({
      includeFile: "active/active_data.json",
      baseDir: "/Users/test/Library/Application Support/espanso/match",
      currentYamlFile: "/Users/test/Library/Application Support/espanso/match/anki/anki_card.yml",
    });

    expect(candidates).toEqual([
      "/Users/test/Library/Application Support/espanso/match/active/active_data.json",
      "/Users/test/Library/Application Support/espanso/match/anki/active/active_data.json",
      "active/active_data.json",
    ]);
  });

  it("should include source base directory for YAML preview resources", () => {
    const candidates = getIncludeFileCandidates({
      includeFile: "resources/card.md",
      baseDir: "/Users/test/Library/Application Support/espanso/match",
    });

    expect(candidates).toEqual([
      "/Users/test/Library/Application Support/espanso/match/resources/card.md",
      "resources/card.md",
    ]);
  });

  it("should resolve paths relative to an absolute current YAML file", () => {
    const candidates = getIncludeFileCandidates({
      includeFile: "resource.md",
      currentYamlFile: "/Workspace/match/anki/cards.yml",
    });

    expect(candidates).toEqual([
      "/Workspace/match/anki/resource.md",
      "resource.md",
    ]);
  });

  it("should build shell cat command for path", () => {
    const cmd = buildIncludeFileShellCommand("/path/to/active data.json");
    expect(cmd).toBe("cat '/path/to/active data.json'");
  });

  it("should quote shell cat command paths with single quotes safely", () => {
    const cmd = buildIncludeFileShellCommand("/path/to/user's data.json");
    expect(cmd).toBe("cat '/path/to/user'\\''s data.json'");
  });

  it("should resolve the first existing include file candidate", async () => {
    const mockFiles = new Set(["/Workspace/match/anki/resource.md"]);

    const resolved = await resolveExistingIncludeFilePath(
      {
        includeFile: "resource.md",
        currentYamlFile: "/Workspace/match/anki/cards.yml",
      },
      async (path) => mockFiles.has(path),
    );

    expect(resolved).toBe("/Workspace/match/anki/resource.md");
  });

  it("should resolve and execute command for existing candidate", async () => {
    const mockFiles: Record<string, string> = {
      "/Workspace/match/anki/active_data.json": '{"active": true}',
    };
    const executedCmds: string[] = [];

    const res = await resolveAndExecuteIncludeFileCommand(
      {
        includeFile: "active_data.json",
        currentYamlFile: "/Workspace/match/anki/test.yml",
      },
      async (path) => path in mockFiles,
      async (cmd) => {
        executedCmds.push(cmd);
        // Simulate cat command execution
        const match = cmd.match(/^cat '(.+)'$/);
        if (match && match[1] in mockFiles) {
          return mockFiles[match[1]];
        }
        throw new Error("Command failed");
      }
    );

    expect(res.found).toBe(true);
    expect(res.resolvedPath).toBe("/Workspace/match/anki/active_data.json");
    expect(res.command).toBe("cat '/Workspace/match/anki/active_data.json'");
    expect(res.content).toBe('{"active": true}');
    expect(executedCmds).toEqual(["cat '/Workspace/match/anki/active_data.json'"]);
  });

  it("should execute shell command even when existence checks are unavailable", async () => {
    const res = await resolveAndExecuteIncludeFileCommand(
      {
        includeFile: "/Users/test/private/resource.md",
      },
      async () => {
        throw new Error("forbidden path");
      },
      async (cmd) => {
        if (cmd === "cat '/Users/test/private/resource.md'") {
          return "loaded through shell";
        }
        throw new Error("Command failed");
      }
    );

    expect(res.found).toBe(true);
    expect(res.resolvedPath).toBe("/Users/test/private/resource.md");
    expect(res.content).toBe("loaded through shell");
  });
});

describe("openSourceLibraries", () => {
  it("should contain isbinaryfile and shadcn/ui library definitions", async () => {
    const { OPEN_SOURCE_LIBRARIES } = await import("./openSourceLibraries");
    expect(OPEN_SOURCE_LIBRARIES.length).toBeGreaterThanOrEqual(2);
    const names = OPEN_SOURCE_LIBRARIES.map((l) => l.name);
    expect(names).toContain("isbinaryfile");
    expect(names).toContain("shadcn/ui");

    const isbinary = OPEN_SOURCE_LIBRARIES.find((l) => l.name === "isbinaryfile");
    expect(isbinary?.url).toBe("https://github.com/gjtorikian/isbinaryfile");

    const shadcn = OPEN_SOURCE_LIBRARIES.find((l) => l.name === "shadcn/ui");
    expect(shadcn?.url).toBe("https://github.com/shadcn-ui/ui");
  });
});
