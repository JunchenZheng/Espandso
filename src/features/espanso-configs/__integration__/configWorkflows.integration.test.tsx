import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import App from "../../../App";
import { renderWithProviders } from "../../../test/render";
import { tauriHarness } from "../../../test/integration/tauriHarness";

const baseYaml = [
  "matches:",
  "  - trigger: :hello",
  "    replace: Hello from integration",
  "",
].join("\n");

describe("Espanso config integration workflows", () => {
  beforeEach(() => {
    const matchDir = tauriHarness.getMatchDir();
    tauriHarness.reset({
      files: {
        [`${matchDir}/base.yml`]: baseYaml,
      },
    });
  });

  it("scans the configured Espanso match directory and loads the selected YAML preview", async () => {
    renderWithProviders(<App />);

    expect(await screen.findByText(":hello")).toBeInTheDocument();
    expect(screen.getByText("base.yml")).toBeInTheDocument();
    expect(screen.getByText("Hello from integration")).toBeInTheDocument();

    expect(tauriHarness.readDir).toHaveBeenCalledWith(tauriHarness.getMatchDir());
    expect(tauriHarness.readTextFile).toHaveBeenCalledWith(
      `${tauriHarness.getMatchDir()}/base.yml`,
    );
  });

  it("creates a YAML file through the app workflow and refreshes the collection", async () => {
    const user = userEvent.setup();
    renderWithProviders(<App />);

    await screen.findByText(":hello");
    await user.click(screen.getByTitle("Create New YAML File"));

    const dialog = await screen.findByRole("dialog", { name: "Create New YAML File" });
    await user.type(within(dialog).getByLabelText(/File Name/u), "work");
    await user.click(within(dialog).getByRole("button", { name: "Create File" }));

    const newPath = `${tauriHarness.getMatchDir()}/work.yml`;
    await waitFor(() => {
      expect(tauriHarness.getFile(newPath)).toContain("Espanso match file: work");
    });

    expect(await screen.findByText("work.yml")).toBeInTheDocument();
    expect(tauriHarness.invoke).toHaveBeenCalledWith("mark_search_index_internal_write", {
      filePath: newPath,
    });
    expect(tauriHarness.invoke).toHaveBeenCalledWith("refresh_search_index_file", {
      filePath: newPath,
      matchDir: tauriHarness.getMatchDir(),
    });
  });
});
