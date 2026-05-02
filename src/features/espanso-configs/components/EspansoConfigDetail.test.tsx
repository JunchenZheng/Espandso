import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import type { EspansoConfigPreview } from "../types";
import { EspansoConfigDetail } from "./EspansoConfigDetail";

function makePreview(): EspansoConfigPreview {
  return {
    config: {
      name: "base.yml",
      path: "/matches/base.yml",
      relativePath: "base.yml",
    },
    snippetCount: 1,
    inlineCount: 1,
    resourceCount: 0,
    imageCount: 0,
    formCount: 0,
    warningCount: 0,
    warnings: [],
    snippets: [{ trigger: ":hello", replace: "Hello" }],
    importedMatches: [],
  };
}

describe("EspansoConfigDetail", () => {
  it("uses fixed trigger and type columns with remaining preview columns split 1 to 2", () => {
    renderWithProviders(
      <EspansoConfigDetail
        preview={makePreview()}
        onViewSnippet={vi.fn()}
        onAddSnippet={vi.fn()}
      />,
    );

    const triggerHeader = screen.getByText("Trigger").parentElement;
    const typeHeader = screen.getByText("Type").parentElement;
    const row = screen.getByTestId("snippet-row");

    expect(triggerHeader).toHaveClass(
      "grid-cols-[7.5rem_5.5rem_minmax(0,1fr)_minmax(0,2fr)]",
    );
    expect(triggerHeader).toHaveClass("gap-x-4");
    expect(typeHeader).toHaveClass("gap-1.5");
    expect(row).toHaveClass("grid-cols-[7.5rem_5.5rem_minmax(0,1fr)_minmax(0,2fr)]");
    expect(row).toHaveClass("gap-x-4");
  });

  it("shows the trigger conflicts button before Visual Editor", () => {
    renderWithProviders(
      <EspansoConfigDetail
        preview={makePreview()}
        onViewSnippet={vi.fn()}
        onAddSnippet={vi.fn()}
        onOpenTriggerConflicts={vi.fn()}
        triggerConflictCount={2}
        onOpenVisualEditor={vi.fn()}
      />,
    );

    const conflictsButton = screen.getByRole("button", { name: /conflicts/i });
    const visualEditorButton = screen.getByRole("button", { name: /visual editor/i });

    expect(conflictsButton).toHaveTextContent("2");
    expect(
      conflictsButton.compareDocumentPosition(visualEditorButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("exits batch delete mode when Escape is pressed", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <EspansoConfigDetail
        preview={makePreview()}
        onViewSnippet={vi.fn()}
        onAddSnippet={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Batch Delete" }));
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Batch Delete" })).toBeInTheDocument();
  });
});
