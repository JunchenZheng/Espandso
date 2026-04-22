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

function createFormProps(overrides: Partial<VisualYamlEditorFormProps> = {}): VisualYamlEditorFormProps {
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
    ...overrides,
  };
}

function createActionProps(saveSnippetToYaml = vi.fn()): VisualYamlEditorActionProps {
  return {
    deleteSnippetFromYaml: vi.fn(),
    saveSnippetToYaml,
    isSavingSnippet: false,
    showAlert: vi.fn(),
    showConfirm: vi.fn(),
    resetSnippetForm: vi.fn(),
    setSnippetEditTarget: vi.fn(),
  };
}

function renderDialog(
  actions = createActionProps(),
  formOverrides: Partial<VisualYamlEditorFormProps> = {},
  visualEditorOverrides: Partial<VisualYamlEditorStateProps> = {},
) {
  const onOpenChange = vi.fn();
  const props: VisualYamlEditorDialogProps = {
    isOpen: true,
    onOpenChange,
    snippetEditTarget: null,
    selectedEspansoPreview: preview,
    t: (key, options) => translate("en", key, options),
    visualEditor: {
      ...createVisualEditorProps(),
      ...visualEditorOverrides,
    },
    form: createFormProps(formOverrides),
    actions,
  };

  renderWithProviders(<VisualYamlEditorDialog {...props} />);

  return { onOpenChange };
}

describe("VisualYamlEditorDialog", () => {
  it("hides the text format selector by default", () => {
    renderDialog();

    expect(screen.queryByLabelText("Plain Text")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Markdown")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("HTML")).not.toBeInTheDocument();
  });

  it("shows rich text format options when enabled", () => {
    renderDialog(createActionProps(), { isRichTextEnabled: true });

    expect(screen.getByLabelText("Plain Text")).toBeChecked();
    expect(screen.getByLabelText("Markdown")).not.toBeChecked();
    expect(screen.getByLabelText("HTML")).not.toBeChecked();
  });

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

  it("asks for confirmation before canceling a dirty add workflow", async () => {
    const user = userEvent.setup();
    const actions = createActionProps();
    const { onOpenChange } = renderDialog(actions, { editTriggersText: ":draft" });

    await user.click(screen.getByRole("button", { name: /Cancel/u }));

    expect(actions.showConfirm).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(actions.resetSnippetForm).not.toHaveBeenCalled();

    const onConfirm = vi.mocked(actions.showConfirm).mock.calls[0][1] as () => void;
    onConfirm();

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(actions.resetSnippetForm).toHaveBeenCalledTimes(1);
    expect(actions.setSnippetEditTarget).toHaveBeenCalledWith(null);
  });

  it("asks for confirmation before closing a dirty delete workflow with Escape", async () => {
    const user = userEvent.setup();
    const actions = createActionProps();
    const { onOpenChange } = renderDialog(
      actions,
      {},
      {
        visualEditorMode: "delete",
        pendingDeleteSelections: [{ matchIndex: 0, triggerIndex: 0 }],
      },
    );

    await user.keyboard("{Escape}");

    expect(actions.showConfirm).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(vi.mocked(actions.showConfirm).mock.calls[0][2]).toBe("Discard Unsaved Changes?");
    expect(vi.mocked(actions.showConfirm).mock.calls[0][3]).toBe("Discard Changes");
    expect(vi.mocked(actions.showConfirm).mock.calls[0][4]).toBe("Keep Editing");
  });

  it("closes a clean visual editor without confirmation", async () => {
    const user = userEvent.setup();
    const actions = createActionProps();
    const { onOpenChange } = renderDialog(actions);

    await user.keyboard("{Escape}");

    expect(actions.showConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(actions.resetSnippetForm).toHaveBeenCalledTimes(1);
  });
});
