import { createRef } from "react";
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../../test/render";
import type { EspansoConfigPreview } from "../../espanso-configs/types";
import type { SnippetEditDialogActionProps, SnippetEditDialogFormProps } from "./SnippetEditDialog";
import { SnippetEditDialog } from "./SnippetEditDialog";

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

function createFormProps(): SnippetEditDialogFormProps {
  return {
    isYamlWarningsEnabled: true,
    addErrors: [],
    addWarnings: [],
    editTriggersText: "",
    setEditTriggersText: vi.fn(),
    activeSnippetKind: "text",
    setAddSnippetKind: vi.fn(),
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
    captureFormSelection: vi.fn(() => false),
    configureSelectedFormField: vi.fn(),
    editVars: [],
    handleInsertDateVariable: vi.fn(),
    handleRemoveDateVar: vi.fn(),
    editFormFieldConfigs: [],
    undoFormField: vi.fn(),
    updateFormFieldConfig: vi.fn(),
    editReplace: "",
    setEditReplace: vi.fn(),
    replaceTextareaRef: createRef<HTMLTextAreaElement>(),
    editDescription: "",
    setEditDescription: vi.fn(),
  };
}

function createActionProps(saveSnippetToYaml = vi.fn()): SnippetEditDialogActionProps {
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
  renderWithProviders(
    <SnippetEditDialog
      open
      onOpenChange={vi.fn()}
      snippetEditTarget={null}
      selectedEspansoPreview={preview}
      form={createFormProps()}
      actions={actions}
    />,
  );
}

describe("SnippetEditDialog", () => {
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
