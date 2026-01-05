import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { DateInsertMenu } from "./DateInsertMenu";

describe("DateInsertMenu", () => {
  it("opens the date format menu and selects an option", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    renderWithProviders(<DateInsertMenu onSelect={onSelect} />);

    await user.click(screen.getByRole("button", { name: /insert date/i }));
    await user.click(screen.getByRole("button", { name: /ISO 8601/i }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "iso_8601",
        example: "2025-06-18",
      }),
    );
    expect(screen.queryByRole("button", { name: /ISO 8601/i })).not.toBeInTheDocument();
  });

  it("closes the menu when clicking outside", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <div>
        <DateInsertMenu onSelect={vi.fn()} />
        <button type="button">Outside target</button>
      </div>,
    );

    await user.click(screen.getByRole("button", { name: /insert date/i }));
    expect(screen.getByRole("button", { name: /ISO 8601/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Outside target" }));

    expect(screen.queryByRole("button", { name: /ISO 8601/i })).not.toBeInTheDocument();
  });
});
