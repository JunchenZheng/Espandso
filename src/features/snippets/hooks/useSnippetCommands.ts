import { useCallback, useRef } from "react";
import { readFile } from "@tauri-apps/plugin-fs";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { validate } from "../../../logic/validate";
import { getSnippetTriggers, isImageFilePath } from "../../../logic/snippetUtils";
import { checkIsBinaryFilePath } from "../../../logic/fileCheck";
import { getErrorMessage } from "../../../logic/errors";
import type { EspansoConfigFile } from "../../../logic/espansoPaths";
import type { Snippet, ValidationError } from "../../../logic/types";
import type { InterpolationParams } from "../../../i18n/types";
import type { EspansoConfigPreview } from "../../espanso-configs/types";
import type { SnippetEditTarget } from "../types";
import {
  batchDeleteSnippetsFromYamlFile,
  deleteSnippetFromYamlFile,
  saveSnippetToYamlFile,
} from "../../../repositories/snippetYamlRepository";

type VisualEditorMode = "add" | "delete";
type Translate = (key: string, params?: InterpolationParams) => string;
type DialogSelection = string | string[] | null;

interface UseSnippetCommandsProps {
  selectedEspansoPreview: EspansoConfigPreview | null;
  snippetEditTarget: SnippetEditTarget | null;
  espansoConfigs: EspansoConfigFile[];
  espansoMatchDir: string;
  isVisualEditorOpen: boolean;
  visualEditorMode: VisualEditorMode;
  isSavingSnippet: boolean;
  setIsSavingSnippet: (isSaving: boolean) => void;
  buildFormSnippet: () => Snippet;
  setAddErrors: (errors: ValidationError[]) => void;
  setAddWarnings: (warnings: string[]) => void;
  resetSnippetForm: () => void;
  setSnippetEditTarget: (target: SnippetEditTarget | null) => void;
  setIsAddSnippetOpen: (isOpen: boolean) => void;
  setEditIncludeFile: (path: string) => void;
  setEditImagePath: (path: string) => void;
  applyPendingDeleteWorkflow: () => Promise<unknown>;
  loadEspansoConfigPreview: (config: EspansoConfigFile) => Promise<unknown>;
  setSelectedEspansoConfigPath: (path: string) => void;
  loadVisualEditorYaml: (pathOverride?: string, matchIndexToHighlight?: number) => Promise<void>;
  showAlert: (description: string, title?: string) => void;
  showConfirm: (
    description: string,
    onConfirm: () => void | Promise<void>,
    title?: string,
    confirmText?: string,
    cancelText?: string,
  ) => void;
  t: Translate;
}

function getSelectedPath(selection: DialogSelection): string | null {
  if (typeof selection === "string") {
    return selection;
  }

  if (Array.isArray(selection)) {
    return selection[0] ?? null;
  }

  return null;
}

export function useSnippetCommands({
  selectedEspansoPreview,
  snippetEditTarget,
  espansoConfigs,
  espansoMatchDir,
  isVisualEditorOpen,
  visualEditorMode,
  isSavingSnippet,
  setIsSavingSnippet,
  buildFormSnippet,
  setAddErrors,
  setAddWarnings,
  resetSnippetForm,
  setSnippetEditTarget,
  setIsAddSnippetOpen,
  setEditIncludeFile,
  setEditImagePath,
  applyPendingDeleteWorkflow,
  loadEspansoConfigPreview,
  setSelectedEspansoConfigPath,
  loadVisualEditorYaml,
  showAlert,
  showConfirm,
  t,
}: UseSnippetCommandsProps) {
  const mutationLockRef = useRef(false);

  const setSnippetImagePathSafely = useCallback((path: string) => {
    if (!isImageFilePath(path)) {
      showAlert(t("errors.nonImageFileNotAllowed"), t("errors.invalidFileType"));
      return;
    }
    setEditImagePath(path);
  }, [setEditImagePath, showAlert, t]);

  const chooseSnippetFile = useCallback(async () => {
    try {
      const selected = await openDialog({
        multiple: false,
        directory: false,
      });
      const selectedPath = getSelectedPath(selected);

      if (!selectedPath) {
        return;
      }

      if (isImageFilePath(selectedPath)) {
        showAlert(t("errors.imageFileNotAllowed"), t("errors.invalidFileType"));
        return;
      }

      const isBinary = await checkIsBinaryFilePath(selectedPath, (path) => readFile(path));
      if (isBinary) {
        showAlert(t("errors.binaryFileNotAllowed"), t("errors.invalidFileType"));
        return;
      }

      setEditIncludeFile(selectedPath);
    } catch (error: unknown) {
      showAlert(t("errors.failedToSelectFile", { message: getErrorMessage(error) }), t("errors.genericError"));
    }
  }, [setEditIncludeFile, showAlert, t]);

  const chooseSnippetImageFile = useCallback(async () => {
    try {
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
      const selectedPath = getSelectedPath(selected);

      if (selectedPath) {
        setSnippetImagePathSafely(selectedPath);
      }
    } catch (error: unknown) {
      showAlert(t("errors.failedToSelectFile", { message: getErrorMessage(error) }), t("errors.genericError"));
    }
  }, [setSnippetImagePathSafely, showAlert, t]);

  const saveSnippetToYaml = useCallback(async () => {
    if (mutationLockRef.current || isSavingSnippet) {
      return;
    }

    mutationLockRef.current = true;
    setIsSavingSnippet(true);

    try {
      if (visualEditorMode === "delete") {
        await applyPendingDeleteWorkflow();
        return;
      }

      const targetPreview = snippetEditTarget?.preview || selectedEspansoPreview;
      if (!targetPreview) {
        return;
      }

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

      await saveSnippetToYamlFile(
        targetPreview.config.path,
        snippet,
        snippetEditTarget?.match.originalMatchIndex,
        espansoMatchDir || undefined,
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
      mutationLockRef.current = false;
      setIsSavingSnippet(false);
    }
  }, [
    applyPendingDeleteWorkflow,
    buildFormSnippet,
    espansoMatchDir,
    isSavingSnippet,
    isVisualEditorOpen,
    loadEspansoConfigPreview,
    loadVisualEditorYaml,
    resetSnippetForm,
    selectedEspansoPreview,
    setAddErrors,
    setAddWarnings,
    setIsAddSnippetOpen,
    setIsSavingSnippet,
    setSelectedEspansoConfigPath,
    setSnippetEditTarget,
    showAlert,
    snippetEditTarget,
    t,
    visualEditorMode,
  ]);

  const deleteSnippetFromYaml = useCallback(async (target: SnippetEditTarget) => {
    const triggers = getSnippetTriggers(target.match.originalSnippet || target.match.snippet);
    const displayTrigger = triggers.length > 0 ? triggers.join(", ") : `Snippet ${target.displayIndex + 1}`;

    showConfirm(
      t("dialogs.confirmDelete.message", { trigger: displayTrigger, file: target.preview.config.relativePath }),
      async () => {
        if (mutationLockRef.current) {
          return;
        }

        mutationLockRef.current = true;
        setIsSavingSnippet(true);

        try {
          await deleteSnippetFromYamlFile(
            target.preview.config.path,
            target.match.originalMatchIndex,
            espansoMatchDir || undefined,
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
        } finally {
          mutationLockRef.current = false;
          setIsSavingSnippet(false);
        }
      },
      t("dialogs.confirmDelete.title"),
      t("actions.delete"),
      t("actions.cancel"),
    );
  }, [
    espansoMatchDir,
    isVisualEditorOpen,
    loadEspansoConfigPreview,
    loadVisualEditorYaml,
    resetSnippetForm,
    setIsAddSnippetOpen,
    setIsSavingSnippet,
    setSelectedEspansoConfigPath,
    setSnippetEditTarget,
    showAlert,
    showConfirm,
    t,
  ]);

  const batchDeleteSnippetsFromYaml = useCallback(
    async (
      configPath: string,
      relativePath: string,
      matchIndices: number[],
      onComplete?: () => void,
    ) => {
      if (matchIndices.length === 0) {
        return;
      }

      showConfirm(
        t("dialogs.confirmBatchDelete.message", { count: matchIndices.length, file: relativePath }),
        async () => {
          if (mutationLockRef.current) {
            return;
          }

          mutationLockRef.current = true;
          setIsSavingSnippet(true);

          try {
            await batchDeleteSnippetsFromYamlFile(
              configPath,
              matchIndices,
              espansoMatchDir || undefined,
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
          } finally {
            mutationLockRef.current = false;
            setIsSavingSnippet(false);
          }
        },
        t("dialogs.confirmBatchDelete.title"),
        t("dialogs.confirmBatchDelete.confirmBtn"),
        t("actions.cancel"),
      );
    },
    [
      espansoConfigs,
      espansoMatchDir,
      isVisualEditorOpen,
      loadEspansoConfigPreview,
      loadVisualEditorYaml,
      setIsSavingSnippet,
      setSelectedEspansoConfigPath,
      showAlert,
      showConfirm,
      t,
    ],
  );

  const openYamlFileInDefaultApp = useCallback(async (path: string) => {
    try {
      await openPath(path);
    } catch (error: unknown) {
      showAlert(t("errors.failedToOpenYamlFile", { message: getErrorMessage(error) }), t("errors.genericError"));
    }
  }, [showAlert, t]);

  return {
    chooseSnippetFile,
    chooseSnippetImageFile,
    setSnippetImagePathSafely,
    saveSnippetToYaml,
    deleteSnippetFromYaml,
    batchDeleteSnippetsFromYaml,
    openYamlFileInDefaultApp,
  };
}
