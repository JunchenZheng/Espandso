import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import type { EspansoConfigPreviewTreeNode } from "../types";
import { EspansoConfigTreeNode } from "./EspansoConfigTreeNode";

function makeRootNode(): EspansoConfigPreviewTreeNode {
  return {
    name: "match",
    path: "/espanso/match",
    relativePath: "",
    isDir: true,
    isCollectionRoot: true,
    snippetCount: 1,
    fileCount: 1,
    children: [
      {
        name: "base.yml",
        path: "/espanso/match/base.yml",
        relativePath: "base.yml",
        isDir: false,
        snippetCount: 1,
        fileCount: 1,
        preview: {
          config: {
            name: "base.yml",
            path: "/espanso/match/base.yml",
            relativePath: "base.yml",
          },
          snippetCount: 1,
          inlineCount: 1,
          resourceCount: 0,
          imageCount: 0,
          formCount: 0,
          warningCount: 0,
          warnings: [],
          snippets: [],
          importedMatches: [],
        },
      },
    ],
  };
}

describe("EspansoConfigTreeNode", () => {
  it("keeps the collection root expanded when clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    renderWithProviders(
      <EspansoConfigTreeNode
        node={makeRootNode()}
        activePath=""
        activeAncestorPaths={new Set()}
        onSelect={onSelect}
        onOpenFile={vi.fn()}
      />,
    );

    expect(screen.getByText("base")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "match" }));

    expect(onSelect).toHaveBeenCalledWith("/espanso/match");
    expect(screen.getByText("base")).toBeInTheDocument();
  });
});
