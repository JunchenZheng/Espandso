import { describe, expect, it } from "vitest";
import { buildEspansoConfigPreviewTree, findTreeNode, getEspansoConfigAncestorPaths } from "./tree";
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
    const baseNode = findTreeNode(tree, "/path/base.yml");
    expect(baseNode).not.toBeNull();
    expect(baseNode?.snippetCount).toBe(5);

    const subNode = findTreeNode(tree, "sub");
    expect(subNode?.isDir).toBe(true);
    expect(subNode?.snippetCount).toBe(3);
  });
});
