import { describe, expect, it, vi } from "vitest";
import {
  saveSnippetToYaml,
  deleteSnippetFromYaml,
} from "./snippetYamlRepository";
import type { Snippet } from "../logic/types";

// Mock Tauri plugin-fs
vi.mock("@tauri-apps/plugin-fs", () => {
  let fileContent = `matches:\n  - trigger: :hello\n    replace: Hello\n`;
  return {
    readTextFile: vi.fn().mockImplementation(async () => fileContent),
    writeTextFile: vi.fn().mockImplementation(async (path, content) => {
      fileContent = content;
    }),
  };
});

// Mock searchIndexSyncService
vi.mock("../services/searchIndexSyncService", () => {
  return {
    markSearchIndexWrite: vi.fn(),
    refreshSearchIndexForFile: vi.fn(),
  };
});

describe("snippetYamlRepository", () => {
  it("saves a new snippet by appending it to yaml file", async () => {
    const newSnippet: Snippet = {
      trigger: ":world",
      replace: "World",
    };

    const updatedContent = await saveSnippetToYaml(
      "/dummy/path.yml",
      newSnippet,
      undefined,
      "/dummy/match/dir"
    );

    expect(updatedContent).toContain("trigger: :world");
    expect(updatedContent).toContain("replace: World");
  });

  it("deletes a snippet from yaml file", async () => {
    const updatedContent = await deleteSnippetFromYaml(
      "/dummy/path.yml",
      0, // Delete first match (:hello)
      "/dummy/match/dir"
    );

    expect(updatedContent).not.toContain("trigger: :hello");
  });
});
