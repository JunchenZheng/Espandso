import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readFile } from "@tauri-apps/plugin-fs";
import { listen } from "@tauri-apps/api/event";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import {
  AlertTriangle,
  AlignLeft,
  FilePlus,
  FileSearch,
  FileText,
  FlaskConical,
  FolderOpen,
  FolderPlus,
  Globe,
  ImageIcon,
  Info,
  List,
  ListChecks,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Settings,
  Terminal,
  Trash2,
  Type,
  Upload,
  XCircle,
} from "lucide-react";
import "./App.css";

import { useI18n } from "./i18n/useI18n";

import { Button } from "./components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./components/ui/dialog";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import { ScrollArea } from "./components/ui/scroll-area";
import { Switch } from "./components/ui/switch";
import { Textarea } from "./components/ui/textarea";
import { AboutDialog } from "./components/AboutDialog";
import { EspansoLogDialog } from "./components/EspansoLogDialog";
import { SearchDialog } from "./features/search/components/SearchDialog";
import { useSearchIndex } from "./features/search/hooks/useSearchIndex";
import { WarningsDialog } from "./features/warnings/components/WarningsDialog";
import { useYamlWarnings } from "./features/warnings/hooks/useYamlWarnings";

import { IS_EXPERIMENTAL_BUILD } from "./logic/features";
import { Snippet } from "./logic/types";
import { validate } from "./logic/validate";
import { getSnippetTriggers, isImageFilePath } from "./logic/snippetUtils";
import { checkIsBinaryFilePath, isBinaryDomFile } from "./logic/fileCheck";
import { cn } from "./lib/utils";
import {
  saveSnippetToYamlFile,
  deleteSnippetFromYamlFile,
  batchDeleteSnippetsFromYamlFile,
} from "./repositories/snippetYamlRepository";

import { EmptyState } from "./components/shared/EmptyState";
import { DateInsertMenu } from "./features/snippets/components/DateInsertMenu";
import { DateVariableList } from "./features/snippets/components/DateVariableList";
import { EspansoConfigTreeNode } from "./features/espanso-configs/components/EspansoConfigTreeNode";
import { EspansoConfigDetail } from "./features/espanso-configs/components/EspansoConfigDetail";
import { EspansoDirectoryDetail } from "./features/espanso-configs/components/EspansoDirectoryDetail";
import { useVisualYamlEditor } from "./features/snippets/hooks/useVisualYamlEditor";
import { VisualYamlEditorDialog } from "./features/snippets/components/VisualYamlEditorDialog";

export type { EspansoConfigPreview } from "./features/espanso-configs/types";
import type {
  AddSnippetKind,
  FormFieldConfig,
  FormFieldControl,
  SnippetEditTarget,
} from "./features/snippets/types";
import {
  areFormFieldConfigsEqual,
  buildUniqueFormFieldId,
  createDefaultFormFieldConfig,
  escapeRegExp,
  extractFormFieldNames,
  getFormFieldCategory,
  getSelectedFormFieldId,
  getTextFieldMode,
  normalizeFormFieldConfigs,
  snippetKindLabel,
} from "./features/snippets/formSnippet";
import { useSnippetEditor } from "./features/snippets/hooks/useSnippetEditor";
import { useEspansoConfigs } from "./features/espanso-configs/hooks/useEspansoConfigs";

interface DragDropPayload {
  paths: string[];
  position: { x: number; y: number };
}

const DEFAULT_COLLECTION_PANE_WIDTH = 20;
const MIN_COLLECTION_PANE_WIDTH = 14;
const MAX_COLLECTION_PANE_WIDTH = 40;

interface AlertDialogState {
  isOpen: boolean;
  title: string;
  description: string;
  confirmText: string;
  cancelText?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
}

function RequiredMark() {
  return (
    <span className="ml-1 inline-flex items-center justify-center text-destructive font-semibold align-middle leading-none translate-y-[2px]">
      *
    </span>
  );
}

function OptionalMark() {
  const { t } = useI18n();
  return (
    <span className="ml-1 inline-flex items-center text-xs font-normal text-muted-foreground align-middle leading-none">
      {t("common.optional")}
    </span>
  );
}

function App() {
  const { t, locale, setLocale } = useI18n();
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [collectionPaneWidth, setCollectionPaneWidth] = useState<number>(DEFAULT_COLLECTION_PANE_WIDTH);
  const [isCollectionResizing, setIsCollectionResizing] = useState<boolean>(false);
  const mainSplitRef = useRef<HTMLDivElement | null>(null);

  const {
    enableExperimentalYamlWarnings,
    isYamlWarningsEnabled,
    isWarningsDialogOpen,
    setIsWarningsDialogOpen,
    warningsFilterPath,
    setWarningsFilterPath,
    handleToggleExperimentalYamlWarnings,
    openWarningsDialog,
  } = useYamlWarnings();

  const {
    espansoMatchDir,
    espansoPathSource,
    espansoConfigs,
    espansoDirectories,
    espansoConfigPreviews,
    selectedEspansoConfigPath,
    setSelectedEspansoConfigPath,
    isScanningEspanso,
    isLoadingSelectedPreview,
    selectedPreviewError,
    espansoScanMessage,
    espansoPreviewTree,
    selectedEspansoPreview,
    isSelectedPreviewLoaded,
    selectedDirectoryNode,
    activeDirectoryRelPath,
    activeEspansoAncestorPaths,
    loadEspansoConfigPreview,
    scanDefaultEspansoConfigDir,
    addDroppedYamlFile,
    isCreateFileOpen,
    setIsCreateFileOpen,
    createFileName,
    setCreateFileName,
    createFileParentRelPath,
    setCreateFileParentRelPath,
    createFileError,
    setCreateFileError,
    isCreatingFile,
    openCreateFileDialog,
    handleCreateFile,
    isCreateFolderOpen,
    setIsCreateFolderOpen,
    createFolderName,
    setCreateFolderName,
    createFolderParentRelPath,
    setCreateFolderParentRelPath,
    createFolderError,
    setCreateFolderError,
    isCreatingFolder,
    openCreateFolderDialog,
    handleCreateFolder,
  } = useEspansoConfigs({ isYamlWarningsEnabled });

  const {
    isSearchOpen,
    setIsSearchOpen,
    highlightedSnippetIndex,
    handleSelectSearchResult,
  } = useSearchIndex({
    onSelectConfigPath: setSelectedEspansoConfigPath,
  });

  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isLogOpen, setIsLogOpen] = useState<boolean>(false);
  const [isAboutOpen, setIsAboutOpen] = useState<boolean>(false);
  const {
    isOpen: isAddSnippetOpen,
    setIsOpen: setIsAddSnippetOpen,
    editTarget: snippetEditTarget,
    setEditTarget: setSnippetEditTarget,
    kind: addSnippetKind,
    setKind: setAddSnippetKind,
    triggersText: editTriggersText,
    setTriggersText: setEditTriggersText,
    replace: editReplace,
    setReplace: setEditReplace,
    vars: editVars,
    includeFile: editIncludeFile,
    setIncludeFile: setEditIncludeFile,
    imagePath: editImagePath,
    setImagePath: setEditImagePath,
    form: editForm,
    setForm: setEditForm,
    formFieldConfigs: editFormFieldConfigs,
    setFormFieldConfigs: setEditFormFieldConfigs,
    formSelection,
    setFormSelection,
    description: editDescription,
    setDescription: setEditDescription,
    errors: addErrors,
    setErrors: setAddErrors,
    warnings: addWarnings,
    setWarnings: setAddWarnings,
    isSaving: isSavingSnippet,
    setIsSaving: setIsSavingSnippet,
    replaceTextareaRef,
    visualEditorReplaceTextareaRef,
    formTextareaRef,
    resetForm: resetSnippetForm,
    openAdd: openSnippetEditorAdd,
    openEdit: openSnippetEditorEdit,
    insertDateOption: handleInsertDateVariable,
    removeVar: handleRemoveDateVar,
    buildSnippetObject: buildFormSnippet,
  } = useSnippetEditor();

  const {
    isVisualEditorOpen,
    setIsVisualEditorOpen,
    isLoadingVisualEditorYaml,
    visualEditorMode,
    setVisualEditorMode,
    pendingDeleteSelections,
    setPendingDeleteSelections,
    deleteSearchQuery,
    setDeleteSearchQuery,
    highlightedLineRange,
    setHighlightedLineRange,
    loadVisualEditorYaml,
    toggleDeleteSelection,
    handleUndoLastDelete,
    handleResetDeletions,
    visualEditorMatches,
    visualEditorPreviewYamlContent,
    pendingDeletedLineNumbers,
    getDeleteSelectionKey,
    applyPendingDeleteWorkflow,
  } = useVisualYamlEditor({
    selectedEspansoPreview,
    snippetEditTarget,
    espansoConfigs,
    espansoMatchDir,
    loadEspansoConfigPreview,
    setSelectedEspansoConfigPath,
    t,
  });




  const updateCollectionPaneWidth = useCallback((clientX: number) => {
    const split = mainSplitRef.current;
    if (!split) return;

    const rect = split.getBoundingClientRect();
    if (rect.width <= 0) return;

    const nextWidth = ((clientX - rect.left) / rect.width) * 100;
    setCollectionPaneWidth(Math.min(MAX_COLLECTION_PANE_WIDTH, Math.max(MIN_COLLECTION_PANE_WIDTH, nextWidth)));
  }, []);

  const startCollectionResize = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsCollectionResizing(true);
    updateCollectionPaneWidth(event.clientX);
  }, [updateCollectionPaneWidth]);

  const handleCollectionResizeMove = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (!isCollectionResizing) return;
    updateCollectionPaneWidth(event.clientX);
  }, [isCollectionResizing, updateCollectionPaneWidth]);

  const stopCollectionResize = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setIsCollectionResizing(false);
  }, []);

  useEffect(() => {
    if (!isCollectionResizing) return;

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };
  }, [isCollectionResizing]);





  const [alertDialog, setAlertDialog] = useState<AlertDialogState>({
    isOpen: false,
    title: "",
    description: "",
    confirmText: t("actions.ok"),
  });



  const showAlert = useCallback((description: string, title = t("app.name")) => {
    setAlertDialog({
      isOpen: true,
      title,
      description,
      confirmText: t("actions.ok"),
    });
  }, [t]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen("open-about-dialog", () => {
      setIsAboutOpen(true);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const showConfirm = useCallback(
    (
      description: string,
      onConfirm: () => void,
      title = t("app.name"),
      confirmText = t("actions.ok"),
      cancelText = t("actions.cancel"),
    ) => {
      setAlertDialog({
        isOpen: true,
        title,
        description,
        confirmText,
        cancelText,
        onConfirm,
      });
    },
    [t],
  );



  async function addDroppedYamlPreview(path: string) {
    if (isAddSnippetOpen) {
      if (addSnippetKind === "file") {
        if (isImageFilePath(path)) {
          showAlert(t("errors.imageFileNotAllowed"), t("errors.invalidFileType"));
          setIsDragging(false);
          return;
        }
        const isBinary = await checkIsBinaryFilePath(path, (p) => readFile(p));
        if (isBinary) {
          showAlert(t("errors.binaryFileNotAllowed"), t("errors.invalidFileType"));
          setIsDragging(false);
          return;
        }
        setEditIncludeFile(path);
        setIsDragging(false);
        return;
      }
      if (addSnippetKind === "image") {
        setEditImagePath(path);
        setIsDragging(false);
        return;
      }
      // For "text" or "form" tabs, drop operations are ignored
      setIsDragging(false);
      return;
    }

    const lowerPath = path.toLowerCase();
    if (!lowerPath.endsWith(".yml") && !lowerPath.endsWith(".yaml")) {
      showAlert(t("errors.dropYamlFile"), t("errors.invalidFile"));
      return;
    }

    addDroppedYamlFile(path);
  }

  useEffect(() => {
    let active = true;
    const unlisteners: (() => void)[] = [];

    async function setupDragDrop() {
      try {
        const uEnter = await listen<DragDropPayload>("tauri://drag-enter", () => {
          if (isAddSnippetOpen && (addSnippetKind === "text" || addSnippetKind === "form")) {
            return;
          }
          setIsDragging(true);
        });
        if (!active) { uEnter(); return; }
        unlisteners.push(uEnter);

        const uDrop = await listen<DragDropPayload>("tauri://drag-drop", async (event) => {
          setIsDragging(false);
          const path = event.payload.paths[0];
          if (path) {
            await addDroppedYamlPreview(path);
          }
        });
        if (!active) { uDrop(); return; }
        unlisteners.push(uDrop);

        const uCancel = await listen("tauri://drag-leave", () => setIsDragging(false));
        if (!active) { uCancel(); return; }
        unlisteners.push(uCancel);
      } catch (e) {
        console.error("Failed to setup drag and drop:", e);
      }
    }

    setupDragDrop();

    return () => {
      active = false;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [addSnippetKind, espansoConfigs, isAddSnippetOpen, snippetEditTarget]);

  const activeSnippetKind: AddSnippetKind = addSnippetKind;
  const detectedFormFieldNames = useMemo(() => extractFormFieldNames(editForm), [editForm]);
  const detectedFormFieldKey = detectedFormFieldNames.join("\n");
  const snippetDialogTitle = snippetEditTarget
    ? t("snippets.editKindSnippetTitle", { kind: snippetKindLabel(activeSnippetKind, t) })
    : t("snippets.addKindSnippetTitle", { kind: snippetKindLabel(activeSnippetKind, t) });

  useEffect(() => {
    setEditFormFieldConfigs((current) => {
      const normalized = normalizeFormFieldConfigs(detectedFormFieldNames, current);
      return areFormFieldConfigsEqual(current, normalized) ? current : normalized;
    });
  }, [detectedFormFieldKey]);

  function openVisualEditorDialog() {
    if (!selectedEspansoPreview) {
      showAlert(t("errors.selectConfigBeforeAddingSnippet"), t("errors.noConfigSelected"));
      return;
    }
    setSnippetEditTarget(null);
    resetSnippetForm();
    setHighlightedLineRange(null);
    setVisualEditorMode("add");
    setPendingDeleteSelections([]);
    setDeleteSearchQuery("");
    setIsVisualEditorOpen(true);
    loadVisualEditorYaml(selectedEspansoPreview.config.path);
  }

  function openAddSnippetDialog() {
    if (!selectedEspansoPreview) {
      showAlert(t("errors.selectConfigBeforeAddingSnippet"), t("errors.noConfigSelected"));
      return;
    }
    openSnippetEditorAdd();
  }

  function openEditSnippetDialog(target: SnippetEditTarget) {
    openSnippetEditorEdit(target);
  }

  function updateFormFieldConfig(id: string, patch: Partial<FormFieldConfig>) {
    setEditFormFieldConfigs((current) => current.map((field) => (
      field.id === id ? { ...field, ...patch } : field
    )));
  }

  function undoFormField(fieldId: string) {
    const placeholderPattern = new RegExp(`\\[\\[\\s*${escapeRegExp(fieldId)}\\s*\\]\\]`, "g");
    const nextForm = editForm.replace(placeholderPattern, fieldId);

    setEditForm(nextForm);
    setEditFormFieldConfigs((current) => current.filter((field) => field.id !== fieldId));
    setFormSelection(null);

    requestAnimationFrame(() => {
      formTextareaRef.current?.focus();
    });
  }

  function captureFormSelection(textarea: HTMLTextAreaElement) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.slice(start, end);

    if (!selectedText.trim()) {
      setFormSelection(null);
      return false;
    }

    setFormSelection({
      start,
      end,
      text: selectedText,
    });
    return true;
  }

  function configureSelectedFormField(control: FormFieldControl) {
    if (!formSelection) return;

    const selectedText = formSelection.text;
    const selectedFieldId = getSelectedFormFieldId(selectedText);
    const isExistingPlaceholder = /^\s*\[\[[^\][\n]+\]\]\s*$/.test(selectedText);
    const existingFieldNames = extractFormFieldNames(editForm);
    const fieldId = isExistingPlaceholder
      ? selectedFieldId
      : buildUniqueFormFieldId(selectedFieldId, existingFieldNames);
    const placeholder = `[[${fieldId}]]`;
    const nextForm = isExistingPlaceholder
      ? editForm
      : `${editForm.slice(0, formSelection.start)}${placeholder}${editForm.slice(formSelection.end)}`;

    setEditForm(nextForm);
    setEditFormFieldConfigs((current) => {
      const next = normalizeFormFieldConfigs(extractFormFieldNames(nextForm), current);
      const existing = next.find((field) => field.id === fieldId);
      if (existing) {
        return next.map((field) => (field.id === fieldId ? { ...field, control } : field));
      }
      return [...next, { ...createDefaultFormFieldConfig(fieldId), control }];
    });
    setFormSelection(null);

    requestAnimationFrame(() => {
      const textarea = formTextareaRef.current;
      if (!textarea) return;
      const cursor = isExistingPlaceholder ? formSelection.end : formSelection.start + placeholder.length;
      textarea.focus();
      textarea.setSelectionRange(cursor, cursor);
    });
  }

  async function chooseSnippetFile() {
    const selected = await openDialog({
      multiple: false,
      directory: false,
    });

    let selectedPath = "";
    if (typeof selected === "string") {
      selectedPath = selected;
    } else if (Array.isArray(selected) && typeof selected[0] === "string") {
      selectedPath = selected[0];
    }

    if (selectedPath) {
      if (isImageFilePath(selectedPath)) {
        showAlert(t("errors.imageFileNotAllowed"), t("errors.invalidFileType"));
        return;
      }
      const isBinary = await checkIsBinaryFilePath(selectedPath, (p) => readFile(p));
      if (isBinary) {
        showAlert(t("errors.binaryFileNotAllowed"), t("errors.invalidFileType"));
        return;
      }
      setEditIncludeFile(selectedPath);
    }
  }

  async function chooseSnippetImageFile() {
    const selected = await openDialog({
      multiple: false,
      directory: false,
      filters: [
        {
          name: t("snippets.imageFilesFilter"),
          extensions: ["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp"],
        },
      ],
    });

    if (typeof selected === "string") {
      setEditImagePath(selected);
    } else if (Array.isArray(selected) && typeof selected[0] === "string") {
      setEditImagePath(selected[0]);
    }
  }

  async function saveSnippetToYaml() {
    if (visualEditorMode === "delete") {
      setIsSavingSnippet(true);
      try {
        await applyPendingDeleteWorkflow();
      } catch (e: any) {
        showAlert(t("errors.failedToSaveSnippet", { message: e?.message || e }), t("errors.genericError"));
      } finally {
        setIsSavingSnippet(false);
      }
      return;
    }

    const targetPreview = snippetEditTarget?.preview || selectedEspansoPreview;
    if (!targetPreview || isSavingSnippet) return;

    let snippet: Snippet;
    try {
      snippet = buildFormSnippet();
    } catch (e: any) {
      const errMsg = e?.message || String(e);
      setAddErrors([{ message: errMsg }]);
      showAlert(errMsg, t("errors.validationError"));
      return;
    }

    const snippetsForValidation = snippetEditTarget
      ? snippetEditTarget.preview.importedMatches
        .filter((match) => match.originalMatchIndex !== snippetEditTarget.match.originalMatchIndex)
        .map((match) => match.snippet)
      : targetPreview.snippets;

    const validationResult = await validate({
      version: 1,
      snippets: [...snippetsForValidation, snippet],
    });

    setAddErrors(validationResult.errors);
    setAddWarnings(validationResult.warnings);

    if (validationResult.errors.length > 0) {
      showAlert(validationResult.errors[0].message, t("errors.validationError"));
      return;
    }

    setIsSavingSnippet(true);
    try {
      await saveSnippetToYamlFile(
        targetPreview.config.path,
        snippet,
        snippetEditTarget?.match.originalMatchIndex,
        espansoMatchDir || undefined
      );
      // Espanso has its own hot-reload path for match files. Keep restart disabled
      // while testing which edits actually require the more expensive CLI restart.
      const savedMatchIndex = snippetEditTarget
        ? snippetEditTarget.match.originalMatchIndex
        : targetPreview.snippets.length;
      resetSnippetForm();
      setSnippetEditTarget(null);
      await loadEspansoConfigPreview(targetPreview.config);
      setSelectedEspansoConfigPath(targetPreview.config.path);
      if (isVisualEditorOpen) {
        await loadVisualEditorYaml(targetPreview.config.path, savedMatchIndex);
      } else {
        setIsAddSnippetOpen(false);
      }
    } catch (e: any) {
      showAlert(t("errors.failedToSaveSnippet", { message: e?.message || e }), t("errors.genericError"));
    } finally {
      setIsSavingSnippet(false);
    }
  }

  async function deleteSnippetFromYaml(target: SnippetEditTarget) {
    const triggers = getSnippetTriggers(target.match.originalSnippet || target.match.snippet);
    const displayTrigger = triggers.length > 0 ? triggers.join(", ") : `Snippet ${target.displayIndex + 1}`;

    showConfirm(
      t("dialogs.confirmDelete.message", { trigger: displayTrigger, file: target.preview.config.relativePath }),
      async () => {
        try {
          await deleteSnippetFromYamlFile(
            target.preview.config.path,
            target.match.originalMatchIndex,
            espansoMatchDir || undefined
          );
          // Espanso has its own hot-reload path for match files. Keep restart disabled
          // while testing which edits actually require the more expensive CLI restart.
          resetSnippetForm();
          setSnippetEditTarget(null);
          await loadEspansoConfigPreview(target.preview.config);
          setSelectedEspansoConfigPath(target.preview.config.path);
          if (isVisualEditorOpen) {
            await loadVisualEditorYaml(target.preview.config.path);
          } else {
            setIsAddSnippetOpen(false);
          }
        } catch (e: any) {
          showAlert(t("errors.failedToDeleteSnippet", { message: e?.message || e }), t("errors.genericError"));
        }
      },
      t("dialogs.confirmDelete.title"),
      t("actions.delete"),
      t("actions.cancel"),
    );
  }

  async function batchDeleteSnippetsFromYaml(
    configPath: string,
    relativePath: string,
    matchIndices: number[],
    onComplete?: () => void
  ) {
    if (matchIndices.length === 0) return;

    showConfirm(
      t("dialogs.confirmBatchDelete.message", { count: matchIndices.length, file: relativePath }),
      async () => {
        try {
          await batchDeleteSnippetsFromYamlFile(
            configPath,
            matchIndices,
            espansoMatchDir || undefined
          );
          const targetConfig = espansoConfigs.find((config) => config.path === configPath);
          if (targetConfig) {
            await loadEspansoConfigPreview(targetConfig);
          }
          setSelectedEspansoConfigPath(configPath);
          if (isVisualEditorOpen) {
            await loadVisualEditorYaml(configPath);
          }
          onComplete?.();
        } catch (e: any) {
          showAlert(t("errors.failedToBatchDeleteSnippets", { message: e?.message || e }), t("errors.genericError"));
        }
      },
      t("dialogs.confirmBatchDelete.title"),
      t("dialogs.confirmBatchDelete.confirmBtn"),
      t("actions.cancel"),
    );
  }

  async function openYamlFileInDefaultApp(path: string) {
    try {
      await openPath(path);
    } catch (e: any) {
      showAlert(t("errors.failedToOpenYamlFile", { message: e?.message || e }), t("errors.genericError"));
    }
  }

  return (
    <div className="app-shell">
      {isDragging && (!isAddSnippetOpen || addSnippetKind === "file" || addSnippetKind === "image") && (
        <div className="drag-overlay">
              <div className="drag-zone">
                <Upload className="mb-5 h-12 w-12" />
                <div className="text-2xl font-semibold">
                  {isAddSnippetOpen && addSnippetKind === "file"
                    ? t("drag.dropFileHere")
                    : isAddSnippetOpen && addSnippetKind === "image"
                      ? t("drag.dropImageFileHere")
                      : t("drag.dropYamlFileHere")}
                </div>
                <div className="mt-2 text-base text-muted-foreground">
                  {isAddSnippetOpen && addSnippetKind === "file"
                    ? t("drag.fileSourceDescription")
                    : isAddSnippetOpen && addSnippetKind === "image"
                      ? t("drag.imageSourceDescription")
                      : t("drag.yamlSourceDescription")}
                </div>
              </div>
            </div>
      )}

      <main className="flex h-full w-full overflow-hidden bg-[linear-gradient(180deg,hsl(var(--background))_0%,hsl(var(--secondary))_100%)] p-4">
        <div className="flex h-full w-full flex-col rounded-lg border bg-secondary/40 p-4 text-left shadow-sm">
          {espansoConfigs.length > 0 ? (
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-background p-3">
                <div className="min-w-0 text-base">
                  <span className="font-semibold">{t("navigation.collection")}</span>
                  {espansoMatchDir && (
                    <span className="ml-3 text-sm text-muted-foreground">{espansoMatchDir}</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsSearchOpen(true)}
                    aria-label={t("search.openSearch")}
                    title={t("search.openSearch")}
                    className="gap-1.5"
                  >
                    <Search className="h-4 w-4 text-primary" />
                    <span>{t("actions.search")}</span>
                    <kbd className="pointer-events-none hidden h-5 select-none items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100 sm:flex ml-1">
                      ⌘K
                    </kbd>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => scanDefaultEspansoConfigDir()}
                    disabled={isScanningEspanso}
                    aria-label={t("actions.refresh")}
                    title={t("actions.refresh")}
                  >
                    <RefreshCw className={cn("h-4 w-4", isScanningEspanso && "animate-spin")} />
                    {t("actions.refresh")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsLogOpen(true)}
                    aria-label={t("actions.viewLogs")}
                    title={t("actions.viewLogs")}
                  >
                    <Terminal className="h-4 w-4" />
                    {t("actions.viewLogs")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsSettingsOpen(true)}
                    aria-label={t("actions.settings")}
                    title={t("actions.settings")}
                  >
                    <Settings className="h-4 w-4" />
                    {t("actions.settings")}
                  </Button>

                </div>
              </div>

              <div
                ref={mainSplitRef}
                className="home-split grid min-h-0 flex-1 overflow-hidden rounded-md border bg-background"
                style={{ "--collection-pane-width": `${collectionPaneWidth}%` } as CSSProperties}
              >
                <aside className="flex min-h-0 flex-col border-b bg-secondary/30 md:border-b-0">
                  <div className="flex h-10 shrink-0 items-center justify-between border-b px-3">
                    <h2 className="text-lg font-semibold">{t("navigation.collection")}</h2>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        title={activeDirectoryRelPath ? t("filesystem.createFolderIn", { path: `/${activeDirectoryRelPath}` }) : t("filesystem.createFolder")}
                        onClick={() => openCreateFolderDialog()}
                      >
                        <FolderPlus className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        title={activeDirectoryRelPath ? t("filesystem.createFileIn", { path: `/${activeDirectoryRelPath}` }) : t("filesystem.createFile")}
                        onClick={() => openCreateFileDialog()}
                      >
                        <FilePlus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <ScrollArea className="min-h-0 flex-1">
                    <div className="space-y-1 p-2">
                      {espansoPreviewTree.map((node) => (
                        <EspansoConfigTreeNode
                          key={node.path}
                          node={node}
                          activePath={selectedEspansoConfigPath}
                          activeAncestorPaths={activeEspansoAncestorPaths}
                          onSelect={setSelectedEspansoConfigPath}
                          onOpenFile={openYamlFileInDefaultApp}
                          onCreateFile={openCreateFileDialog}
                          onCreateFolder={openCreateFolderDialog}
                        />
                      ))}
                    </div>
                  </ScrollArea>
                </aside>

                <button
                  type="button"
                  className={cn(
                    "hidden cursor-col-resize border-x bg-border/40 transition-colors hover:bg-primary/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:block",
                    isCollectionResizing && "bg-primary/40",
                  )}
                  aria-label={t("navigation.resizeCollectionPane")}
                  title={t("navigation.resizeCollectionPane")}
                  onPointerDown={startCollectionResize}
                  onPointerMove={handleCollectionResizeMove}
                  onPointerUp={stopCollectionResize}
                  onPointerCancel={stopCollectionResize}
                />

                <section className="flex min-h-0 min-w-0 flex-col">
                  {selectedEspansoPreview && (isLoadingSelectedPreview || !isSelectedPreviewLoaded) ? (
                    <div className="flex h-full min-h-56 flex-col items-center justify-center p-6 text-center">
                      <Loader2 className="mb-3 h-7 w-7 animate-spin text-primary" />
                      <h3 className="text-sm font-semibold">{selectedEspansoPreview.config.relativePath}</h3>
                      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                        {selectedPreviewError || t("status.loadingYamlPreview")}
                      </p>
                    </div>
                  ) : selectedEspansoPreview ? (
                    <EspansoConfigDetail
                      preview={selectedEspansoPreview}
                      highlightedIndex={highlightedSnippetIndex}
                      onViewSnippet={(match, index) =>
                        openEditSnippetDialog({
                          preview: selectedEspansoPreview,
                          match,
                          displayIndex: index,
                        })
                      }
                      onAddSnippet={openAddSnippetDialog}
                      onOpenVisualEditor={openVisualEditorDialog}
                      onOpenWarnings={(path) => openWarningsDialog(path)}
                      onBatchDelete={(matchIndices, onComplete) =>
                        batchDeleteSnippetsFromYaml(
                          selectedEspansoPreview.config.path,
                          selectedEspansoPreview.config.relativePath,
                          matchIndices,
                          onComplete
                        )
                      }
                    />
                  ) : selectedDirectoryNode ? (
                    <EspansoDirectoryDetail
                      node={selectedDirectoryNode}
                      onSelectFile={setSelectedEspansoConfigPath}
                      onCreateFile={openCreateFileDialog}
                      onCreateFolder={openCreateFolderDialog}
                    />
                  ) : (
                    <EmptyState
                      icon={FileText}
                      title={t("empty.noSelection")}
                      description={t("empty.noSelectionDescription")}
                    />
                  )}
                </section>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-8 text-center rounded-lg border border-dashed my-auto bg-background/50">
              <FolderOpen className="h-12 w-12 text-muted-foreground/60 mb-3" />
              <h3 className="text-2xl font-semibold mb-1">{t("empty.noYamlFilesTitle")}</h3>
              <p className="text-base text-muted-foreground max-w-md mb-6">
                {isScanningEspanso
                  ? t("status.scanningEspansoConfigs")
                  : espansoScanMessage || t("empty.noYamlFilesMessage")}
              </p>
              {!isScanningEspanso && (
                <div className="flex flex-wrap justify-center gap-3">
                  <Button onClick={() => openCreateFolderDialog("")}>
                    <FolderPlus className="h-4 w-4 mr-2" />
                    {t("filesystem.createFolder")}
                  </Button>
                  <Button variant="outline" onClick={() => openCreateFileDialog("")}>
                    <FilePlus className="h-4 w-4 mr-2" />
                    {t("filesystem.createFile")}
                  </Button>
                  <Button variant="ghost" onClick={() => scanDefaultEspansoConfigDir()}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    {t("actions.refresh")}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Render Snippet Form Body and Footer Helpers */}
      <Dialog open={isAddSnippetOpen} onOpenChange={(open) => {
        setIsAddSnippetOpen(open);
        if (!open) {
          resetSnippetForm();
          setSnippetEditTarget(null);
        }
      }}>
        <DialogContent
          className="grid h-[calc(100vh-3rem)] max-h-[calc(100vh-3rem)] w-[50vw] min-w-[min(36rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden"
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
              <div className="flex-1 flex flex-col space-y-2 min-h-[120px]">
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
                placeholder={t("snippets.descriptionPlaceholder")}
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
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
              <Button variant="outline" onClick={() => setIsAddSnippetOpen(false)}>
                {t("actions.cancel")}
              </Button>
              <Button onClick={saveSnippetToYaml} disabled={isSavingSnippet}>
                {isSavingSnippet ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {snippetEditTarget ? t("actions.updateYaml") : t("actions.saveToYaml")}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <VisualYamlEditorDialog
        isOpen={isVisualEditorOpen}
        onOpenChange={setIsVisualEditorOpen}
        snippetEditTarget={snippetEditTarget}
        selectedEspansoPreview={selectedEspansoPreview}
        t={t}
        visualEditor={{
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
        }}
        form={{
          addErrors,
          addWarnings,
          isYamlWarningsEnabled,
          editTriggersText,
          setEditTriggersText,
          activeSnippetKind: addSnippetKind,
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
        }}
        actions={{
          deleteSnippetFromYaml,
          saveSnippetToYaml,
          isSavingSnippet,
          showAlert,
          resetSnippetForm,
          setSnippetEditTarget,
        }}
      />

      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("settings.title")}</DialogTitle>
            <DialogDescription>{t("settings.description")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Language Setting Block */}
            <div className="rounded-lg border bg-secondary/40 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-background text-primary">
                  <Globe className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <Label className="text-sm font-semibold">{t("settings.language")}</Label>
                    <div className="flex items-center rounded-lg border bg-background p-0.5 shadow-sm">
                      <button
                        type="button"
                        onClick={() => setLocale("en")}
                        className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                          locale === "en"
                            ? "bg-primary text-primary-foreground shadow-xs"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {t("settings.english")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setLocale("zh-CN")}
                        className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                          locale === "zh-CN"
                            ? "bg-primary text-primary-foreground shadow-xs"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {t("settings.chinese")}
                      </button>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("settings.languageDescription")}
                  </p>
                </div>
              </div>
            </div>

            {/* Espanso config scan */}
            <div className="rounded-lg border bg-secondary/40 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-background text-primary">
                  {isScanningEspanso ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileSearch className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <Label className="text-sm font-semibold">{t("settings.espansoConfigScan")}</Label>
                    <Button size="sm" variant="outline" onClick={() => scanDefaultEspansoConfigDir()} disabled={isScanningEspanso}>
                      {isScanningEspanso ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                      {t("actions.refresh")}
                    </Button>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {espansoMatchDir || t("settings.notDetected")}
                  </p>
                  {espansoPathSource && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {espansoPathSource === "cli" ? t("settings.resolvedWithCli") : t("settings.usingPlatformDefault")}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Experimental Features Block */}
            {IS_EXPERIMENTAL_BUILD && (
              <div className="rounded-lg border bg-secondary/40 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-background text-primary">
                    <FlaskConical className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor="experimental-yaml-warnings" className="text-sm font-semibold cursor-pointer">
                        {t("settings.enableYamlWarnings")}
                      </Label>
                      <Switch
                        id="experimental-yaml-warnings"
                        checked={enableExperimentalYamlWarnings}
                        onCheckedChange={handleToggleExperimentalYamlWarnings}
                      />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("settings.enableYamlWarningsDescription")}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => {
                setIsSettingsOpen(false);
                setIsAboutOpen(true);
              }}
            >
              <Info className="mr-1 h-3.5 w-3.5" />
              {t("dialogs.about.title")}
            </Button>
            <Button onClick={() => setIsSettingsOpen(false)}>{t("actions.done")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <SearchDialog
        open={isSearchOpen}
        onOpenChange={setIsSearchOpen}
        previews={espansoConfigPreviews}
        matchDir={espansoMatchDir}
        onSelectResult={handleSelectSearchResult}
      />

      <AboutDialog open={isAboutOpen} onOpenChange={setIsAboutOpen} />

      <EspansoLogDialog open={isLogOpen} onOpenChange={setIsLogOpen} />

      <WarningsDialog
        open={isWarningsDialogOpen}
        onOpenChange={setIsWarningsDialogOpen}
        previews={espansoConfigPreviews}
        filterPath={warningsFilterPath}
        onClearFilter={() => setWarningsFilterPath(null)}
        onSelectFile={(path) => {
          setSelectedEspansoConfigPath(path);
        }}
        onOpenFileExternal={openYamlFileInDefaultApp}
      />

      <Dialog
        open={alertDialog.isOpen}
        onOpenChange={(open) => {
          if (!open) {
            if (alertDialog.onCancel) alertDialog.onCancel();
            setAlertDialog((prev) => ({ ...prev, isOpen: false }));
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{alertDialog.title}</DialogTitle>
            <DialogDescription className="mt-2 text-sm text-foreground/90 whitespace-pre-line">
              {alertDialog.description}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 flex justify-end gap-2">
            {alertDialog.cancelText && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (alertDialog.onCancel) alertDialog.onCancel();
                  setAlertDialog((prev) => ({ ...prev, isOpen: false }));
                }}
              >
                {alertDialog.cancelText}
              </Button>
            )}
            <Button
              type="button"
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => {
                const cb = alertDialog.onConfirm;
                setAlertDialog((prev) => ({ ...prev, isOpen: false }));
                if (cb) cb();
              }}
            >
              {alertDialog.confirmText}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create New YAML File Dialog */}
      <Dialog open={isCreateFileOpen} onOpenChange={setIsCreateFileOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FilePlus className="h-5 w-5 text-primary" />
              {t("filesystem.createFile")}
            </DialogTitle>
            <DialogDescription>
              {t("filesystem.createFileDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {createFileError && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <XCircle className="h-4 w-4 shrink-0" />
                <span>{createFileError}</span>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="create-file-name">
                {t("filesystem.fileName")} <RequiredMark />
              </Label>
              <Input
                id="create-file-name"
                placeholder={t("filesystem.fileNamePlaceholder")}
                value={createFileName}
                onChange={(e) => {
                  setCreateFileName(e.target.value);
                  setCreateFileError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isCreatingFile) {
                    e.preventDefault();
                    handleCreateFile();
                  }
                }}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                {t("filesystem.fileExtensionHint")}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="create-file-parent">{t("filesystem.targetLocation")}</Label>
              <select
                id="create-file-parent"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={createFileParentRelPath}
                onChange={(e) => setCreateFileParentRelPath(e.target.value)}
              >
                <option value="">{t("filesystem.rootMatchDirectory")}</option>
                {espansoDirectories.map((dir) => (
                  <option key={dir.relativePath} value={dir.relativePath}>
                    /{dir.relativePath}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateFileOpen(false)} disabled={isCreatingFile}>
              {t("actions.cancel")}
            </Button>
            <Button onClick={handleCreateFile} disabled={isCreatingFile || !createFileName.trim()}>
              {isCreatingFile ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  {t("filesystem.creating")}
                </>
              ) : (
                t("filesystem.createFileShort")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create New Subdirectory Dialog */}
      <Dialog open={isCreateFolderOpen} onOpenChange={setIsCreateFolderOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderPlus className="h-5 w-5 text-primary" />
              {t("filesystem.createFolder")}
            </DialogTitle>
            <DialogDescription>
              {t("filesystem.createFolderDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {createFolderError && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <XCircle className="h-4 w-4 shrink-0" />
                <span>{createFolderError}</span>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="create-folder-name">
                {t("filesystem.folderName")} <RequiredMark />
              </Label>
              <Input
                id="create-folder-name"
                placeholder={t("filesystem.folderNamePlaceholder")}
                value={createFolderName}
                onChange={(e) => {
                  setCreateFolderName(e.target.value);
                  setCreateFolderError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isCreatingFolder) {
                    e.preventDefault();
                    handleCreateFolder();
                  }
                }}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="create-folder-parent">{t("filesystem.targetLocation")}</Label>
              <select
                id="create-folder-parent"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={createFolderParentRelPath}
                onChange={(e) => setCreateFolderParentRelPath(e.target.value)}
              >
                <option value="">{t("filesystem.rootMatchDirectory")}</option>
                {espansoDirectories.map((dir) => (
                  <option key={dir.relativePath} value={dir.relativePath}>
                    /{dir.relativePath}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateFolderOpen(false)} disabled={isCreatingFolder}>
              {t("actions.cancel")}
            </Button>
            <Button onClick={handleCreateFolder} disabled={isCreatingFolder || !createFolderName.trim()}>
              {isCreatingFolder ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  {t("filesystem.creating")}
                </>
              ) : (
                t("filesystem.createFolderShort")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

export default App;
