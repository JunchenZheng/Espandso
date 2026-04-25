import { describe, expect, it } from "vitest";
import {
  buildEspansoConfigPreviewTree,
  findTreeNode,
  getEspansoConfigAncestorPaths,
  getEspansoMatchRootName,
  wrapEspansoConfigPreviewTreeWithMatchRoot,
} from "./tree";
import type { EspansoConfigPreview } from "./types";

describe("Espanso config tree helpers", () => {
  it("computes ancestor paths correctly", () => {
    const ancestors = getEspansoConfigAncestorPaths("sub/folder/file.yml");
    expect(Array.from(ancestors)).toEqual(["sub", "sub/folder"]);
  });

  it("builds tree structure from previews and directories", () => {
    const previews: EspansoConfigPreview[] = [
      {
        config: {
          name: "base.yml",
          path: "/path/base.yml",
          relativePath: "base.yml",
        },
        snippetCount: 5,
        inlineCount: 5,
        resourceCount: 0,
        imageCount: 0,
        formCount: 0,
        warningCount: 0,
        warnings: [],
        snippets: [],
        importedMatches: [],
      },
      {
        config: {
          name: "nested.yml",
          path: "/path/sub/nested.yml",
          relativePath: "sub/nested.yml",
        },
        snippetCount: 3,
        inlineCount: 3,
        resourceCount: 0,
        imageCount: 0,
        formCount: 0,
        warningCount: 0,
        warnings: [],
        snippets: [],
        importedMatches: [],
      },
    ];

    const tree = buildEspansoConfigPreviewTree(previews, [
      { name: "emptyDir", path: "/path/emptyDir", relativePath: "emptyDir" },
    ]);

    expect(tree).toHaveLength(3); // emptyDir (dir), sub (dir), base.yml (file)
    expect(tree.map((node) => `${node.isDir ? "dir" : "file"}:${node.name}`)).toEqual([
      "dir:emptyDir",
      "dir:sub",
      "file:base.yml",
    ]);

    const baseNode = findTreeNode(tree, "/path/base.yml");
    expect(baseNode).not.toBeNull();
    expect(baseNode?.snippetCount).toBe(5);

    const subNode = findTreeNode(tree, "sub");
    expect(subNode?.isDir).toBe(true);
    expect(subNode?.snippetCount).toBe(3);
  });

  it("derives the collection root name from the configured match directory", () => {
    expect(getEspansoMatchRootName("/Users/me/Library/Application Support/espanso/match")).toBe(
      "match",
    );
    expect(getEspansoMatchRootName("C:\\Users\\me\\AppData\\Roaming\\espanso\\match\\")).toBe(
      "match",
    );
  });

  it("wraps preview nodes in the configured match directory root", () => {
    const tree = buildEspansoConfigPreviewTree([
      {
        config: {
          name: "base.yml",
          path: "/path/match/base.yml",
          relativePath: "base.yml",
        },
        snippetCount: 2,
        inlineCount: 2,
        resourceCount: 0,
        imageCount: 0,
        formCount: 0,
        warningCount: 0,
        warnings: [],
        snippets: [],
        importedMatches: [],
      },
    ]);

    const wrapped = wrapEspansoConfigPreviewTreeWithMatchRoot(tree, "/path/espanso/match");

    expect(wrapped).toHaveLength(1);
    expect(wrapped[0]).toMatchObject({
      name: "match",
      path: "/path/espanso/match",
      relativePath: "",
      isDir: true,
      isCollectionRoot: true,
      snippetCount: 2,
      fileCount: 1,
    });
    expect(wrapped[0].children?.[0].name).toBe("base.yml");
    expect(findTreeNode(wrapped, "/path/espanso/match")?.isCollectionRoot).toBe(true);
  });
});
