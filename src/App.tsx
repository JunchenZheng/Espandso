import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readFile } from "@tauri-apps/plugin-fs";
import { listen } from "@tauri-apps/api/event";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import {
  FilePlus,
  FileText,
  FolderOpen,
  FolderPlus,
  Loader2,
  RefreshCw,
} from "lucide-react";
import "./App.css";

import { useI18n } from "./i18n/useI18n";
import { Button } from "./components/ui/button";
import { ScrollArea } from "./components/ui/scroll-area";
import { AboutDialog } from "./components/AboutDialog";
import { EspansoLogDialog } from "./components/EspansoLogDialog";
import { EmptyState } from "./components/shared/EmptyState";
import { ConfirmAlertDialog, type AlertDialogState } from "./components/shared/ConfirmAlertDialog";

import { SearchDialog } from "./features/search/components/SearchDialog";
import { useSearchIndex } from "./features/search/hooks/useSearchIndex";

import { WarningsDialog } from "./features/warnings/components/WarningsDialog";
import { useYamlWarnings } from "./features/warnings/hooks/useYamlWarnings";

import { Snippet } from "./logic/types";
import { validate } from "./logic/validate";
import { getSnippetTriggers, isImageFilePath } from "./logic/snippetUtils";
import { checkIsBinaryFilePath } from "./logic/fileCheck";
import { cn } from "./lib/utils";
import {
  saveSnippetToYamlFile,
  deleteSnippetFromYamlFile,
  batchDeleteSnippetsFromYamlFile,
} from "./repositories/snippetYamlRepository";

import { AppHeader } from "./features/app-shell/components/AppHeader";
import { DragOverlay } from "./features/app-shell/components/DragOverlay";
import { SettingsDialog } from "./features/app-shell/components/SettingsDialog";

import { EspansoConfigTreeNode } from "./features/espanso-configs/components/EspansoConfigTreeNode";
import { EspansoConfigDetail } from "./features/espanso-configs/components/EspansoConfigDetail";
import { EspansoDirectoryDetail } from "./features/espanso-configs/components/EspansoDirectoryDetail";
import { CreateFileDialog } from "./features/espanso-configs/components/CreateFileDialog";
import { CreateFolderDialog } from "./features/espanso-configs/components/CreateFolderDialog";
import { useEspansoConfigs } from "./features/espanso-configs/hooks/useEspansoConfigs";

import { useVisualYamlEditor } from "./features/snippets/hooks/useVisualYamlEditor";
import { VisualYamlEditorDialog } from "./features/snippets/components/VisualYamlEditorDialog";
import { SnippetEditDialog } from "./features/snippets/components/SnippetEditDialog";
import { useSnippetEditor } from "./features/snippets/hooks/useSnippetEditor";

export type { EspansoConfigPreview } from "./features/espanso-configs/types";
import type {
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
  getSelectedFormFieldId,
  normalizeFormFieldConfigs,
} from "./features/snippets/formSnippet";

interface DragDropPayload {
  paths: string[];
  position: { x: number; y: number };
}

const DEFAULT_COLLECTION_PANE_WIDTH = 20;
const MIN_COLLECTION_PANE_WIDTH = 14;
const MAX_COLLECTION_PANE_WIDTH = 40;

function App() {
  const { t } = useI18n();
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

  const detectedFormFieldNames = useMemo(() => extractFormFieldNames(editForm), [editForm]);
  const detectedFormFieldKey = detectedFormFieldNames.join("\n");

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
      <DragOverlay
        isDragging={isDragging}
        isAddSnippetOpen={isAddSnippetOpen}
        addSnippetKind={addSnippetKind}
      />

      <main className="flex h-full w-full overflow-hidden bg-[linear-gradient(180deg,hsl(var(--background))_0%,hsl(var(--secondary))_100%)] p-4">
        <div className="flex h-full w-full flex-col rounded-lg border bg-secondary/40 p-4 text-left shadow-sm">
          {espansoConfigs.length > 0 ? (
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <AppHeader
                espansoMatchDir={espansoMatchDir}
                isScanningEspanso={isScanningEspanso}
                onOpenSearch={() => setIsSearchOpen(true)}
                onRefresh={() => scanDefaultEspansoConfigDir()}
                onOpenLogs={() => setIsLogOpen(true)}
                onOpenSettings={() => setIsSettingsOpen(true)}
              />

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

      <SnippetEditDialog
        open={isAddSnippetOpen}
        onOpenChange={setIsAddSnippetOpen}
        snippetEditTarget={snippetEditTarget}
        selectedEspansoPreview={selectedEspansoPreview}
        isYamlWarningsEnabled={isYamlWarningsEnabled}
        addErrors={addErrors}
        addWarnings={addWarnings}
        editTriggersText={editTriggersText}
        setEditTriggersText={setEditTriggersText}
        activeSnippetKind={addSnippetKind}
        setAddSnippetKind={setAddSnippetKind}
        setAddErrors={setAddErrors}
        setAddWarnings={setAddWarnings}
        editIncludeFile={editIncludeFile}
        setEditIncludeFile={setEditIncludeFile}
        chooseSnippetFile={chooseSnippetFile}
        editImagePath={editImagePath}
        setEditImagePath={setEditImagePath}
        chooseSnippetImageFile={chooseSnippetImageFile}
        editForm={editForm}
        setEditForm={setEditForm}
        formTextareaRef={formTextareaRef}
        formSelection={formSelection}
        setFormSelection={setFormSelection}
        captureFormSelection={captureFormSelection}
        configureSelectedFormField={configureSelectedFormField}
        editVars={editVars}
        handleInsertDateVariable={handleInsertDateVariable}
        handleRemoveDateVar={handleRemoveDateVar}
        editFormFieldConfigs={editFormFieldConfigs}
        undoFormField={undoFormField}
        updateFormFieldConfig={updateFormFieldConfig}
        editReplace={editReplace}
        setEditReplace={setEditReplace}
        replaceTextareaRef={replaceTextareaRef}
        editDescription={editDescription}
        setEditDescription={setEditDescription}
        onDeleteSnippet={deleteSnippetFromYaml}
        onSaveSnippet={saveSnippetToYaml}
        isSavingSnippet={isSavingSnippet}
        showAlert={showAlert}
        resetSnippetForm={resetSnippetForm}
        setSnippetEditTarget={setSnippetEditTarget}
      />

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

      <SettingsDialog
        open={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
        espansoMatchDir={espansoMatchDir}
        espansoPathSource={espansoPathSource}
        isScanningEspanso={isScanningEspanso}
        onRefreshScan={scanDefaultEspansoConfigDir}
        enableExperimentalYamlWarnings={enableExperimentalYamlWarnings}
        onToggleExperimentalYamlWarnings={handleToggleExperimentalYamlWarnings}
        onOpenAbout={() => setIsAboutOpen(true)}
      />

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

      <ConfirmAlertDialog
        state={alertDialog}
        onOpenChange={(open) => {
          if (!open) {
            setAlertDialog((prev) => ({ ...prev, isOpen: false }));
          }
        }}
      />

      <CreateFileDialog
        open={isCreateFileOpen}
        onOpenChange={setIsCreateFileOpen}
        createFileName={createFileName}
        setCreateFileName={setCreateFileName}
        createFileParentRelPath={createFileParentRelPath}
        setCreateFileParentRelPath={setCreateFileParentRelPath}
        createFileError={createFileError}
        setCreateFileError={setCreateFileError}
        isCreatingFile={isCreatingFile}
        espansoDirectories={espansoDirectories}
        onCreateFile={handleCreateFile}
      />

      <CreateFolderDialog
        open={isCreateFolderOpen}
        onOpenChange={setIsCreateFolderOpen}
        createFolderName={createFolderName}
        setCreateFolderName={setCreateFolderName}
        createFolderParentRelPath={createFolderParentRelPath}
        setCreateFolderParentRelPath={setCreateFolderParentRelPath}
        createFolderError={createFolderError}
        setCreateFolderError={setCreateFolderError}
        isCreatingFolder={isCreatingFolder}
        espansoDirectories={espansoDirectories}
        onCreateFolder={handleCreateFolder}
      />
    </div>
  );
}

export default App;
