import React from "react";
import {
  Columns,
  Plus,
  Trash2,
  FileSearch,
  RotateCcw,
  XCircle,
  AlertTriangle,
  Upload,
  ImageIcon,
  AlignLeft,
  ListChecks,
  List,
  Type,
  RefreshCw,
  Loader2,
  Save,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Textarea } from "../../../components/ui/textarea";
import { Label } from "../../../components/ui/label";
import { cn } from "../../../lib/utils";
import { RequiredMark, OptionalMark } from "../../../components/shared/FormMarks";
import { DateInsertMenu } from "./DateInsertMenu";
import { DateVariableList } from "./DateVariableList";
import { DateFormatOption } from "../../../logic/dateFormats";
import { SnippetVar, ValidationError } from "../../../logic/types";
import { DeleteTriggerSelection } from "../../../logic/yamlEditor";
import { getSnippetTriggers, isImageFilePath } from "../../../logic/snippetUtils";
import { isBinaryDomFile } from "../../../logic/fileCheck";
import { ImportedMatch } from "../../../logic/importYaml";
import { EspansoConfigPreview } from "../../espanso-configs/types";

import {
  SnippetEditTarget,
  AddSnippetKind,
  FormFieldControl,
  FormFieldConfig,
  FormSelectionState,
} from "../types";
import { getFormFieldCategory, getTextFieldMode } from "../formSnippet";

export interface VisualYamlEditorStateProps {
  visualEditorMode: "add" | "delete";
  setVisualEditorMode: (mode: "add" | "delete") => void;
  highlightedLineRange: { startLine: number; endLine: number } | null;
  setHighlightedLineRange: (range: { startLine: number; endLine: number } | null) => void;
  pendingDeleteSelections: DeleteTriggerSelection[];
  deleteSearchQuery: string;
  setDeleteSearchQuery: (query: string) => void;
  handleUndoLastDelete: () => void;
  handleResetDeletions: () => void;
  visualEditorMatches: ImportedMatch[];
  toggleDeleteSelection: (selection: DeleteTriggerSelection) => void;
  getDeleteSelectionKey: (selection: DeleteTriggerSelection) => string;
  isLoadingVisualEditorYaml: boolean;
  loadVisualEditorYaml: (pathOverride?: string, matchIndexToHighlight?: number) => void;
  visualEditorPreviewYamlContent: string;
  pendingDeletedLineNumbers: Set<number>;
}

export interface VisualYamlEditorFormProps {
  addErrors: ValidationError[];
  addWarnings: string[];
  isYamlWarningsEnabled: boolean;
  editTriggersText: string;
  setEditTriggersText: (text: string) => void;
  activeSnippetKind: AddSnippetKind;
  setAddSnippetKind: (kind: AddSnippetKind) => void;
  setAddErrors: (errors: ValidationError[]) => void;
  setAddWarnings: (warnings: string[]) => void;
  editIncludeFile: string;
  setEditIncludeFile: (path: string) => void;
  chooseSnippetFile: () => void;
  editImagePath: string;
  setEditImagePath: (path: string) => void;
  chooseSnippetImageFile: () => void;
  editForm: string;
  setEditForm: (form: string) => void;
  formTextareaRef: React.RefObject<HTMLTextAreaElement | null>;
  formSelection: FormSelectionState | null;
  setFormSelection: (sel: FormSelectionState | null) => void;
  captureFormSelection: (el: HTMLTextAreaElement) => void;
  configureSelectedFormField: (control: FormFieldControl) => void;
  editVars: SnippetVar[];
  handleInsertDateVariable: (opt: DateFormatOption, target: "visualReplace" | "form") => void;
  handleRemoveDateVar: (name: string) => void;
  editFormFieldConfigs: FormFieldConfig[];
  undoFormField: (fieldId: string) => void;
  updateFormFieldConfig: (fieldId: string, partial: Partial<FormFieldConfig>) => void;
  editReplace: string;
  setEditReplace: (text: string) => void;
  visualEditorReplaceTextareaRef: React.RefObject<HTMLTextAreaElement | null>;
  editDescription: string;
  setEditDescription: (desc: string) => void;
}

export interface VisualYamlEditorActionProps {
  deleteSnippetFromYaml: (target: SnippetEditTarget) => void;
  saveSnippetToYaml: () => void;
  isSavingSnippet: boolean;
  showAlert: (title: string, description?: string) => void;
  resetSnippetForm: () => void;
  setSnippetEditTarget: (target: SnippetEditTarget | null) => void;
}

export interface VisualYamlEditorDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  snippetEditTarget: SnippetEditTarget | null;
  selectedEspansoPreview: EspansoConfigPreview | null;
  t: (key: string, options?: any) => string;
  visualEditor: VisualYamlEditorStateProps;
  form: VisualYamlEditorFormProps;
  actions: VisualYamlEditorActionProps;
}

export function VisualYamlEditorDialog({
  isOpen,
  onOpenChange,
  snippetEditTarget,
  selectedEspansoPreview,
  t,
  visualEditor,
  form,
  actions,
}: VisualYamlEditorDialogProps) {
  const {
    visualEditorMode,
    setVisualEditorMode,
    highlightedLineRange,
    setHighlightedLineRange,
    pendingDeleteSelections,
    deleteSearchQuery,
    setDeleteSearchQuery,
    handleUndoLastDelete,
    handleResetDeletions,
    visualEditorMatches,
    toggleDeleteSelection,
    getDeleteSelectionKey,
    isLoadingVisualEditorYaml,
    loadVisualEditorYaml,
    visualEditorPreviewYamlContent,
    pendingDeletedLineNumbers,
  } = visualEditor;

  const {
    addErrors,
    addWarnings,
    isYamlWarningsEnabled,
    editTriggersText,
    setEditTriggersText,
    activeSnippetKind,
    setAddSnippetKind,
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
    visualEditorReplaceTextareaRef,
    editDescription,
    setEditDescription,
  } = form;

  const {
    deleteSnippetFromYaml,
    saveSnippetToYaml,
    isSavingSnippet,
    showAlert,
    resetSnippetForm,
    setSnippetEditTarget,
  } = actions;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        onOpenChange(open);
        if (!open) {
          resetSnippetForm();
          setSnippetEditTarget(null);
        }
      }}
    >
      <DialogContent className="fixed inset-0 top-0 left-0 translate-x-0 translate-y-0 w-full max-w-none h-full max-h-none rounded-none border-none grid grid-rows-[auto_minmax(0,1fr)] overflow-hidden p-6 gap-4">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <Columns className="h-5 w-5 text-primary" />
            <span>{t("visualEditor.title")}</span>
          </DialogTitle>
          <DialogDescription className="break-all text-sm text-muted-foreground">
            {snippetEditTarget?.preview.config.relativePath || selectedEspansoPreview?.config.relativePath || t("snippets.selectYamlFile")}
            {snippetEditTarget ? ` · ${t("snippets.snippetNumber", { number: snippetEditTarget.displayIndex + 1 })}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-6 min-h-0 min-w-0">
          {/* 左侧 50%: 编辑表单 / 删除列表 */}
          <div className="flex flex-col min-h-0 min-w-0 pr-3 border-r">
            {/* RadioButton 模式选择头部 */}
            <div className="flex items-center justify-between border-b pb-3 mb-4 shrink-0">
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer text-base font-semibold select-none">
                  <input
                    type="radio"
                    name="ve-editor-mode"
                    className="h-4 w-4 accent-primary cursor-pointer"
                    checked={visualEditorMode === "add"}
                    onChange={() => {
                      setVisualEditorMode("add");
                      setHighlightedLineRange(null);
                    }}
                  />
                  <Plus className="h-4 w-4 text-primary" />
                  <span>{t("visualEditor.modeAdd")}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-base font-semibold select-none">
                  <input
                    type="radio"
                    name="ve-editor-mode"
                    className="h-4 w-4 accent-primary cursor-pointer"
                    checked={visualEditorMode === "delete"}
                    onChange={() => {
                      setVisualEditorMode("delete");
                      setHighlightedLineRange(null);
                    }}
                  />
                  <Trash2 className="h-4 w-4 text-destructive" />
                  <span>{t("visualEditor.modeDelete")}</span>
                </label>
              </div>

              {visualEditorMode === "delete" && pendingDeleteSelections.length > 0 && (
                <span className="inline-flex items-center rounded-full bg-destructive/15 px-2.5 py-0.5 text-[11px] font-semibold text-destructive">
                  {t("visualEditor.markedCount", { count: pendingDeleteSelections.length })}
                </span>
              )}
            </div>

            {visualEditorMode === "delete" ? (
              <div className="flex flex-col min-h-0 flex-1 space-y-3">
                {/* 删除模式：工具栏 (搜索、撤销、重置) */}
                <div className="flex items-center gap-2 shrink-0">
                  <div className="relative flex-1">
                    <FileSearch className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pl-9 text-xs"
                      placeholder={t("visualEditor.searchSnippetPlaceholder")}
                      value={deleteSearchQuery}
                      onChange={(e) => setDeleteSearchQuery(e.target.value)}
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-9 gap-1.5 text-xs shrink-0"
                    onClick={handleUndoLastDelete}
                    disabled={pendingDeleteSelections.length === 0}
                    title={t("visualEditor.undoDelete")}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>{t("visualEditor.undoDelete")}</span>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-9 gap-1.5 text-xs shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={handleResetDeletions}
                    disabled={pendingDeleteSelections.length === 0}
                  >
                    <span>{t("visualEditor.resetAll")}</span>
                  </Button>
                </div>

                {/* 删除模式：Match 项列表 */}
                <div className="min-h-0 flex-1 overflow-auto pr-1 space-y-2">
                  {visualEditorMatches.length === 0 ? (
                    <div className="flex h-32 items-center justify-center rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                      {t("visualEditor.noMatchesInYaml")}
                    </div>
                  ) : (
                    visualEditorMatches
                      .filter((item) => {
                        if (!deleteSearchQuery.trim()) return true;
                        const q = deleteSearchQuery.toLowerCase();
                        const triggers = getSnippetTriggers(item.snippet).join(" ").toLowerCase();
                        const desc = (item.snippet.description || "").toLowerCase();
                        const rep = (item.snippet.replace || item.snippet.include_file || item.snippet.image_path || item.snippet.form || "").toLowerCase();
                        return triggers.includes(q) || desc.includes(q) || rep.includes(q);
                      })
                      .map((item) => {
                        const matchIdx = item.originalMatchIndex;
                        const triggerIndex = item.triggerIndex ?? 0;
                        const selection = { matchIndex: matchIdx, triggerIndex };
                        const isMarked = pendingDeleteSelections.some(
                          (pendingSelection) => getDeleteSelectionKey(pendingSelection) === getDeleteSelectionKey(selection),
                        );
                        const triggers = getSnippetTriggers(item.snippet);
                        const triggerText = triggers.length > 0 ? triggers.join(", ") : `Snippet #${matchIdx + 1}`;
                        const summaryContent = item.snippet.replace || item.snippet.include_file || item.snippet.image_path || (item.snippet.form ? t("snippets.typeForm") : "");

                        return (
                          <div
                            key={`match-item-${matchIdx}-${triggerIndex}`}
                            className={cn(
                              "flex items-start justify-between gap-3 rounded-lg border p-3 text-xs transition-all duration-200",
                              isMarked
                                ? "border-destructive/40 bg-destructive/5 text-muted-foreground line-through opacity-75"
                                : "bg-card hover:border-primary/40",
                            )}
                          >
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex items-center gap-2">
                                <span className={cn(
                                  "font-mono font-semibold",
                                  isMarked ? "text-muted-foreground" : "text-primary"
                                )}>
                                  {triggerText}
                                </span>
                                {item.snippet.description && (
                                  <span className="truncate text-muted-foreground text-[11px]">
                                    ({item.snippet.description})
                                  </span>
                                )}
                              </div>
                              {summaryContent && (
                                <div className="mono-field line-clamp-2 max-w-full text-muted-foreground text-[11px] break-all">
                                  {summaryContent}
                                </div>
                              )}
                            </div>

                            <Button
                              type="button"
                              size="sm"
                              variant={isMarked ? "secondary" : "ghost"}
                              className={cn(
                                "h-8 shrink-0 gap-1.5 text-xs",
                                !isMarked && "text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              )}
                              onClick={() => toggleDeleteSelection(selection)}
                            >
                              {isMarked ? (
                                <>
                                  <RotateCcw className="h-3.5 w-3.5" />
                                  <span>{t("visualEditor.undoDelete")}</span>
                                </>
                              ) : (
                                <>
                                  <Trash2 className="h-3.5 w-3.5" />
                                  <span>{t("actions.delete")}</span>
                                </>
                              )}
                            </Button>
                          </div>
                        );
                      })
                  )}
                </div>
              </div>
            ) : (
              /* 添加/编辑模式表单 */
              <div className="min-h-0 flex-1 flex flex-col space-y-4 overflow-y-auto pr-3">
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
                  <Label htmlFor="ve-trigger-0" className="inline-flex items-center">
                    {t("snippets.trigger")} <RequiredMark />
                  </Label>
                  <div className="space-y-2">
                    {(editTriggersText ? editTriggersText.split("\n") : [""]).map((line, idx, lines) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Input
                          id={idx === 0 ? "ve-trigger-0" : undefined}
                          className="mono-field flex-1"
                          placeholder={`e.g. ${idx === 0 ? ":hello" : idx === 1 ? ":hi" : ":hey"}`}
                          value={line}
                          onChange={(e) => {
                            const newLines = [...lines];
                            newLines[idx] = e.target.value;
                            setEditTriggersText(newLines.join("\n"));
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
                    variant={activeSnippetKind === "text" ? "secondary" : "ghost"}
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
                    variant={activeSnippetKind === "file" ? "secondary" : "ghost"}
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
                    variant={activeSnippetKind === "image" ? "secondary" : "ghost"}
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
                    variant={activeSnippetKind === "form" ? "secondary" : "ghost"}
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
                    <Label htmlFor="ve-include-file" className="inline-flex items-center">
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
                          id="ve-include-file"
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
                    <Label htmlFor="ve-image-path" className="inline-flex items-center">
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
                          id="ve-image-path"
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
                        <Label htmlFor="ve-form" className="inline-flex items-center shrink-0">
                          {t("snippets.formLayout")} <RequiredMark />
                        </Label>
                        <DateInsertMenu onSelect={(opt) => handleInsertDateVariable(opt, "form")} />
                      </div>
                      <Textarea
                        id="ve-form"
                        ref={formTextareaRef}
                        className="mono-field flex-1 h-full min-h-[120px] resize-y"
                        placeholder={"=== Ticket ===\nTitle: title\nCategory: category\n\nDescription:\ndescription"}
                        value={editForm}
                        onChange={(e) => {
                          setEditForm(e.target.value);
                          setFormSelection(null);
                        }}
                        onKeyDown={(event) => {
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
                                    name={`ve-form-field-category-${fieldIndex}`}
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
                                          name={`ve-form-text-mode-${fieldIndex}`}
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
                                  <Label htmlFor={`ve-form-field-default-${fieldIndex}`} className="inline-flex items-center">
                                    {t("formBuilder.defaultValue")} <OptionalMark />
                                  </Label>
                                  {field.control === "multiline" ? (
                                    <Textarea
                                      id={`ve-form-field-default-${fieldIndex}`}
                                      className="mono-field min-h-24 resize-y"
                                      value={field.defaultValue}
                                      onChange={(event) => updateFormFieldConfig(field.id, { defaultValue: event.target.value })}
                                    />
                                  ) : (
                                    <Input
                                      id={`ve-form-field-default-${fieldIndex}`}
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
                                  <Label htmlFor={`ve-form-field-default-${fieldIndex}`} className="inline-flex items-center">
                                    {t("formBuilder.defaultValue")} <OptionalMark />
                                  </Label>
                                  <Input
                                    id={`ve-form-field-default-${fieldIndex}`}
                                    value={field.defaultValue}
                                    onChange={(event) => updateFormFieldConfig(field.id, { defaultValue: event.target.value })}
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor={`ve-form-field-values-${fieldIndex}`} className="inline-flex items-center">
                                    {t("formBuilder.values")} <RequiredMark />
                                  </Label>
                                  <Textarea
                                    id={`ve-form-field-values-${fieldIndex}`}
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
                  <div className="flex-1 flex flex-col space-y-2 min-h-[120px]">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="ve-replace" className="inline-flex items-center shrink-0">
                        {t("snippets.replaceContent")} <RequiredMark />
                      </Label>
                      <DateInsertMenu onSelect={(opt) => handleInsertDateVariable(opt, "visualReplace")} />
                    </div>
                    <Textarea
                      id="ve-replace"
                      ref={visualEditorReplaceTextareaRef}
                      className="mono-field flex-1 h-full min-h-[120px] resize-y"
                      placeholder={t("snippets.replaceContentPlaceholder")}
                      value={editReplace}
                      onChange={(e) => setEditReplace(e.target.value)}
                    />
                    <DateVariableList vars={editVars} onRemove={handleRemoveDateVar} />
                  </div>
                )}

                <div className="space-y-2 shrink-0">
                  <Label htmlFor="ve-description" className="inline-flex items-center">
                    {t("snippets.descriptionLabel")} <OptionalMark />
                  </Label>
                  <Input
                    id="ve-description"
                    placeholder={t("snippets.descriptionPlaceholder")}
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="pt-3 shrink-0 border-t mt-3">
              <DialogFooter className={cn(snippetEditTarget && visualEditorMode === "add" && "sm:justify-between")}>
                {snippetEditTarget && visualEditorMode === "add" && (
                  <Button
                    variant="destructive"
                    onClick={() => deleteSnippetFromYaml(snippetEditTarget)}
                  >
                    <Trash2 className="h-4 w-4" />
                    {t("actions.delete")}
                  </Button>
                )}
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button variant="outline" onClick={() => onOpenChange(false)}>
                    {t("actions.cancel")}
                  </Button>
                  <Button onClick={saveSnippetToYaml} disabled={isSavingSnippet}>
                    {isSavingSnippet ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {visualEditorMode === "delete"
                      ? t("actions.saveToYaml")
                      : snippetEditTarget
                      ? t("actions.updateYaml")
                      : t("actions.saveToYaml")}
                  </Button>
                </div>
              </DialogFooter>
            </div>
          </div>

          {/* 右侧 50%: 不可编辑的 YAML 实时文件展示 */}
          <div className="flex flex-col min-h-0 min-w-0 space-y-2">
            <div className="flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <FileSearch className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold">
                  {visualEditorMode === "delete" ? t("visualEditor.deletePreview") : t("visualEditor.yamlPreview")}
                </span>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 text-xs"
                onClick={() => loadVisualEditorYaml()}
                disabled={isLoadingVisualEditorYaml}
              >
                <RefreshCw className={cn("h-3.5 w-3.5", isLoadingVisualEditorYaml && "animate-spin")} />
                {t("visualEditor.refresh")}
              </Button>
            </div>

            <div className="min-h-0 flex-1 rounded-md border bg-muted/30 overflow-hidden flex flex-col font-mono text-xs">
              <div className="min-h-0 flex-1 overflow-auto p-3">
                {isLoadingVisualEditorYaml ? (
                  <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{t("visualEditor.loadingYaml")}</span>
                  </div>
                ) : (
                  <div className="table w-full select-text leading-relaxed">
                    {visualEditorPreviewYamlContent.split("\n").map((line, idx) => {
                      const lineNumber = idx + 1;
                      const isDeleteMode = visualEditorMode === "delete";
                      const isPendingDeletedLine = isDeleteMode && pendingDeletedLineNumbers.has(lineNumber);
                      const isHighlighted =
                        isPendingDeletedLine ||
                        (
                          highlightedLineRange &&
                          lineNumber >= highlightedLineRange.startLine &&
                          lineNumber <= highlightedLineRange.endLine
                        );
                      return (
                        <div
                          key={idx}
                          id={`ve-yaml-line-${lineNumber}`}
                          className={cn(
                            "table-row transition-colors duration-300",
                            isHighlighted
                              ? isDeleteMode
                                ? "bg-destructive/15 dark:bg-destructive/25"
                                : "bg-amber-500/20 dark:bg-amber-400/20"
                              : "hover:bg-muted/40",
                          )}
                        >
                          <span
                            className={cn(
                              "table-cell pr-3 text-right select-none w-8 border-r font-mono text-[11px]",
                              isHighlighted
                                ? isDeleteMode
                                  ? "border-destructive/60 bg-destructive/20 text-destructive dark:text-red-300 font-bold"
                                  : "border-amber-500/60 bg-amber-500/30 text-amber-900 dark:text-amber-200 font-bold"
                                : "text-muted-foreground/40 border-border/40",
                            )}
                          >
                            {lineNumber}
                          </span>
                          <span
                            className={cn(
                              "table-cell pl-3 whitespace-pre font-mono",
                              isHighlighted
                                ? isDeleteMode
                                  ? "text-destructive dark:text-red-300 line-through decoration-destructive decoration-2 font-medium"
                                  : "text-amber-950 dark:text-amber-100 font-semibold"
                                : "text-foreground font-normal",
                            )}
                          >
                            {line || " "}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
