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

describe("Snippet integration workflows", () => {
  beforeEach(() => {
    window.localStorage.clear();
    const matchDir = tauriHarness.getMatchDir();
    tauriHarness.reset({
      files: {
        [`${matchDir}/base.yml`]: baseYaml,
      },
    });
  });

  it("adds a static text snippet, writes YAML, refreshes preview, and refreshes the index", async () => {
    const user = userEvent.setup();
    renderWithProviders(<App />);

    await screen.findByText(":hello");
    await user.click(screen.getByRole("button", { name: "Add Snippet" }));

    const dialog = await screen.findByRole("dialog", { name: "Add Text Snippet" });
    await user.type(within(dialog).getByLabelText(/Trigger/u), ":bye");
    await user.type(within(dialog).getByLabelText(/Replace Content/u), "Goodbye from integration");
    await user.type(within(dialog).getByLabelText(/Description/u), "Integration saved snippet");
    await user.click(within(dialog).getByRole("button", { name: "Save to YAML" }));

    const path = `${tauriHarness.getMatchDir()}/base.yml`;
    await waitFor(() => {
      expect(tauriHarness.getFile(path)).toContain("trigger: :bye");
    });

    expect(tauriHarness.getFile(path)).toContain("replace: Goodbye from integration");
    expect(await screen.findByText(":bye")).toBeInTheDocument();
    expect(screen.getByText("Goodbye from integration")).toBeInTheDocument();
    expect(tauriHarness.invoke).toHaveBeenCalledWith("mark_search_index_internal_write", {
      filePath: path,
    });
    expect(tauriHarness.invoke).toHaveBeenCalledWith("refresh_search_index_file", {
      filePath: path,
      matchDir: tauriHarness.getMatchDir(),
    });
  });

  it("shows rich text formats only after enabling the experimental setting", async () => {
    const user = userEvent.setup();
    renderWithProviders(<App />);

    await screen.findByText(":hello");
    await user.click(screen.getByRole("button", { name: "Add Snippet" }));

    let dialog = await screen.findByRole("dialog", { name: "Add Text Snippet" });
    expect(within(dialog).getByLabelText("Plain Text")).toBeChecked();
    expect(within(dialog).queryByLabelText("Markdown")).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("HTML")).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await user.click(screen.getByRole("button", { name: "Settings" }));
    const settingsDialog = await screen.findByRole("dialog", { name: "Settings" });
    await user.click(
      within(settingsDialog).getByRole("switch", { name: "Rich Text Snippets" }),
    );
    await user.click(within(settingsDialog).getByRole("button", { name: "Done" }));

    await user.click(screen.getByRole("button", { name: "Add Snippet" }));
    dialog = await screen.findByRole("dialog", { name: "Add Text Snippet" });
    expect(within(dialog).getByLabelText("Plain Text")).toBeChecked();
    expect(within(dialog).getByLabelText("Markdown")).not.toBeChecked();
    expect(within(dialog).getByLabelText("HTML")).not.toBeChecked();
  });

  it("adds a markdown rich text snippet from the text mode", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("expandso_enable_experimental_rich_text", "true");
    renderWithProviders(<App />);

    await screen.findByText(":hello");
    await user.click(screen.getByRole("button", { name: "Add Snippet" }));

    const dialog = await screen.findByRole("dialog", { name: "Add Text Snippet" });
    await user.click(within(dialog).getByLabelText("Markdown"));
    await user.type(within(dialog).getByLabelText(/Trigger/u), ":rich");
    await user.type(within(dialog).getByLabelText(/Replace Content/u), "This **is** rich");
    await user.click(within(dialog).getByRole("button", { name: "Save to YAML" }));

    const path = `${tauriHarness.getMatchDir()}/base.yml`;
    await waitFor(() => {
      expect(tauriHarness.getFile(path)).toContain("trigger: :rich");
    });

    expect(tauriHarness.getFile(path)).toContain("markdown: This **is** rich");
    expect(await screen.findByText(":rich")).toBeInTheDocument();
    expect(screen.getByText("This **is** rich")).toBeInTheDocument();
  });

  it("uses an HTML fallback for non-ASCII markdown snippets", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("expandso_enable_experimental_rich_text", "true");
    renderWithProviders(<App />);

    await screen.findByText(":hello");
    await user.click(screen.getByRole("button", { name: "Add Snippet" }));

    const dialog = await screen.findByRole("dialog", { name: "Add Text Snippet" });
    await user.click(within(dialog).getByLabelText("Markdown"));
    await user.type(within(dialog).getByLabelText(/Trigger/u), ":rich-cn");
    await user.type(within(dialog).getByLabelText(/Replace Content/u), "**中文** and English");
    await user.click(within(dialog).getByRole("button", { name: "Save to YAML" }));

    const path = `${tauriHarness.getMatchDir()}/base.yml`;
    await waitFor(() => {
      expect(tauriHarness.getFile(path)).toContain("trigger: :rich-cn");
    });

    expect(tauriHarness.getFile(path)).toContain("html: <strong>&#x4E2D;&#x6587;</strong> and English");
    expect(tauriHarness.getFile(path)).not.toContain("markdown:");
    expect(await screen.findByText(":rich-cn")).toBeInTheDocument();
    expect(screen.getByText("<strong>中文</strong> and English")).toBeInTheDocument();
  });

  it("blocks saving a snippet that would create a trigger prefix conflict when enabled", async () => {
    const user = userEvent.setup();
    renderWithProviders(<App />);

    await screen.findByText(":hello");
    await user.click(screen.getByRole("button", { name: "Settings" }));

    const settingsDialog = await screen.findByRole("dialog", { name: "Settings" });
    await user.click(
      within(settingsDialog).getByRole("switch", { name: "Block Trigger Conflicts on Save" }),
    );
    await user.click(within(settingsDialog).getByRole("button", { name: "Done" }));

    await user.click(screen.getByRole("button", { name: "Add Snippet" }));
    const dialog = await screen.findByRole("dialog", { name: "Add Text Snippet" });
    await user.type(within(dialog).getByLabelText(/Trigger/u), ":helloworld");
    await user.type(within(dialog).getByLabelText(/Replace Content/u), "Blocked");
    await user.click(within(dialog).getByRole("button", { name: "Save to YAML" }));

    expect(
      await screen.findAllByText(/:helloworld conflicts with :hello in base.yml/i),
    ).not.toHaveLength(0);
    expect(tauriHarness.getFile(`${tauriHarness.getMatchDir()}/base.yml`)).not.toContain(
      ":helloworld",
    );
    expect(tauriHarness.invoke).toHaveBeenCalledWith("detect_trigger_prefix_conflicts", {
      request: expect.objectContaining({
        localTriggers: [expect.objectContaining({ trigger: ":helloworld" })],
      }),
    });
  });
});
