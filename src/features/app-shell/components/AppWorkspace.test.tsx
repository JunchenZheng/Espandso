import { createRef, type ComponentProps } from "react";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { AppWorkspace } from "./AppWorkspace";

function renderAppWorkspace(overrides: Partial<ComponentProps<typeof AppWorkspace>> = {}) {
  const props: ComponentProps<typeof AppWorkspace> = {
    espansoMatchDir: null,
    isEspansoInstalled: true,
    espansoConfigsCount: 0,
    espansoPreviewTree: [],
    selectedEspansoConfigPath: "",
    selectedEspansoPreview: null,
    selectedDirectoryNode: null,
    activeDirectoryRelPath: "",
    activeEspansoAncestorPaths: new Set(),
    collectionPaneWidth: 32,
    isCollectionResizing: false,
    isScanningEspanso: false,
    isLoadingSelectedPreview: false,
    isSelectedPreviewLoaded: false,
    selectedPreviewError: "",
    espansoScanMessage: "",
    highlightedSnippetIndex: null,
    updatedSnippetIndex: null,
    deletingSnippetIndices: new Set(),
    mainSplitRef: createRef<HTMLDivElement>(),
    onOpenSearch: vi.fn(),
    onRefresh: vi.fn(),
    onOpenLogs: vi.fn(),
    onOpenSettings: vi.fn(),
    onSelectConfigPath: vi.fn(),
    onOpenYamlFile: vi.fn(),
    onCreateFile: vi.fn(),
    onCreateFolder: vi.fn(),
    onOpenSnippet: vi.fn(),
    onAddSnippet: vi.fn(),
    onOpenTriggerConflicts: vi.fn(),
    triggerConflictCount: 0,
    onOpenVisualEditor: vi.fn(),
    onOpenImportAlfred: vi.fn(),
    onOpenWarnings: vi.fn(),
    onBatchDelete: vi.fn(),
    onCollectionResizeStart: vi.fn(),
    onCollectionResizeMove: vi.fn(),
    onCollectionResizeStop: vi.fn(),
    ...overrides,
  };

  renderWithProviders(<AppWorkspace {...props} />);
  return props;
}

describe("AppWorkspace", () => {
  it("hides primary create actions when Espanso is not installed", () => {
    renderAppWorkspace({
      isEspansoInstalled: false,
      espansoScanMessage:
        "Install Espanso and make sure the espanso CLI is available, then refresh the scan.",
    });

    expect(screen.getByText("Espanso Not Detected")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create Subdirectory" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create New YAML File" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
  });
});
