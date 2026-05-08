import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { searchSnippetIndex } from "../../../tauri/searchIndex";
import { SearchDialog } from "./SearchDialog";

vi.mock("../../../tauri/searchIndex", () => ({
  searchSnippetIndex: vi.fn(),
}));

const mockSearchSnippetIndex = vi.mocked(searchSnippetIndex);

describe("SearchDialog", () => {
  beforeEach(() => {
    mockSearchSnippetIndex.mockReset();
  });

  it("does not render SQLite index status returned by indexed search", async () => {
    const user = userEvent.setup();
    mockSearchSnippetIndex.mockResolvedValue({
      results: [
        {
          filePath: "/matches/base.yml",
          fileRelativePath: "base.yml",
          filename: "base.yml",
          snippet: { trigger: ":hello", replace: "Hello" },
          snippetIndex: 0,
          originalMatchIndex: 0,
          triggerIndex: 0,
          matchedFields: ["trigger"],
        },
      ],
      total: 1,
      indexStatus: {
        state: "ready",
        indexedFiles: 32,
        totalFiles: 32,
        indexedMatches: 154,
      },
    });

    renderWithProviders(
      <SearchDialog
        open
        onOpenChange={vi.fn()}
        previews={[]}
        matchDir="/matches"
        onSelectResult={vi.fn()}
      />,
    );

    await user.type(screen.getByPlaceholderText("Search trigger, description or content..."), "hello");

    await waitFor(() => {
      expect(screen.getByText(":hello")).toBeInTheDocument();
    });

    expect(screen.queryByText(/SQLite Index Ready/u)).not.toBeInTheDocument();
    expect(screen.queryByText(/32 files/u)).not.toBeInTheDocument();
    expect(screen.queryByText(/154 matches/u)).not.toBeInTheDocument();
  });
});
