import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import "./App.css";

import { useI18n } from "./i18n/useI18n";
import { AboutDialog } from "./components/AboutDialog";
import { EspansoLogDialog } from "./components/EspansoLogDialog";
import { ConfirmAlertDialog } from "./components/shared/ConfirmAlertDialog";
import { SearchDialog } from "./features/search/components/SearchDialog";
import { useSearchIndex } from "./features/search/hooks/useSearchIndex";
import { WarningsDialog } from "./features/warnings/components/WarningsDialog";
import { useYamlWarnings } from "./features/warnings/hooks/useYamlWarnings";
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
import { useSnippetCommands } from "./features/snippets/hooks/useSnippetCommands";
import { ImportAlfredSnippetsDialog } from "./features/snippets/components/ImportAlfredSnippetsDialog";
import { TriggerConflictsDialog } from "./features/snippets/components/TriggerConflictsDialog";
import {
  getTriggerConflictSources,
  type TriggerConflictSource,
  type TriggerPrefixConflict,
} from "./logic/triggerConflicts";
import { detectTriggerPrefixConflictsFromIndex } from "./tauri/searchIndex";
export type { EspansoConfigPreview } from "./features/espanso-configs/types";

const DEFAULT_COLLECTION_PANE_WIDTH = 20;
const MIN_COLLECTION_PANE_WIDTH = 14;
const MAX_COLLECTION_PANE_WIDTH = 40;

function App() {
  const { t } = useI18n();
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [collectionPaneWidth, setCollectionPaneWidth] = useState<number>(
    DEFAULT_COLLECTION_PANE_WIDTH,
  );
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

  const { isSearchOpen, setIsSearchOpen, highlightedSnippetIndex, handleSelectSearchResult } =
    useSearchIndex({
      onSelectConfigPath: setSelectedEspansoConfigPath,
    });

  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isLogOpen, setIsLogOpen] = useState<boolean>(false);
  const [isAboutOpen, setIsAboutOpen] = useState<boolean>(false);
  const [isImportAlfredOpen, setIsImportAlfredOpen] = useState<boolean>(false);
  const [isTriggerConflictsOpen, setIsTriggerConflictsOpen] = useState<boolean>(false);
  const [selectedTriggerPrefixConflicts, setSelectedTriggerPrefixConflicts] = useState<
    TriggerPrefixConflict[]
  >([]);
  const [alfredInitialFilePath, setAlfredInitialFilePath] = useState<string | null>(null);

  const snippetEditor = useSnippetEditor();

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
    snippetEditTarget: snippetEditor.editTarget,
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
    setCollectionPaneWidth(
      Math.min(MAX_COLLECTION_PANE_WIDTH, Math.max(MIN_COLLECTION_PANE_WIDTH, nextWidth)),
    );
  }, []);

  const startCollectionResize = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      setIsCollectionResizing(true);
      updateCollectionPaneWidth(event.clientX);
    },
    [updateCollectionPaneWidth],
  );

  const handleCollectionResizeMove = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (!isCollectionResizing) return;
      updateCollectionPaneWidth(event.clientX);
    },
    [isCollectionResizing, updateCollectionPaneWidth],
  );

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

  const { alertDialog, showAlert, showConfirm, closeAlertDialog } = useConfirmAlertDialog();

  const {
    chooseSnippetFile,
    chooseSnippetImageFile,
    setSnippetImagePathSafely,
    saveSnippetToYaml,
    deleteSnippetFromYaml,
    batchDeleteSnippetsFromYaml,
    openYamlFileInDefaultApp,
    importAlfredSnippetsToYaml,
  } = useSnippetCommands({
    selectedEspansoPreview,
    snippetEditTarget: snippetEditor.editTarget,
    espansoConfigs,
    espansoMatchDir,
    isVisualEditorOpen,
    visualEditorMode,
    isSavingSnippet: snippetEditor.isSaving,
    setIsSavingSnippet: snippetEditor.setIsSaving,
    buildFormSnippet: snippetEditor.buildSnippetObject,
    setAddErrors: snippetEditor.setErrors,
    setAddWarnings: snippetEditor.setWarnings,
    resetSnippetForm: snippetEditor.resetForm,
    setSnippetEditTarget: snippetEditor.setEditTarget,
    setIsAddSnippetOpen: snippetEditor.setIsOpen,
    setEditIncludeFile: snippetEditor.setIncludeFile,
    setEditImagePath: snippetEditor.setImagePath,
    applyPendingDeleteWorkflow,
    loadEspansoConfigPreview,
    setSelectedEspansoConfigPath,
    loadVisualEditorYaml,
    showAlert,
    showConfirm,
    t,
  });

  const selectedTriggerConflictSources = useMemo(
    () => (selectedEspansoPreview ? getTriggerConflictSources([selectedEspansoPreview]) : []),
    [selectedEspansoPreview],
  );

  useEffect(() => {
    if (!espansoMatchDir || !selectedEspansoPreview || selectedTriggerConflictSources.length === 0) {
      setSelectedTriggerPrefixConflicts([]);
      return;
    }

    let cancelled = false;
    detectTriggerPrefixConflictsFromIndex({
      matchDir: espansoMatchDir,
      localTriggers: selectedTriggerConflictSources,
      limit: 1000,
    })
      .then((response) => {
        if (!cancelled) {
          setSelectedTriggerPrefixConflicts(response.conflicts);
        }
      })
      .catch((error) => {
        console.warn("Trigger conflict detection failed:", error);
        if (!cancelled) {
          setSelectedTriggerPrefixConflicts([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [espansoMatchDir, selectedEspansoPreview, selectedTriggerConflictSources]);

  const openTriggerConflictSource = useCallback(
    async (source: TriggerConflictSource) => {
      const targetConfig = espansoConfigs.find((config) => config.path === source.configPath);
      if (!targetConfig) {
        showAlert(t("errors.failedToLoadConfig", { message: source.configPath }));
        return;
      }

      try {
        const loadedPreview =
          espansoConfigPreviews.find((preview) => preview.config.path === source.configPath) ||
          (selectedEspansoPreview?.config.path === source.configPath
            ? selectedEspansoPreview
            : null) ||
          (await loadEspansoConfigPreview(targetConfig));

        const targetMatch =
          loadedPreview.importedMatches[source.snippetIndex] ||
          loadedPreview.importedMatches.find(
            (match) =>
              match.originalMatchIndex === source.snippetIndex &&
              match.triggerIndex === source.triggerIndex,
          );

        if (!targetMatch) {
          showAlert(
            t("errors.failedToLoadConfig", {
              message: t("dialogs.triggerConflicts.targetNotFound", {
                trigger: source.trigger,
              }),
            }),
          );
          return;
        }

        setSelectedEspansoConfigPath(source.configPath);
        setIsTriggerConflictsOpen(false);
        snippetEditor.openEdit({
          preview: loadedPreview,
          match: targetMatch,
          displayIndex: source.snippetIndex,
        });
      } catch (error: unknown) {
        showAlert(
          t("errors.failedToLoadConfig", {
            message: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    },
    [
      espansoConfigPreviews,
      espansoConfigs,
      loadEspansoConfigPreview,
      selectedEspansoPreview,
      setSelectedEspansoConfigPath,
      showAlert,
      snippetEditor,
      t,
    ],
  );

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
    snippetEditorOpen: snippetEditor.isOpen,
    snippetKind: snippetEditor.kind,
    messages: {
      binaryFileNotAllowed: t("errors.binaryFileNotAllowed"),
      dropYamlFile: t("errors.dropYamlFile"),
      imageFileNotAllowed: t("errors.imageFileNotAllowed"),
      invalidFile: t("errors.invalidFile"),
      invalidFileType: t("errors.invalidFileType"),
      nonImageFileNotAllowed: t("errors.nonImageFileNotAllowed"),
    },
    onDropIncludeFile: snippetEditor.setIncludeFile,
    onDropImage: setSnippetImagePathSafely,
    onDropYaml: addDroppedYamlFile,
    onDropAlfredFile: (path: string) => {
      setAlfredInitialFilePath(path);
      setIsImportAlfredOpen(true);
    },
    setIsDragging,
    showAlert,
  });

  function openVisualEditorDialog() {
    if (!selectedEspansoPreview) {
      showAlert(t("errors.selectConfigBeforeAddingSnippet"), t("errors.noConfigSelected"));
      return;
    }
    snippetEditor.setEditTarget(null);
    snippetEditor.resetForm();
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
    snippetEditor.openAdd();
  }

  const snippetEditorForm = {
    addErrors: snippetEditor.errors,
    addWarnings: snippetEditor.warnings,
    isYamlWarningsEnabled,
    editTriggersText: snippetEditor.triggersText,
    setEditTriggersText: snippetEditor.setTriggersText,
    activeSnippetKind: snippetEditor.kind,
    setAddSnippetKind: snippetEditor.setKind,
    setAddErrors: snippetEditor.setErrors,
    setAddWarnings: snippetEditor.setWarnings,
    editIncludeFile: snippetEditor.includeFile,
    setEditIncludeFile: snippetEditor.setIncludeFile,
    chooseSnippetFile,
    editImagePath: snippetEditor.imagePath,
    setEditImagePath: snippetEditor.setImagePath,
    chooseSnippetImageFile,
    editForm: snippetEditor.form,
    setEditForm: snippetEditor.setForm,
    formTextareaRef: snippetEditor.formTextareaRef,
    formSelection: snippetEditor.formSelection,
    setFormSelection: snippetEditor.setFormSelection,
    captureFormSelection: snippetEditor.captureFormSelection,
    configureSelectedFormField: snippetEditor.configureSelectedFormField,
    editVars: snippetEditor.vars,
    handleInsertDateVariable: snippetEditor.insertDateOption,
    handleRemoveDateVar: snippetEditor.removeVar,
    editFormFieldConfigs: snippetEditor.formFieldConfigs,
    undoFormField: snippetEditor.undoFormField,
    updateFormFieldConfig: snippetEditor.updateFormFieldConfig,
    editReplace: snippetEditor.replace,
    setEditReplace: snippetEditor.setReplace,
    replaceTextareaRef: snippetEditor.replaceTextareaRef,
    visualEditorReplaceTextareaRef: snippetEditor.visualEditorReplaceTextareaRef,
    editDescription: snippetEditor.description,
    setEditDescription: snippetEditor.setDescription,
  };

  const snippetEditorActions = {
    deleteSnippetFromYaml,
    saveSnippetToYaml,
    isSavingSnippet: snippetEditor.isSaving,
    showAlert,
    resetSnippetForm: snippetEditor.resetForm,
    setSnippetEditTarget: snippetEditor.setEditTarget,
  };

  return (
    <div className="app-shell">
      <DragOverlay
        isDragging={isDragging}
        isAddSnippetOpen={snippetEditor.isOpen}
        addSnippetKind={snippetEditor.kind}
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
        onOpenSnippet={snippetEditor.openEdit}
        onAddSnippet={openAddSnippetDialog}
        onOpenTriggerConflicts={() => setIsTriggerConflictsOpen(true)}
        triggerConflictCount={selectedTriggerPrefixConflicts.length}
        onOpenVisualEditor={openVisualEditorDialog}
        onOpenImportAlfred={() => setIsImportAlfredOpen(true)}
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
        open={snippetEditor.isOpen}
        onOpenChange={snippetEditor.setIsOpen}
        snippetEditTarget={snippetEditor.editTarget}
        selectedEspansoPreview={selectedEspansoPreview}
        form={snippetEditorForm}
        actions={snippetEditorActions}
      />

      <VisualYamlEditorDialog
        isOpen={isVisualEditorOpen}
        onOpenChange={setIsVisualEditorOpen}
        snippetEditTarget={snippetEditor.editTarget}
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

      <TriggerConflictsDialog
        open={isTriggerConflictsOpen}
        onOpenChange={setIsTriggerConflictsOpen}
        conflicts={selectedTriggerPrefixConflicts}
        relativePath={selectedEspansoPreview?.config.relativePath}
        onOpenSource={openTriggerConflictSource}
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

      <ImportAlfredSnippetsDialog
        isOpen={isImportAlfredOpen}
        onClose={() => {
          setIsImportAlfredOpen(false);
          setAlfredInitialFilePath(null);
        }}
        configPaths={espansoConfigs.map((c) => c.path)}
        defaultConfigPath={selectedEspansoConfigPath}
        initialFilePath={alfredInitialFilePath}
        onImport={async (selectedSnippets, targetPath) => {
          await importAlfredSnippetsToYaml(selectedSnippets, targetPath);
        }}
      />
    </div>
  );
}

export default App;
