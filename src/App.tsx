import { useCallback, useEffect, useRef, useState } from "react";
import { readFile } from "@tauri-apps/plugin-fs";
import { listen } from "@tauri-apps/api/event";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import "./App.css";

import { useI18n } from "./i18n/useI18n";
import { AboutDialog } from "./components/AboutDialog";
import { EspansoLogDialog } from "./components/EspansoLogDialog";
import { ConfirmAlertDialog } from "./components/shared/ConfirmAlertDialog";
import { SearchDialog } from "./features/search/components/SearchDialog";
import { useSearchIndex } from "./features/search/hooks/useSearchIndex";
import { WarningsDialog } from "./features/warnings/components/WarningsDialog";
import { useYamlWarnings } from "./features/warnings/hooks/useYamlWarnings";
import { Snippet } from "./logic/types";
import { validate } from "./logic/validate";
import { getSnippetTriggers, isImageFilePath } from "./logic/snippetUtils";
import { checkIsBinaryFilePath } from "./logic/fileCheck";
import { getErrorMessage } from "./logic/errors";
import {
  saveSnippetToYamlFile,
  deleteSnippetFromYamlFile,
  batchDeleteSnippetsFromYamlFile,
} from "./repositories/snippetYamlRepository";
import { AppWorkspace } from "./features/app-shell/components/AppWorkspace";
import { DragOverlay } from "./features/app-shell/components/DragOverlay";
import { SettingsDialog } from "./features/app-shell/components/SettingsDialog";
import { useAppFileDrop } from "./features/app-shell/hooks/useAppFileDrop";
import { useConfirmAlertDialog } from "./features/app-shell/hooks/useConfirmAlertDialog";
import { CreateFileDialog } from "./features/espanso-configs/components/CreateFileDialog";
import { CreateFolderDialog } from "./features/espanso-configs/components/CreateFolderDialog";
import { useEspansoConfigs } from "./features/espanso-configs/hooks/useEspansoConfigs";
import { useVisualYamlEditor } from "./features/snippets/hooks/useVisualYamlEditor";
import { VisualYamlEditorDialog } from "./features/snippets/components/VisualYamlEditorDialog";
import { SnippetEditDialog } from "./features/snippets/components/SnippetEditDialog";
import { useSnippetEditor } from "./features/snippets/hooks/useSnippetEditor";
export type { EspansoConfigPreview } from "./features/espanso-configs/types";
import type { SnippetEditTarget } from "./features/snippets/types";

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
    updateFormFieldConfig,
    undoFormField,
    captureFormSelection,
    configureSelectedFormField,
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

  const {
    alertDialog,
    showAlert,
    showConfirm,
    closeAlertDialog,
  } = useConfirmAlertDialog();

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;
    void listen("open-about-dialog", () => {
      setIsAboutOpen(true);
    }).then((fn) => {
      if (!active) {
        fn();
        return;
      }
      unlisten = fn;
    });

    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  useAppFileDrop({
    snippetEditorOpen: isAddSnippetOpen,
    snippetKind: addSnippetKind,
    messages: {
      binaryFileNotAllowed: t("errors.binaryFileNotAllowed"),
      dropYamlFile: t("errors.dropYamlFile"),
      imageFileNotAllowed: t("errors.imageFileNotAllowed"),
      invalidFile: t("errors.invalidFile"),
      invalidFileType: t("errors.invalidFileType"),
      nonImageFileNotAllowed: t("errors.nonImageFileNotAllowed"),
    },
    onDropIncludeFile: setEditIncludeFile,
    onDropImage: setEditImagePath,
    onDropYaml: addDroppedYamlFile,
    setIsDragging,
    showAlert,
  });

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

  function setSnippetImagePathSafely(path: string) {
    if (!isImageFilePath(path)) {
      showAlert(t("errors.nonImageFileNotAllowed"), t("errors.invalidFileType"));
      return;
    }
    setEditImagePath(path);
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
      setSnippetImagePathSafely(selected);
    } else if (Array.isArray(selected) && typeof selected[0] === "string") {
      setSnippetImagePathSafely(selected[0]);
    }
  }

  async function saveSnippetToYaml() {
    if (visualEditorMode === "delete") {
      setIsSavingSnippet(true);
      try {
        await applyPendingDeleteWorkflow();
      } catch (error: unknown) {
        showAlert(t("errors.failedToSaveSnippet", { message: getErrorMessage(error) }), t("errors.genericError"));
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
    } catch (error: unknown) {
      const errMsg = getErrorMessage(error);
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
    } catch (error: unknown) {
      showAlert(t("errors.failedToSaveSnippet", { message: getErrorMessage(error) }), t("errors.genericError"));
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
        } catch (error: unknown) {
          showAlert(t("errors.failedToDeleteSnippet", { message: getErrorMessage(error) }), t("errors.genericError"));
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
        } catch (error: unknown) {
          showAlert(t("errors.failedToBatchDeleteSnippets", { message: getErrorMessage(error) }), t("errors.genericError"));
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
    } catch (error: unknown) {
      showAlert(t("errors.failedToOpenYamlFile", { message: getErrorMessage(error) }), t("errors.genericError"));
    }
  }

  const snippetEditorForm = {
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
    replaceTextareaRef,
    visualEditorReplaceTextareaRef,
    editDescription,
    setEditDescription,
  };

  const snippetEditorActions = {
    deleteSnippetFromYaml,
    saveSnippetToYaml,
    isSavingSnippet,
    showAlert,
    resetSnippetForm,
    setSnippetEditTarget,
  };

  return (
    <div className="app-shell">
      <DragOverlay
        isDragging={isDragging}
        isAddSnippetOpen={isAddSnippetOpen}
        addSnippetKind={addSnippetKind}
      />

      <AppWorkspace
        espansoMatchDir={espansoMatchDir}
        espansoConfigsCount={espansoConfigs.length}
        espansoPreviewTree={espansoPreviewTree}
        selectedEspansoConfigPath={selectedEspansoConfigPath}
        selectedEspansoPreview={selectedEspansoPreview}
        selectedDirectoryNode={selectedDirectoryNode}
        activeDirectoryRelPath={activeDirectoryRelPath}
        activeEspansoAncestorPaths={activeEspansoAncestorPaths}
        collectionPaneWidth={collectionPaneWidth}
        isCollectionResizing={isCollectionResizing}
        isScanningEspanso={isScanningEspanso}
        isLoadingSelectedPreview={isLoadingSelectedPreview}
        isSelectedPreviewLoaded={isSelectedPreviewLoaded}
        selectedPreviewError={selectedPreviewError}
        espansoScanMessage={espansoScanMessage}
        highlightedSnippetIndex={highlightedSnippetIndex}
        mainSplitRef={mainSplitRef}
        onOpenSearch={() => setIsSearchOpen(true)}
        onRefresh={scanDefaultEspansoConfigDir}
        onOpenLogs={() => setIsLogOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onSelectConfigPath={setSelectedEspansoConfigPath}
        onOpenYamlFile={openYamlFileInDefaultApp}
        onCreateFile={openCreateFileDialog}
        onCreateFolder={openCreateFolderDialog}
        onOpenSnippet={openSnippetEditorEdit}
        onAddSnippet={openAddSnippetDialog}
        onOpenVisualEditor={openVisualEditorDialog}
        onOpenWarnings={openWarningsDialog}
        onBatchDelete={(matchIndices, onComplete) => {
          if (!selectedEspansoPreview) return;
          batchDeleteSnippetsFromYaml(
            selectedEspansoPreview.config.path,
            selectedEspansoPreview.config.relativePath,
            matchIndices,
            onComplete,
          );
        }}
        onCollectionResizeStart={startCollectionResize}
        onCollectionResizeMove={handleCollectionResizeMove}
        onCollectionResizeStop={stopCollectionResize}
      />

      <SnippetEditDialog
        open={isAddSnippetOpen}
        onOpenChange={setIsAddSnippetOpen}
        snippetEditTarget={snippetEditTarget}
        selectedEspansoPreview={selectedEspansoPreview}
        form={snippetEditorForm}
        actions={snippetEditorActions}
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
        form={snippetEditorForm}
        actions={snippetEditorActions}
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
          if (!open) closeAlertDialog();
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
