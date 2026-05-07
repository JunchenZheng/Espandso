import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../test/render";
import { AboutDialog } from "./AboutDialog";

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(),
}));

describe("AboutDialog", () => {
  it("keeps the app info card and library list on the same width track", () => {
    renderWithProviders(<AboutDialog open onOpenChange={vi.fn()} />);

    expect(screen.getByTestId("about-app-card")).toBeInTheDocument();
    expect(screen.getByTestId("about-libraries-scroll")).toHaveClass("max-h-64");
    expect(screen.getByTestId("about-libraries-scroll")).not.toHaveClass("pr-2");
    expect(screen.getByTestId("about-library-list")).toHaveClass("space-y-3");
  });
});
