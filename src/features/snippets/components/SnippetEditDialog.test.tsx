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

function createFormProps(overrides: Partial<SnippetEditDialogFormProps> = {}): SnippetEditDialogFormProps {
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
    ...overrides,
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

function renderDialog(
  actions = createActionProps(),
  formOverrides: Partial<SnippetEditDialogFormProps> = {},
) {
  renderWithProviders(
    <SnippetEditDialog
      open
      onOpenChange={vi.fn()}
      snippetEditTarget={null}
      selectedEspansoPreview={preview}
      form={createFormProps(formOverrides)}
      actions={actions}
    />,
  );
}

describe("SnippetEditDialog", () => {
  it("does not save the snippet when plain Enter is pressed in a single-line field", async () => {
    const user = userEvent.setup();
    const saveSnippetToYaml = vi.fn();
    renderDialog(createActionProps(saveSnippetToYaml));

    await user.click(screen.getByLabelText(/Trigger/u));
    await user.keyboard("{Enter}");

    expect(saveSnippetToYaml).not.toHaveBeenCalled();
  });

  it("keeps Enter available for multi-line snippet content", () => {
    const saveSnippetToYaml = vi.fn();
    renderDialog(createActionProps(saveSnippetToYaml));

    fireEvent.keyDown(screen.getByLabelText(/Replace Content/u), { key: "Enter" });

    expect(saveSnippetToYaml).not.toHaveBeenCalled();
  });

  it("saves from input and textarea fields with the platform submit shortcut", async () => {
    const user = userEvent.setup();
    const saveSnippetToYaml = vi.fn();
    renderDialog(createActionProps(saveSnippetToYaml));

    const triggerInput = screen.getByLabelText(/Trigger/u);
    const replaceTextarea = screen.getByLabelText(/Replace Content/u);

    await user.click(triggerInput);
    await user.keyboard("{Control>}{Enter}{/Control}");
    expect(saveSnippetToYaml).toHaveBeenCalledTimes(1);

    await user.click(replaceTextarea);
    await user.keyboard("{Meta>}{Enter}{/Meta}");
    expect(saveSnippetToYaml).toHaveBeenCalledTimes(2);
  });

  it("uses Tab and Escape for the add text snippet focus path without stealing textarea indentation", async () => {
    const user = userEvent.setup();
    const setEditReplace = vi.fn();
    renderDialog(createActionProps(), { editReplace: "hello", setEditReplace });

    const triggerInput = screen.getByLabelText(/Trigger/u);
    const replaceTextarea = screen.getByLabelText(/Replace Content/u);
    const descriptionInput = screen.getByLabelText(/Description/u);
    const saveButton = screen.getByRole("button", { name: /Save to YAML/u });

    await user.click(triggerInput);
    await user.tab();
    expect(replaceTextarea).toHaveFocus();

    await user.keyboard("{Tab}");
    expect(setEditReplace).toHaveBeenCalledWith("\thello");
    expect(replaceTextarea).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(descriptionInput).toHaveFocus();

    await user.tab();
    expect(saveButton).toHaveFocus();
  });

  it("uses Tab and Escape for the add form snippet focus path without stealing textarea indentation", async () => {
    const user = userEvent.setup();
    const setEditForm = vi.fn();
    renderDialog(createActionProps(), {
      activeSnippetKind: "form",
      editForm: "title",
      setEditForm,
    });

    const triggerInput = screen.getByLabelText(/Trigger/u);
    const formTextarea = screen.getByLabelText(/Form Layout/u);
    const descriptionInput = screen.getByLabelText(/Description/u);
    const saveButton = screen.getByRole("button", { name: /Save to YAML/u });

    await user.click(triggerInput);
    await user.tab();
    expect(formTextarea).toHaveFocus();

    await user.keyboard("{Tab}");
    expect(setEditForm).toHaveBeenCalledWith("\ttitle");
    expect(formTextarea).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(descriptionInput).toHaveFocus();

    await user.tab();
    expect(saveButton).toHaveFocus();
  });
});
