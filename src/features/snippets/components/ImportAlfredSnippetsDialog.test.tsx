import JSZip from "jszip";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { ImportAlfredSnippetsDialog } from "./ImportAlfredSnippetsDialog";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  readFile: vi.fn(),
}));

describe("ImportAlfredSnippetsDialog", () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    configPaths: ["/path/to/default.yml", "/path/to/other.yml"],
    defaultConfigPath: "/path/to/default.yml",
    onImport: vi.fn(),
  };

  it("renders closed dialog when isOpen is false", () => {
    renderWithProviders(<ImportAlfredSnippetsDialog {...defaultProps} isOpen={false} />);
    expect(screen.queryByTestId("alfred-dropzone")).toBeNull();
  });

  it("renders initial state when isOpen is true", () => {
    renderWithProviders(<ImportAlfredSnippetsDialog {...defaultProps} />);
    expect(screen.getByTestId("alfred-dropzone")).toBeInTheDocument();
    expect(screen.getByTestId("alfred-target-select")).toHaveValue("/path/to/default.yml");
    expect(screen.getByTestId("alfred-submit-btn")).toBeDisabled();
  });

  it("parses dropped .alfredsnippets file and renders preview list with default select all", async () => {
    const zip = new JSZip();
    zip.file(
      "test.json",
      JSON.stringify({
        alfredsnippet: {
          snippet: "Replaced text",
          keyword: ":test",
          name: "Test Name",
        },
      }),
    );
    const zipBuffer = await zip.generateAsync({ type: "arraybuffer" });
    const mockFile = new File([zipBuffer], "my_collection.alfredsnippets");

    renderWithProviders(<ImportAlfredSnippetsDialog {...defaultProps} />);

    const dropzone = screen.getByTestId("alfred-dropzone");
    fireEvent.drop(dropzone, {
      dataTransfer: { files: [mockFile] },
    });

    await waitFor(() => {
      expect(screen.getByText("my_collection.alfredsnippets")).toBeInTheDocument();
      expect(screen.getByText(":test")).toBeInTheDocument();
      expect(screen.getByText("Replaced text")).toBeInTheDocument();
    });

    // Check submit button is enabled for 1 selected item
    const submitBtn = screen.getByTestId("alfred-submit-btn");
    expect(submitBtn).not.toBeDisabled();

    // Toggle select all
    const selectAllCheckbox = screen.getByTestId("alfred-select-all");
    fireEvent.click(selectAllCheckbox); // unselect all
    expect(submitBtn).toBeDisabled();

    fireEvent.click(selectAllCheckbox); // select all again
    expect(submitBtn).not.toBeDisabled();

    // Click submit
    fireEvent.click(submitBtn);
    expect(defaultProps.onImport).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          trigger: ":test",
          replace: "Replaced text",
          name: "Test Name",
        }),
      ],
      "/path/to/default.yml",
      "my_collection.alfredsnippets",
    );
  });

  it("uses directory target mode without requiring an existing YAML file", async () => {
    const zip = new JSZip();
    zip.file(
      "test.json",
      JSON.stringify({
        alfredsnippet: {
          snippet: "Directory import",
          keyword: ":dir",
          name: "Directory Import",
        },
      }),
    );
    const zipBuffer = await zip.generateAsync({ type: "arraybuffer" });
    const mockFile = new File([zipBuffer], "common.alfredsnippets");

    const onImport = vi.fn();
    renderWithProviders(
      <ImportAlfredSnippetsDialog
        {...defaultProps}
        configPaths={[]}
        defaultConfigPath={undefined}
        targetDirectoryRelPath="work"
        onImport={onImport}
      />,
    );

    expect(screen.queryByTestId("alfred-target-select")).not.toBeInTheDocument();
    expect(screen.getByText("/work")).toBeInTheDocument();

    fireEvent.drop(screen.getByTestId("alfred-dropzone"), {
      dataTransfer: { files: [mockFile] },
    });

    await waitFor(() => {
      expect(screen.getByText(":dir")).toBeInTheDocument();
      expect(screen.getByText(/common\.yml/u)).toBeInTheDocument();
    });

    const submitBtn = screen.getByTestId("alfred-submit-btn");
    expect(submitBtn).not.toBeDisabled();
    fireEvent.click(submitBtn);

    expect(onImport).toHaveBeenCalledWith(
      [expect.objectContaining({ trigger: ":dir", replace: "Directory import" })],
      "",
      "common.alfredsnippets",
    );
  });
});
