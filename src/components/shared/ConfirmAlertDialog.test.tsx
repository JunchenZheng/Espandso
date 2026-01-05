import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../test/render";
import { ConfirmAlertDialog, type AlertDialogState } from "./ConfirmAlertDialog";

function renderDialog(overrides: Partial<AlertDialogState> = {}) {
  const onOpenChange = vi.fn();
  const state: AlertDialogState = {
    isOpen: true,
    title: "Delete snippet?",
    description: "This action removes the selected snippet.",
    confirmText: "Delete",
    cancelText: "Cancel",
    ...overrides,
  };

  renderWithProviders(<ConfirmAlertDialog state={state} onOpenChange={onOpenChange} />);

  return { onOpenChange, state };
}

describe("ConfirmAlertDialog", () => {
  it("renders the supplied title, description, and actions", () => {
    renderDialog();

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Delete snippet?" })).toBeInTheDocument();
    expect(screen.getByText("This action removes the selected snippet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("runs cancel behavior when the cancel button is clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const { onOpenChange } = renderDialog({ onCancel });

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("closes before running the confirm callback", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const { onOpenChange } = renderDialog({ onConfirm });

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
