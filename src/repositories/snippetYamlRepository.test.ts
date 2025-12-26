import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  saveSnippetToYamlFile,
  deleteSnippetFromYamlFile,
  batchDeleteSnippetsFromYamlFile,
} from "./snippetYamlRepository";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import {
  markSearchIndexWrite,
  refreshSearchIndexForFile,
} from "../services/searchIndexSyncService";
import type { Snippet } from "../logic/types";

// Mock Tauri plugin-fs
vi.mock("@tauri-apps/plugin-fs", () => {
  let fileContent = `matches:\n  - trigger: :hello\n    replace: Hello\n`;
  return {
    readTextFile: vi.fn().mockImplementation(async () => fileContent),
    writeTextFile: vi.fn().mockImplementation(async (_path: string, content: string) => {
      fileContent = content;
    }),
  };
});

// Mock searchIndexSyncService
vi.mock("../services/searchIndexSyncService", () => {
  return {
    markSearchIndexWrite: vi.fn().mockResolvedValue(undefined),
    refreshSearchIndexForFile: vi.fn(),
  };
});

describe("snippetYamlRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saves a new snippet by appending it to yaml file and triggers index sync", async () => {
    const dummyPath = "/dummy/path.yml";
    const dummyMatchDir = "/dummy/match/dir";
    const newSnippet: Snippet = {
      trigger: ":world",
      replace: "World",
    };

    const updatedContent = await saveSnippetToYamlFile(
      dummyPath,
      newSnippet,
      undefined,
      dummyMatchDir,
    );

    expect(updatedContent).toContain("trigger: :world");
    expect(updatedContent).toContain("replace: World");

    // Assert side effects: search index write marking, file write, and index refresh
    expect(markSearchIndexWrite).toHaveBeenCalledTimes(1);
    expect(markSearchIndexWrite).toHaveBeenCalledWith(dummyPath);

    expect(writeTextFile).toHaveBeenCalledTimes(1);
    expect(writeTextFile).toHaveBeenCalledWith(
      dummyPath,
      expect.stringContaining("trigger: :world"),
    );

    expect(refreshSearchIndexForFile).toHaveBeenCalledTimes(1);
    expect(refreshSearchIndexForFile).toHaveBeenCalledWith(dummyPath, dummyMatchDir);
  });

  it("deletes a snippet from yaml file and triggers index sync", async () => {
    const dummyPath = "/dummy/path.yml";
    const dummyMatchDir = "/dummy/match/dir";

    const updatedContent = await deleteSnippetFromYamlFile(
      dummyPath,
      0, // Delete first match (:hello)
      dummyMatchDir,
    );

    expect(updatedContent).not.toContain("trigger: :hello");

    expect(markSearchIndexWrite).toHaveBeenCalledWith(dummyPath);
    expect(writeTextFile).toHaveBeenCalledWith(dummyPath, updatedContent);
    expect(refreshSearchIndexForFile).toHaveBeenCalledWith(dummyPath, dummyMatchDir);
  });

  it("batch deletes snippets from yaml file and triggers index sync", async () => {
    const dummyPath = "/dummy/path.yml";
    const dummyMatchDir = "/dummy/match/dir";

    const updatedContent = await batchDeleteSnippetsFromYamlFile(dummyPath, [0], dummyMatchDir);

    expect(updatedContent).not.toContain("trigger: :hello");

    expect(markSearchIndexWrite).toHaveBeenCalledWith(dummyPath);
    expect(writeTextFile).toHaveBeenCalledWith(dummyPath, updatedContent);
    expect(refreshSearchIndexForFile).toHaveBeenCalledWith(dummyPath, dummyMatchDir);
  });
});
