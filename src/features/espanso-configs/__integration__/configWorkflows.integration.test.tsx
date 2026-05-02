import JSZip from "jszip";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useCallback, useMemo, useState, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";

import App from "../../../App";
import { translate } from "../../../i18n/translate";
import type { Locale } from "../../../i18n/types";
import { I18nContext } from "../../../i18n/useI18n";
import { renderWithProviders } from "../../../test/render";
import { tauriHarness } from "../../../test/integration/tauriHarness";

const baseYaml = [
  "matches:",
  "  - trigger: :hello",
  "    replace: Hello from integration",
  "",
].join("\n");

function renderWithSwitchableLocale(ui: ReactElement) {
  function SwitchableLocaleProvider({ children }: { children: ReactNode }) {
    const [locale, setLocaleState] = useState<Locale>("en");
    const setLocale = useCallback(async (nextLocale: Locale) => {
      setLocaleState(nextLocale);
    }, []);
    const value = useMemo(
      () => ({
        locale,
        setLocale,
        t: (key: string, params?: Parameters<typeof translate>[2]) =>
          translate(locale, key, params),
      }),
      [locale, setLocale],
    );

    return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
  }

  return render(ui, {
    wrapper: ({ children }) => <SwitchableLocaleProvider>{children}</SwitchableLocaleProvider>,
  });
}

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

  it("does not rescan the Espanso directory when the Settings language changes", async () => {
    const user = userEvent.setup();
    renderWithSwitchableLocale(<App />);

    await screen.findByText(":hello");
    expect(tauriHarness.readDir).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Settings" }));
    const settingsDialog = await screen.findByRole("dialog", { name: "Settings" });
    await user.click(within(settingsDialog).getByRole("button", { name: "中文" }));

    expect(await screen.findByRole("dialog", { name: "设置" })).toBeInTheDocument();
    expect(tauriHarness.readDir).toHaveBeenCalledTimes(1);
  });

  it("detects current-file prefix trigger conflicts through the SQLite index", async () => {
    const user = userEvent.setup();
    const matchDir = tauriHarness.getMatchDir();
    tauriHarness.reset({
      files: {
        [`${matchDir}/base.yml`]: ["matches:", "  - trigger: :esp", "    replace: short", ""].join(
          "\n",
        ),
        [`${matchDir}/work.yml`]: [
          "matches:",
          "  - trigger: :espanso",
          "    replace: long",
          "",
        ].join("\n"),
      },
    });

    renderWithProviders(<App />);

    expect(await screen.findByText(":esp")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /conflicts/i }));

    const dialog = await screen.findByRole("dialog", { name: /trigger conflicts/i });
    expect(within(dialog).getByText(":esp")).toBeInTheDocument();
    expect(within(dialog).getByText(":espanso")).toBeInTheDocument();
    expect(within(dialog).getByText("base.yml")).toBeInTheDocument();
    expect(within(dialog).getByText("work.yml")).toBeInTheDocument();
    expect(tauriHarness.readTextFile).not.toHaveBeenCalledWith(`${matchDir}/work.yml`);
    expect(tauriHarness.invoke).toHaveBeenCalledWith("detect_trigger_prefix_conflicts", {
      request: expect.objectContaining({
        matchDir,
        localTriggers: [expect.objectContaining({ trigger: ":esp" })],
      }),
    });

    const editButtons = within(dialog).getAllByRole("button", { name: /edit/i });
    await user.click(editButtons[1]);

    expect(tauriHarness.readTextFile).toHaveBeenCalledWith(`${matchDir}/work.yml`);
    expect(await screen.findByRole("dialog", { name: /edit text snippet/i })).toBeInTheDocument();
    expect(screen.getByDisplayValue(":espanso")).toBeInTheDocument();
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

  it("uses the selected collection directory as the default create-file location", async () => {
    const user = userEvent.setup();
    const matchDir = tauriHarness.getMatchDir();
    tauriHarness.reset({
      directories: [`${matchDir}/work`],
      files: {
        [`${matchDir}/base.yml`]: baseYaml,
        [`${matchDir}/work/team.yml`]: [
          "matches:",
          "  - trigger: :team",
          "    replace: Team hello",
          "",
        ].join("\n"),
      },
    });

    renderWithProviders(<App />);

    await screen.findByText(":hello");
    await user.click(screen.getByText("work"));
    expect(await screen.findByText("/work")).toBeInTheDocument();

    await user.click(screen.getByTitle("Create New YAML File in /work"));

    const dialog = await screen.findByRole("dialog", { name: "Create New YAML File" });
    expect(within(dialog).getByLabelText("Target Location")).toHaveValue("work");

    await user.type(within(dialog).getByLabelText(/File Name/u), "ideas");
    await user.click(within(dialog).getByRole("button", { name: "Create File" }));

    const newPath = `${matchDir}/work/ideas.yml`;
    await waitFor(() => {
      expect(tauriHarness.getFile(newPath)).toContain("Espanso match file: ideas");
    });
  });

  it("imports Alfred snippets into a new YAML file in the selected directory", async () => {
    const user = userEvent.setup();
    const matchDir = tauriHarness.getMatchDir();
    tauriHarness.reset({
      directories: [`${matchDir}/work`],
      files: {
        [`${matchDir}/base.yml`]: baseYaml,
      },
    });
    const zip = new JSZip();
    zip.file(
      "snippet.json",
      JSON.stringify({
        alfredsnippet: {
          snippet: "Imported from Alfred",
          keyword: ":alfred",
          name: "Alfred Import",
        },
      }),
    );
    const zipBuffer = await zip.generateAsync({ type: "arraybuffer" });
    const mockFile = new File([zipBuffer], "common.alfredsnippets");

    renderWithProviders(<App />);

    await screen.findByText(":hello");
    await user.click(screen.getByText("work"));
    await user.click(await screen.findByTestId("directory-import-alfred-btn"));

    const dialog = await screen.findByRole("dialog", { name: "Import Alfred Snippets" });
    fireEvent.drop(within(dialog).getByTestId("alfred-dropzone"), {
      dataTransfer: { files: [mockFile] },
    });

    await waitFor(() => {
      expect(within(dialog).getByText(":alfred")).toBeInTheDocument();
      expect(within(dialog).getByText(/common\.yml/u)).toBeInTheDocument();
    });

    await user.click(within(dialog).getByTestId("alfred-submit-btn"));

    const newPath = `${matchDir}/work/common.yml`;
    await waitFor(() => {
      expect(tauriHarness.getFile(newPath)).toContain("trigger: :alfred");
      expect(tauriHarness.getFile(newPath)).toContain("replace: Imported from Alfred");
    });
    expect(tauriHarness.invoke).toHaveBeenCalledWith("refresh_search_index_file", {
      filePath: newPath,
      matchDir,
    });
  });
});
