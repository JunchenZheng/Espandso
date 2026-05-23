import { useRef, type KeyboardEvent, type RefObject } from "react";
import type { DateFormatOption } from "../../../logic/dateFormats";
import {
  AlertTriangle,
  AlignLeft,
  FileSearch,
  ImageIcon,
  List,
  ListChecks,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Type,
  Upload,
  XCircle,
} from "lucide-react";
import { Button } from "../../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Textarea } from "../../../components/ui/textarea";
import { OptionalMark, RequiredMark } from "../../../components/shared/FormMarks";
import { useI18n } from "../../../i18n/useI18n";
import { cn } from "../../../lib/utils";
import { buildTriggerInput, isImageFilePath } from "../../../logic/snippetUtils";
import { isBinaryDomFile } from "../../../logic/fileCheck";
import type { Snippet, SnippetVar, ValidationError } from "../../../logic/types";
import { DateInsertMenu } from "./DateInsertMenu";
import { DateVariableList } from "./DateVariableList";
import type { EspansoConfigPreview } from "../../espanso-configs/types";
import type {
  AddSnippetKind,
  FormFieldConfig,
  FormFieldControl,
  FormSelectionState,
  SnippetEditTarget,
  TextReplacementFormat,
} from "../types";
import {
  getFormFieldCategory,
  getTextFieldMode,
  formFieldsToConfigs,
  snippetKindLabel,
} from "../formSnippet";

export interface SnippetEditDialogFormProps {
  isYamlWarningsEnabled: boolean;
  isRichTextEnabled: boolean;
  addErrors: ValidationError[];
  addWarnings: string[];
  editTriggersText: string;
  setEditTriggersText: (val: string) => void;
  activeSnippetKind: AddSnippetKind;
  setAddSnippetKind: (kind: AddSnippetKind) => void;
  textReplacementFormat: TextReplacementFormat;
  setTextReplacementFormat: (format: TextReplacementFormat) => void;
  setAddErrors: (errors: any[]) => void;
  setAddWarnings: (warnings: string[]) => void;
  editIncludeFile: string;
  setEditIncludeFile: (path: string) => void;
  chooseSnippetFile: () => void;
  editImagePath: string;
  setEditImagePath: (path: string) => void;
  chooseSnippetImageFile: () => void;
  editForm: string;
  setEditForm: (form: string) => void;
  formTextareaRef: RefObject<HTMLTextAreaElement | null>;
  formSelection: FormSelectionState | null;
  setFormSelection: (sel: FormSelectionState | null) => void;
  captureFormSelection: (textarea: HTMLTextAreaElement) => boolean;
  configureSelectedFormField: (control: FormFieldControl) => void;
  editVars: SnippetVar[];
  handleInsertDateVariable: (opt: DateFormatOption, target: "replace" | "form") => void;
  handleRemoveDateVar: (key: string) => void;
  editFormFieldConfigs: FormFieldConfig[];
  undoFormField: (fieldId: string) => void;
  updateFormFieldConfig: (id: string, patch: Partial<FormFieldConfig>) => void;
  editReplace: string;
  setEditReplace: (val: string) => void;
  replaceTextareaRef: RefObject<HTMLTextAreaElement | null>;
  editDescription: string;
  setEditDescription: (val: string) => void;
}

export interface SnippetEditDialogActionProps {
  deleteSnippetFromYaml: (target: SnippetEditTarget) => void;
  saveSnippetToYaml: () => void;
  isSavingSnippet: boolean;
  showAlert: (description: string, title?: string) => void;
  showConfirm: (
    description: string,
    onConfirm: () => void | Promise<void>,
    title?: string,
    confirmText?: string,
    cancelText?: string,
  ) => void;
  resetSnippetForm: () => void;
  setSnippetEditTarget: (target: SnippetEditTarget | null) => void;
}

interface SnippetEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snippetEditTarget: SnippetEditTarget | null;
  selectedEspansoPreview: EspansoConfigPreview | null;
  form: SnippetEditDialogFormProps;
  actions: SnippetEditDialogActionProps;
}

export function SnippetEditDialog({
  open,
  onOpenChange,
  snippetEditTarget,
  selectedEspansoPreview,
  form,
  actions,
}: SnippetEditDialogProps) {
  const { t } = useI18n();

  const {
    isYamlWarningsEnabled,
    isRichTextEnabled,
    addErrors,
    addWarnings,
    editTriggersText,
    setEditTriggersText,
    activeSnippetKind,
    setAddSnippetKind,
    textReplacementFormat,
    setTextReplacementFormat,
    setAddErrors,
    setAddWarnings,
    editIncludeFile,
    setEditIncludeFile,
    chooseSnippetFile,
    editImagePath,
    setEditImagePath,
    chooseSnippetImageFile,
    editForm,
    setEditForm,
    formTextareaRef,
    formSelection,
    setFormSelection,
    captureFormSelection,
    configureSelectedFormField,
    editVars,
    handleInsertDateVariable,
    handleRemoveDateVar,
    editFormFieldConfigs,
    undoFormField,
    updateFormFieldConfig,
    editReplace,
    setEditReplace,
    replaceTextareaRef,
    editDescription,
    setEditDescription,
  } = form;

  const {
    deleteSnippetFromYaml,
    saveSnippetToYaml,
    isSavingSnippet,
    showAlert,
    showConfirm,
    resetSnippetForm,
    setSnippetEditTarget,
  } = actions;

  const textFormatOptions: Array<readonly [TextReplacementFormat, string]> = isRichTextEnabled
    ? [
        ["plain", t("snippets.textFormatPlain")],
        ["markdown", t("snippets.textFormatMarkdown")],
        ["html", t("snippets.textFormatHtml")],
      ]
    : [["plain", t("snippets.textFormatPlain")]];

  const snippetDialogTitle = snippetEditTarget
    ? t("snippets.editKindSnippetTitle", { kind: snippetKindLabel(activeSnippetKind, t) })
    : t("snippets.addKindSnippetTitle", { kind: snippetKindLabel(activeSnippetKind, t) });
  const shouldUseSnippetTabFlow = activeSnippetKind === "text" || activeSnippetKind === "form";
  const descriptionInputRef = useRef<HTMLInputElement | null>(null);
  const saveButtonRef = useRef<HTMLButtonElement | null>(null);

  const getSnippetKind = (snippet: Snippet): AddSnippetKind => {
    if (snippet.include_file) return "file";
    if (snippet.image_path !== undefined) return "image";
    if (snippet.form !== undefined) return "form";
    return "text";
  };

  const getTextReplacementFormat = (snippet: Snippet): TextReplacementFormat => {
    if (snippet.markdown !== undefined) return "markdown";
    if (snippet.html !== undefined) return "html";
    return "plain";
  };

  const getTextReplacementContent = (snippet: Snippet): string => {
    if (snippet.markdown !== undefined) return snippet.markdown;
    if (snippet.html !== undefined) return snippet.html;
    return snippet.replace || "";
  };

  const areJsonEqual = (left: unknown, right: unknown) => JSON.stringify(left ?? null) === JSON.stringify(right ?? null);

  const hasUnsavedChanges = () => {
    if (!snippetEditTarget) {
      return (
        editTriggersText.length > 0 ||
        editReplace.length > 0 ||
        editIncludeFile.length > 0 ||
        editImagePath.length > 0 ||
        editForm.length > 0 ||
        editDescription.length > 0 ||
        editVars.length > 0 ||
        editFormFieldConfigs.length > 0
      );
    }

    const originalSnippet = snippetEditTarget.match.originalSnippet || snippetEditTarget.match.snippet;
    const originalKind = getSnippetKind(originalSnippet);

    if (activeSnippetKind !== originalKind) return true;
    if (editTriggersText !== buildTriggerInput(originalSnippet).multiline) return true;
    if (editDescription !== (originalSnippet.description || "")) return true;

    if (activeSnippetKind === "file") {
      return editIncludeFile !== (snippetEditTarget.match.resourcePath || originalSnippet.include_file || "");
    }

    if (activeSnippetKind === "image") {
      return editImagePath !== (originalSnippet.image_path || "");
    }

    if (activeSnippetKind === "form") {
      return (
        editForm !== (originalSnippet.form || "") ||
        !areJsonEqual(editVars, originalSnippet.vars || []) ||
        !areJsonEqual(editFormFieldConfigs, formFieldsToConfigs(originalSnippet.form_fields))
      );
    }

    return (
      textReplacementFormat !== getTextReplacementFormat(originalSnippet) ||
      editReplace !== getTextReplacementContent(originalSnippet) ||
      !areJsonEqual(editVars, originalSnippet.vars || [])
    );
  };

  const closeSnippetDialog = () => {
    onOpenChange(false);
    resetSnippetForm();
    setSnippetEditTarget(null);
  };

  const requestCloseSnippetDialog = () => {
    if (!hasUnsavedChanges()) {
      closeSnippetDialog();
      return;
    }

    showConfirm(
      t("dialogs.discardSnippetChanges.message"),
      closeSnippetDialog,
      t("dialogs.discardSnippetChanges.title"),
      t("dialogs.discardSnippetChanges.confirmBtn"),
      t("dialogs.discardSnippetChanges.cancelBtn"),
    );
  };

  const focusActiveSnippetTextarea = () => {
    const textarea = activeSnippetKind === "form" ? formTextareaRef.current : replaceTextareaRef.current;
    textarea?.focus();
  };

  const isActiveSnippetTextarea = (target: EventTarget | null) => {
    const textarea = activeSnippetKind === "form" ? formTextareaRef.current : replaceTextareaRef.current;
    return shouldUseSnippetTabFlow && target instanceof HTMLTextAreaElement && target === textarea;
  };

  const insertTabIndent = (
    textarea: HTMLTextAreaElement,
    value: string,
    setValue: (val: string) => void,
  ) => {
    const start = textarea.selectionStart ?? value.length;
    const end = textarea.selectionEnd ?? value.length;
    const nextValue = `${value.slice(0, start)}\t${value.slice(end)}`;
    const nextCursor = start + 1;

    setValue(nextValue);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const handleSnippetTextareaKeyDown = (
    event: KeyboardEvent<HTMLTextAreaElement>,
    value: string,
    setValue: (val: string) => void,
  ) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.stopPropagation();
      if (!isSavingSnippet) {
        saveSnippetToYaml();
      }
      return true;
    }

    if (event.key === "Tab" && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      event.stopPropagation();
      insertTabIndent(event.currentTarget, value, setValue);
      return true;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      descriptionInputRef.current?.focus();
      return true;
    }

    return false;
  };

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (
      event.key !== "Enter" ||
      event.nativeEvent.isComposing ||
      isSavingSnippet ||
      (!event.metaKey && !event.ctrlKey)
    ) {
      return;
    }

    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) {
      return;
    }

    if (
      target instanceof HTMLInputElement &&
      ["button", "checkbox", "file", "radio", "reset", "submit"].includes(target.type)
    ) {
      return;
    }

    event.preventDefault();
    saveSnippetToYaml();
  };

  return (
    <Dialog open={open} onOpenChange={(val) => {
      if (val) {
        onOpenChange(true);
        return;
      }

      requestCloseSnippetDialog();
    }}>
      <DialogContent
        data-testid="snippet-edit-dialog"
        className="grid h-[calc(100vh-3rem)] max-h-[calc(100vh-3rem)] w-[50vw] min-w-[min(36rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden"
        onKeyDown={handleDialogKeyDown}
        onEscapeKeyDown={(event) => {
          if (isActiveSnippetTextarea(event.target)) {
            event.preventDefault();
            descriptionInputRef.current?.focus();
          }
        }}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>{snippetDialogTitle}</DialogTitle>
          <DialogDescription className="break-all">
            {snippetEditTarget?.preview.config.relativePath || selectedEspansoPreview?.config.relativePath || t("snippets.selectYamlFile")}
            {snippetEditTarget ? ` · ${t("snippets.snippetNumber", { number: snippetEditTarget.displayIndex + 1 })}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 flex flex-col space-y-4 overflow-y-auto pr-1">
          {(addErrors.length > 0 || (isYamlWarningsEnabled && addWarnings.length > 0)) && (
            <div
              className={cn(
                "space-y-2 rounded-lg border p-4 text-sm shrink-0",
                addErrors.length > 0
                  ? "border-destructive/30 bg-destructive/10 text-destructive"
                  : "border-amber-300 bg-amber-50 text-amber-800",
              )}
            >
              {addErrors.map((e, idx) => (
                <div key={`err-${idx}`} className="flex gap-2">
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{e.message}</span>
                </div>
              ))}
              {isYamlWarningsEnabled &&
                addWarnings.map((w, idx) => (
                  <div key={`warn-${idx}`} className="flex gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{w}</span>
                  </div>
                ))}
            </div>
          )}

          <div className="space-y-2 shrink-0">
            <Label htmlFor="trigger-0" className="inline-flex items-center">
              {t("snippets.trigger")} <RequiredMark />
            </Label>
            <div className="space-y-2">
              {(editTriggersText ? editTriggersText.split("\n") : [""]).map((line, idx, lines) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    id={idx === 0 ? "trigger-0" : undefined}
                    data-testid={`trigger-input-${idx}`}
                    className="mono-field flex-1"
                    placeholder={`e.g. ${idx === 0 ? ":hello" : idx === 1 ? ":hi" : ":hey"}`}
                    value={line}
                    onChange={(e) => {
                      const newLines = [...lines];
                      newLines[idx] = e.target.value;
                      setEditTriggersText(newLines.join("\n"));
                    }}
                    onKeyDown={(event) => {
                      if (
                        shouldUseSnippetTabFlow &&
                        idx === 0 &&
                        event.key === "Tab" &&
                        !event.shiftKey &&
                        !event.metaKey &&
                        !event.ctrlKey &&
                        !event.altKey
                      ) {
                        event.preventDefault();
                        focusActiveSnippetTextarea();
                      }
                    }}
                  />
                  {lines.length > 1 && (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                      title={t("snippets.removeTrigger")}
                      onClick={() => setEditTriggersText(lines.filter((_, i) => i !== idx).join("\n"))}
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button
                type="button"
                size="sm"
                variant="outline"
                data-testid="add-trigger-alias-btn"
                className="w-full border-dashed text-xs"
                onClick={() => setEditTriggersText([...(editTriggersText ? editTriggersText.split("\n") : [""]), ""].join("\n"))}
              >
                <Plus className="h-3.5 w-3.5" />
                {t("snippets.addTriggerAlias")}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-4 rounded-md border bg-secondary/60 p-1 shrink-0">
            <Button
              type="button"
              data-testid="snippet-kind-text"
              variant={activeSnippetKind === "text" ? "default" : "ghost"}
              className="h-8"
              onClick={() => {
                setAddSnippetKind("text");
                setAddErrors([]);
                setAddWarnings([]);
              }}
            >
              {t("snippets.typeTextShort")}
            </Button>
            <Button
              type="button"
              data-testid="snippet-kind-file"
              variant={activeSnippetKind === "file" ? "default" : "ghost"}
              className="h-8"
              onClick={() => {
                setAddSnippetKind("file");
                setAddErrors([]);
                setAddWarnings([]);
              }}
            >
              {t("snippets.typeFileShort")}
            </Button>
            <Button
              type="button"
              data-testid="snippet-kind-image"
              variant={activeSnippetKind === "image" ? "default" : "ghost"}
              className="h-8"
              onClick={() => {
                setAddSnippetKind("image");
                setAddErrors([]);
                setAddWarnings([]);
              }}
            >
              {t("snippets.typeImageShort")}
            </Button>
            <Button
              type="button"
              data-testid="snippet-kind-form"
              variant={activeSnippetKind === "form" ? "default" : "ghost"}
              className="h-8"
              onClick={() => {
                setAddSnippetKind("form");
                setAddErrors([]);
                setAddWarnings([]);
              }}
            >
              {t("snippets.typeFormShort")}
            </Button>
          </div>

          {activeSnippetKind === "file" ? (
            <div className="space-y-3 shrink-0">
              <Label htmlFor="include-file" className="inline-flex items-center">
                {t("snippets.file")} <RequiredMark />
              </Label>
              <div
                className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-md border border-dashed bg-secondary/30 p-5 text-center"
                onDragOver={(event) => event.preventDefault()}
                onDrop={async (event) => {
                  event.preventDefault();
                  const droppedFile = event.dataTransfer.files[0];
                  const droppedPath = droppedFile ? (droppedFile as File & { path?: string }).path || droppedFile.name : "";
                  if (droppedFile) {
                    const isBinary = await isBinaryDomFile(droppedFile);
                    if (isBinary) {
                      showAlert(t("errors.binaryFileNotAllowed"), t("errors.invalidFileType"));
                      return;
                    }
                  }
                  if (droppedPath) {
                    if (isImageFilePath(droppedPath)) {
                      showAlert(t("errors.imageFileNotAllowed"), t("errors.invalidFileType"));
                      return;
                    }
                    setEditIncludeFile(droppedPath);
                  }
                }}
              >
                <Upload className="h-8 w-8 text-muted-foreground" />
                <div className="w-full space-y-2">
                  <Input
                    id="include-file"
                    className="mono-field"
                    placeholder={t("snippets.filePathPlaceholder")}
                    value={editIncludeFile}
                    onChange={(e) => setEditIncludeFile(e.target.value)}
                  />
                  <Button type="button" variant="outline" onClick={chooseSnippetFile}>
                    <FileSearch className="h-4 w-4" />
                    {t("snippets.chooseFile")}
                  </Button>
                </div>
              </div>
              {isImageFilePath(editIncludeFile) && (
                <p className="text-xs font-medium text-destructive">
                  {t("errors.imageFileNotAllowed")}
                </p>
              )}
            </div>
          ) : activeSnippetKind === "image" ? (
            <div className="space-y-3 shrink-0">
              <Label htmlFor="image-path" className="inline-flex items-center">
                {t("snippets.imagePath")} <RequiredMark />
              </Label>
              <div
                className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-md border border-dashed bg-secondary/30 p-5 text-center"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const droppedFile = event.dataTransfer.files[0];
                  const droppedPath = droppedFile ? (droppedFile as File & { path?: string }).path : "";
                  if (droppedPath) {
                    setEditImagePath(droppedPath);
                  }
                }}
              >
                <ImageIcon className="h-8 w-8 text-muted-foreground" />
                <div className="w-full space-y-2">
                  <Input
                    id="image-path"
                    className="mono-field"
                    placeholder={t("snippets.imagePathPlaceholder")}
                    value={editImagePath}
                    onChange={(e) => setEditImagePath(e.target.value)}
                  />
                  <Button type="button" variant="outline" onClick={chooseSnippetImageFile}>
                    <FileSearch className="h-4 w-4" />
                    {t("snippets.chooseImage")}
                  </Button>
                </div>
              </div>
            </div>
          ) : activeSnippetKind === "form" ? (
            <div className="flex-1 flex flex-col min-h-0 space-y-4">
              <div className="flex-1 flex flex-col space-y-2 min-h-[120px]">
                <div className="flex items-center justify-between">
                  <Label htmlFor="form" className="inline-flex items-center shrink-0">
                    {t("snippets.formLayout")} <RequiredMark />
                  </Label>
                  <DateInsertMenu onSelect={(opt) => handleInsertDateVariable(opt, "form")} />
                </div>
                <Textarea
                  id="form"
                  ref={formTextareaRef}
                  className="mono-field flex-1 h-full min-h-[120px] resize-y"
                  placeholder={"=== Ticket ===\nTitle: title\nCategory: category\n\nDescription:\ndescription"}
                  value={editForm}
                  onChange={(e) => {
                    setEditForm(e.target.value);
                    setFormSelection(null);
                  }}
                  onKeyDown={(event) => {
                    if (handleSnippetTextareaKeyDown(event, editForm, setEditForm)) {
                      setFormSelection(null);
                      return;
                    }
                    if (event.key !== "Shift" && event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "ArrowUp" && event.key !== "ArrowDown") {
                      setFormSelection(null);
                    }
                  }}
                  onKeyUp={(event) => captureFormSelection(event.currentTarget)}
                  onMouseUp={(event) => {
                    if (event.button !== 0) return;
                    captureFormSelection(event.currentTarget);
                  }}
                  onSelect={(event) => captureFormSelection(event.currentTarget)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    captureFormSelection(event.currentTarget);
                  }}
                />
              </div>
              <DateVariableList vars={editVars} onRemove={handleRemoveDateVar} />
              <div className="space-y-2 rounded-md border bg-secondary/25 p-3 shrink-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label>{t("formBuilder.selectedTextAction")}</Label>
                  <span className="max-w-full truncate text-xs text-muted-foreground">
                    {formSelection ? formSelection.text.trim() : t("formBuilder.selectTextHint")}
                  </span>
                </div>
                <div className="grid gap-2 sm:grid-cols-4">
                  {([
                    ["text", t("formBuilder.singleLineText"), Type],
                    ["multiline", t("formBuilder.multilineText"), AlignLeft],
                    ["choice", t("formBuilder.choiceBox"), ListChecks],
                    ["list", t("formBuilder.listBox"), List],
                  ] as const).map(([control, label, Icon]) => (
                    <Button
                      key={control}
                      type="button"
                      variant="outline"
                      disabled={!formSelection}
                      className="justify-start"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => configureSelectedFormField(control)}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </Button>
                  ))}
                </div>
              </div>
              {editFormFieldConfigs.length > 0 && (
                <div className="space-y-3 shrink-0">
                  <Label>{t("formBuilder.fields")}</Label>
                  {editFormFieldConfigs.map((field, fieldIndex) => (
                    <div key={field.id} className="space-y-3 rounded-md border bg-secondary/25 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="mono-field min-w-0 truncate text-sm font-semibold">[[{field.id}]]</div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 shrink-0 text-xs"
                          onClick={() => undoFormField(field.id)}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          {t("actions.undo")}
                        </Button>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-3">
                        {([
                          ["text", t("formBuilder.textFields")],
                          ["choice", t("formBuilder.choiceBox")],
                          ["list", t("formBuilder.listBox")],
                        ] as const).map(([category, label]) => (
                          <label
                            key={category}
                            className={cn(
                              "flex min-h-9 items-center gap-2 rounded-md border bg-background px-3 text-sm",
                              getFormFieldCategory(field) === category && "border-primary bg-primary/10",
                            )}
                          >
                            <input
                              type="radio"
                              name={`form-field-category-${fieldIndex}`}
                              className="h-4 w-4 accent-primary"
                              checked={getFormFieldCategory(field) === category}
                              onChange={() => updateFormFieldConfig(field.id, { control: category })}
                            />
                            <span>{label}</span>
                          </label>
                        ))}
                      </div>
                      {getFormFieldCategory(field) === "text" && (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label>{t("formBuilder.textFieldShape")}</Label>
                            <div className="grid grid-cols-2 gap-2">
                              {([
                                ["single", t("formBuilder.singleLine")],
                                ["multiline", t("formBuilder.multiline")],
                              ] as const).map(([mode, label]) => (
                                <label
                                  key={mode}
                                  className={cn(
                                    "flex min-h-9 items-center gap-2 rounded-md border bg-background px-3 text-sm",
                                    getTextFieldMode(field) === mode && "border-primary bg-primary/10",
                                  )}
                                >
                                  <input
                                    type="radio"
                                    name={`form-text-mode-${fieldIndex}`}
                                    className="h-4 w-4 accent-primary"
                                    checked={getTextFieldMode(field) === mode}
                                    onChange={() => updateFormFieldConfig(field.id, { control: mode === "multiline" ? "multiline" : "text" })}
                                  />
                                  <span>{label}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`form-field-default-${fieldIndex}`} className="inline-flex items-center">
                              {t("formBuilder.defaultValue")} <OptionalMark />
                            </Label>
                            {field.control === "multiline" ? (
                              <Textarea
                                id={`form-field-default-${fieldIndex}`}
                                className="mono-field min-h-24 resize-y"
                                value={field.defaultValue}
                                onChange={(event) => updateFormFieldConfig(field.id, { defaultValue: event.target.value })}
                              />
                            ) : (
                              <Input
                                id={`form-field-default-${fieldIndex}`}
                                value={field.defaultValue}
                                onChange={(event) => updateFormFieldConfig(field.id, { defaultValue: event.target.value })}
                              />
                            )}
                          </div>
                        </div>
                      )}
                      {(field.control === "choice" || field.control === "list") && (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor={`form-field-default-${fieldIndex}`} className="inline-flex items-center">
                              {t("formBuilder.defaultValue")} <OptionalMark />
                            </Label>
                            <Input
                              id={`form-field-default-${fieldIndex}`}
                              value={field.defaultValue}
                              onChange={(event) => updateFormFieldConfig(field.id, { defaultValue: event.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`form-field-values-${fieldIndex}`} className="inline-flex items-center">
                              {t("formBuilder.values")} <RequiredMark />
                            </Label>
                            <Textarea
                              id={`form-field-values-${fieldIndex}`}
                              className="mono-field min-h-24 resize-y"
                              placeholder={"First choice\nSecond choice"}
                              value={field.valuesText}
                              onChange={(event) => updateFormFieldConfig(field.id, { valuesText: event.target.value })}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col space-y-3 min-h-[120px]">
              {isRichTextEnabled && (
                <div className="grid gap-2 sm:grid-cols-3">
                  {textFormatOptions.map(([format, label]) => (
                    <label
                      key={format}
                      className={cn(
                        "flex min-h-9 items-center gap-2 rounded-md border bg-background px-3 text-sm",
                        textReplacementFormat === format && "border-primary bg-primary/10",
                      )}
                    >
                      <input
                        type="radio"
                        name="text-replacement-format"
                        className="h-4 w-4 accent-primary"
                        checked={textReplacementFormat === format}
                        onChange={() => setTextReplacementFormat(format)}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between">
                <Label htmlFor="replace" className="inline-flex items-center shrink-0">
                  {t("snippets.replaceContent")} <RequiredMark />
                </Label>
                <DateInsertMenu onSelect={(opt) => handleInsertDateVariable(opt, "replace")} />
              </div>
              <Textarea
                id="replace"
                ref={replaceTextareaRef}
                className="mono-field flex-1 h-full min-h-[120px] resize-y"
                placeholder={t("snippets.replaceContentPlaceholder")}
                value={editReplace}
                onChange={(e) => setEditReplace(e.target.value)}
                onKeyDown={(event) => handleSnippetTextareaKeyDown(event, editReplace, setEditReplace)}
              />
              <DateVariableList vars={editVars} onRemove={handleRemoveDateVar} />
            </div>
          )}

          <div className="space-y-2 shrink-0">
            <Label htmlFor="description" className="inline-flex items-center">
              {t("snippets.descriptionLabel")} <OptionalMark />
            </Label>
            <Input
              id="description"
              ref={descriptionInputRef}
              placeholder={t("snippets.descriptionPlaceholder")}
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              onKeyDown={(event) => {
                if (
                  shouldUseSnippetTabFlow &&
                  event.key === "Tab" &&
                  !event.shiftKey &&
                  !event.metaKey &&
                  !event.ctrlKey &&
                  !event.altKey
                ) {
                  event.preventDefault();
                  saveButtonRef.current?.focus();
                }
              }}
            />
          </div>
        </div>

        <DialogFooter className={cn(snippetEditTarget && "sm:justify-between")}>
          {snippetEditTarget && (
            <Button
              variant="destructive"
              onClick={() => deleteSnippetFromYaml(snippetEditTarget)}
            >
              <Trash2 className="h-4 w-4" />
              {t("actions.delete")}
            </Button>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={requestCloseSnippetDialog}>
              {t("actions.cancel")}
            </Button>
            <Button
              ref={saveButtonRef}
              onClick={saveSnippetToYaml}
              disabled={isSavingSnippet}
            >
              {isSavingSnippet ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {snippetEditTarget ? t("actions.updateYaml") : t("actions.saveToYaml")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
