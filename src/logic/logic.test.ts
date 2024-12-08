import { describe, it, expect } from "vitest";
import { validate } from "./validate";
import { generateYaml } from "./generateYaml";
import { importYamlContent } from "./importYaml";
import { isEspansoYamlConfigFile, parseEspansoConfigDir, sortEspansoConfigFiles } from "./espansoPaths";
import { getIncludeFileCandidates, resolveAndReadIncludeFile } from "./resolveIncludeFile";

describe("validate", () => {
  it("should validate correct snippets", async () => {
    const data = {
      version: 1,
      snippets: [
        { trigger: ":hello", replace: "world", description: "simple" },
        { trigger: ":file", include_file: "test.txt" },
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
        { trigger: ":both", replace: "yes", include_file: "test.txt" }, // both replace & include
        { trigger: ":none" }, // neither replace nor include
        { trigger: "no-colon", replace: "warning" }, // trigger without colon
      ],
    };

    const { errors, warnings } = await validate(data);
    expect(errors).not.toHaveLength(0);
    expect(warnings).toContain("snippet #5: trigger 'no-colon' does not start with ':'");

    const messages = errors.map((e) => e.message);
    expect(messages).toContain("root 'version' must be an integer");
    expect(messages).toContain("snippet #0: 'trigger' must be a non-empty string");
    expect(messages).toContain("snippet #2: duplicate trigger ':dup' (first at #1)");
    expect(messages).toContain("snippet #3: cannot have both 'replace' and 'include_file'");
    expect(messages).toContain("snippet #4: must have either 'replace' or 'include_file'");
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
});

describe("generateYaml", () => {
  it("should generate basic matches with correct order", () => {
    const snippets = [
      { trigger: ":hello", replace: "world", description: "desc" },
    ];
    const yaml = generateYaml(snippets);
    expect(yaml).toContain("matches:\n  - trigger: :hello\n    replace: world\n    description: desc");
  });

  it("should format multi-line replace with block scalar |-", () => {
    const snippets = [
      { trigger: ":multiline", replace: "line1\nline2\nline3\n" },
    ];
    const yaml = generateYaml(snippets);
    // expect BLOCK_LITERAL style (|- or |)
    expect(yaml).toContain("replace: |-\n      line1\n      line2\n      line3");
  });

  it("should generate include_file snippets with path and shell vars", () => {
    const snippets = [
      { trigger: ":inc", include_file: "sub/file.txt" },
    ];
    const yaml = generateYaml(snippets, {
      resolvePath: (rel) => `/resolved/${rel}`,
    });

    expect(yaml).toContain('replace: "{{output}}"');
    expect(yaml).toContain("name: path");
    expect(yaml).toContain("type: echo");
    expect(yaml).toContain("echo: /resolved/sub/file.txt");
    expect(yaml).toContain("name: output");
    expect(yaml).toContain("type: shell");
    expect(yaml).toContain('cmd: cat "{{path}}"');
    expect(yaml).toContain('description: "[source: file.txt]"');
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
`;
    const res = importYamlContent(yaml, "base.yml");
    expect(res.warnings).toHaveLength(0);
    expect(res.snippets).toHaveLength(3);
    expect(res.snippets[0]).toEqual({ trigger: ":hello", replace: "world", description: "simple" });
    expect(res.snippets[1]).toEqual({ trigger: ":hi", replace: "greeting" });
    expect(res.snippets[2]).toEqual({ trigger: ":hey", replace: "greeting" });
  });

  it("should import include_file snippets and warn about unsupported stuff", () => {
    const yaml = `
matches:
  - trigger: :inc
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
  - trigger: :unsupported
    replace: "{{bad}}"
    vars:
      - name: bad
        type: date
        params:
          format: "%Y"
`;
    const res = importYamlContent(yaml, "test.yml");
    expect(res.snippets).toHaveLength(1);
    expect(res.snippets[0]).toEqual({ trigger: ":inc", include_file: "resource_data.json" });
    expect(res.warnings).toContain("[test.yml] Snippet for :unsupported has unsupported var type(s) [date], skipping");
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
      repoPath: "/Users/repo",
    });
    expect(candidates).toEqual(["/Users/test/data.json"]);
  });

  it("should generate candidate paths in order of preference", () => {
    const candidates = getIncludeFileCandidates({
      includeFile: "active/active_data.json",
      repoPath: "/Workspace",
      currentSnippetFile: "anki/anki_card.json",
    });

    expect(candidates).toEqual([
      "/Workspace/snippets/active/active_data.json",
      "/Workspace/snippets/anki/active/active_data.json",
      "/Workspace/active/active_data.json",
    ]);
  });

  it("should resolve and read content from first existing candidate", async () => {
    const mockFiles: Record<string, string> = {
      "/Workspace/snippets/anki/active_data.json": '{"active": true}',
    };

    const res = await resolveAndReadIncludeFile(
      {
        includeFile: "active_data.json",
        repoPath: "/Workspace",
        currentSnippetFile: "anki/test.json",
      },
      async (path) => path in mockFiles,
      async (path) => mockFiles[path]
    );

    expect(res.found).toBe(true);
    expect(res.resolvedPath).toBe("/Workspace/snippets/anki/active_data.json");
    expect(res.content).toBe('{"active": true}');
  });
});

