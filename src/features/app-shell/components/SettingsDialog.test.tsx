import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { SettingsDialog } from "./SettingsDialog";

function renderSettingsDialog(overrides: Partial<ComponentProps<typeof SettingsDialog>> = {}) {
  const props: ComponentProps<typeof SettingsDialog> = {
    open: true,
    onOpenChange: vi.fn(),
    espansoMatchDir: "/synthetic/espanso/match",
    espansoPathSource: "default",
    isScanningEspanso: false,
    onRefreshScan: vi.fn(),
    enableExperimentalYamlWarnings: false,
    onToggleExperimentalYamlWarnings: vi.fn(),
    enableExperimentalRichText: false,
    onToggleExperimentalRichText: vi.fn(),
    themePreference: "system",
    onThemePreferenceChange: vi.fn(),
    enablePreSaveConflictCheck: false,
    onTogglePreSaveConflictCheck: vi.fn(),
    onOpenAbout: vi.fn(),
    ...overrides,
  };

  renderWithProviders(<SettingsDialog {...props} />);
  return props;
}

describe("SettingsDialog", () => {
  it("renders theme preference controls", () => {
    renderSettingsDialog();

    expect(screen.getByText("Appearance")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "System" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Light" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dark" })).toBeInTheDocument();
  });

  it("notifies when the selected theme preference changes", async () => {
    const user = userEvent.setup();
    const onThemePreferenceChange = vi.fn();
    renderSettingsDialog({ onThemePreferenceChange });

    await user.click(screen.getByRole("button", { name: "Dark" }));

    expect(onThemePreferenceChange).toHaveBeenCalledWith("dark");
  });
});
