import { createRef } from "react";
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { translate } from "../../../i18n/translate";
import { renderWithProviders } from "../../../test/render";
import type { EspansoConfigPreview } from "../../espanso-configs/types";
import type {
  VisualYamlEditorActionProps,
  VisualYamlEditorDialogProps,
  VisualYamlEditorFormProps,
  VisualYamlEditorStateProps,
} from "./VisualYamlEditorDialog";
import { VisualYamlEditorDialog } from "./VisualYamlEditorDialog";

const preview: EspansoConfigPreview = {
  config: {
    name: "base.yml",
    path: "/tmp/espanso/match/base.yml",
    relativePath: "base.yml",
  },
  snippetCount: 0,
  inlineCount: 0,
  resourceCount: 0,
  imageCount: 0,
  formCount: 0,
  warningCount: 0,
  warnings: [],
  snippets: [],
  importedMatches: [],
};

function createVisualEditorProps(): VisualYamlEditorStateProps {
  return {
    visualEditorMode: "add",
    setVisualEditorMode: vi.fn(),
    highlightedLineRange: null,
    setHighlightedLineRange: vi.fn(),
    pendingDeleteSelections: [],
    deleteSearchQuery: "",
    setDeleteSearchQuery: vi.fn(),
    handleUndoLastDelete: vi.fn(),
    handleResetDeletions: vi.fn(),
    visualEditorMatches: [],
    toggleDeleteSelection: vi.fn(),
    getDeleteSelectionKey: vi.fn(() => "selection"),
    isLoadingVisualEditorYaml: false,
    loadVisualEditorYaml: vi.fn(),
    visualEditorPreviewYamlContent: "matches:\n",
    pendingDeletedLineNumbers: new Set(),
  };
}

function createFormProps(): VisualYamlEditorFormProps {
  return {
    addErrors: [],
    addWarnings: [],
    isYamlWarningsEnabled: true,
    isRichTextEnabled: false,
    editTriggersText: "",
    setEditTriggersText: vi.fn(),
    activeSnippetKind: "text",
    setAddSnippetKind: vi.fn(),
    textReplacementFormat: "plain",
    setTextReplacementFormat: vi.fn(),
    setAddErrors: vi.fn(),
    setAddWarnings: vi.fn(),
    editIncludeFile: "",
    setEditIncludeFile: vi.fn(),
    chooseSnippetFile: vi.fn(),
    editImagePath: "",
    setEditImagePath: vi.fn(),
    chooseSnippetImageFile: vi.fn(),
    editForm: "",
    setEditForm: vi.fn(),
    formTextareaRef: createRef<HTMLTextAreaElement>(),
    formSelection: null,
    setFormSelection: vi.fn(),
    captureFormSelection: vi.fn(),
    configureSelectedFormField: vi.fn(),
    editVars: [],
    handleInsertDateVariable: vi.fn(),
    handleRemoveDateVar: vi.fn(),
    editFormFieldConfigs: [],
    undoFormField: vi.fn(),
    updateFormFieldConfig: vi.fn(),
    editReplace: "",
    setEditReplace: vi.fn(),
    visualEditorReplaceTextareaRef: createRef<HTMLTextAreaElement>(),
    editDescription: "",
    setEditDescription: vi.fn(),
  };
}

function createActionProps(saveSnippetToYaml = vi.fn()): VisualYamlEditorActionProps {
  return {
    deleteSnippetFromYaml: vi.fn(),
    saveSnippetToYaml,
    isSavingSnippet: false,
    showAlert: vi.fn(),
    resetSnippetForm: vi.fn(),
    setSnippetEditTarget: vi.fn(),
  };
}

function renderDialog(actions = createActionProps()) {
  const props: VisualYamlEditorDialogProps = {
    isOpen: true,
    onOpenChange: vi.fn(),
    snippetEditTarget: null,
    selectedEspansoPreview: preview,
    t: (key, options) => translate("en", key, options),
    visualEditor: createVisualEditorProps(),
    form: createFormProps(),
    actions,
  };

  renderWithProviders(<VisualYamlEditorDialog {...props} />);
}

describe("VisualYamlEditorDialog", () => {
  it("saves the snippet when Enter is pressed in a single-line field", async () => {
    const user = userEvent.setup();
    const saveSnippetToYaml = vi.fn();
    renderDialog(createActionProps(saveSnippetToYaml));

    await user.click(screen.getByLabelText(/Trigger/u));
    await user.keyboard("{Enter}");

    expect(saveSnippetToYaml).toHaveBeenCalledTimes(1);
  });

  it("keeps Enter available for multi-line snippet content", () => {
    const saveSnippetToYaml = vi.fn();
    renderDialog(createActionProps(saveSnippetToYaml));

    fireEvent.keyDown(screen.getByLabelText(/Replace Content/u), { key: "Enter" });

    expect(saveSnippetToYaml).not.toHaveBeenCalled();
  });
});
