import { useCallback, useEffect, useMemo, useState } from "react";
import { mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { listen } from "@tauri-apps/api/event";

import { useI18n } from "../../../i18n/useI18n";
import {
  EspansoConfigFile,
  EspansoDirectoryInfo,
  EspansoPathSource,
  scanEspansoConfigFiles,
} from "../../../logic/espansoPaths";
import { importYamlContent } from "../../../logic/importYaml";
import {
  getInitialYamlTemplate,
  normalizeYamlFileName,
  resolveTargetPath,
  validateFileName,
  validateFolderName,
} from "../../../logic/createFileSystem";
import {
  markSearchIndexInternalWrite,
  refreshSearchIndexFile,
  startSearchIndexSync,
  startSearchIndexWatcher,
  stopSearchIndexWatcher,
} from "../../../tauri/searchIndex";
import {
  buildEspansoConfigPreviewTree,
  findTreeNode,
  getEspansoConfigAncestorPaths,
} from "../tree";
import type { EspansoConfigPreview } from "../types";

export interface UseEspansoConfigsOptions {
  isYamlWarningsEnabled?: boolean;
}

export function useEspansoConfigs(options: UseEspansoConfigsOptions = {}) {
  const { isYamlWarningsEnabled = true } = options;
  const { t } = useI18n();

  const [espansoMatchDir, setEspansoMatchDir] = useState<string>("");
  const [espansoPathSource, setEspansoPathSource] = useState<EspansoPathSource | "">("");
  const [espansoConfigs, setEspansoConfigs] = useState<EspansoConfigFile[]>([]);
  const [espansoDirectories, setEspansoDirectories] = useState<EspansoDirectoryInfo[]>([]);
  const [espansoConfigPreviews, setEspansoConfigPreviews] = useState<EspansoConfigPreview[]>([]);
  const [selectedEspansoConfigPath, setSelectedEspansoConfigPath] = useState<string>("");
  const [isScanningEspanso, setIsScanningEspanso] = useState<boolean>(false);
  const [isLoadingSelectedPreview, setIsLoadingSelectedPreview] = useState<boolean>(false);
  const [selectedPreviewError, setSelectedPreviewError] = useState<string>("");
  const [espansoScanMessage, setEspansoScanMessage] = useState<string>("");

  // Create File State
  const [isCreateFileOpen, setIsCreateFileOpen] = useState<boolean>(false);
  const [createFileName, setCreateFileName] = useState<string>("");
  const [createFileParentRelPath, setCreateFileParentRelPath] = useState<string>("");
  const [createFileError, setCreateFileError] = useState<string>("");
  const [isCreatingFile, setIsCreatingFile] = useState<boolean>(false);

  // Create Folder State
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState<boolean>(false);
  const [createFolderName, setCreateFolderName] = useState<string>("");
  const [createFolderParentRelPath, setCreateFolderParentRelPath] = useState<string>("");
  const [createFolderError, setCreateFolderError] = useState<string>("");
  const [isCreatingFolder, setIsCreatingFolder] = useState<boolean>(false);

  const localizeFileSystemError = useCallback(
    (message: string): string => {
      const fileDuplicate = message.match(/^File "(.+)" already exists in the selected directory\.$/);
      if (fileDuplicate) {
        return t("filesystem.fileAlreadyExists", { name: fileDuplicate[1] });
      }

      const folderDuplicate = message.match(/^Folder "(.+)" already exists in the selected directory\.$/);
      if (folderDuplicate) {
        return t("filesystem.folderAlreadyExists", { name: folderDuplicate[1] });
      }

      const reservedFolder = message.match(/^'(.+)' is a reserved Espanso directory name and cannot be used\.$/);
      if (reservedFolder) {
        return t("filesystem.folderReserved", { name: reservedFolder[1] });
      }

      const staticMessages: Record<string, string> = {
        "File name cannot be empty.": t("filesystem.fileNameRequired"),
        "File name contains invalid characters (/ \\ : * ? \" < > |).": t("filesystem.fileNameInvalidChars"),
        "Folder name cannot be empty.": t("filesystem.folderNameRequired"),
        "Folder name contains invalid characters (/ \\ : * ? \" < > |).": t("filesystem.folderNameInvalidChars"),
      };

      return staticMessages[message] || message;
    },
    [t],
  );

  const buildEspansoConfigPreview = useCallback(
    async (config: EspansoConfigFile): Promise<EspansoConfigPreview> => {
      try {
        const content = await readTextFile(config.path);
        const result = importYamlContent(content, config.name);
        const inlineCount = result.snippets.filter((snippet) => snippet.replace !== undefined).length;
        const resourceCount = result.snippets.filter((snippet) => snippet.include_file).length;
        const imageCount = result.snippets.filter((snippet) => snippet.image_path !== undefined).length;
        const formCount = result.snippets.filter((snippet) => snippet.form !== undefined).length;

        return {
          config,
          snippetCount: result.snippets.length,
          inlineCount,
          resourceCount,
          imageCount,
          formCount,
          warningCount: result.warnings.length,
          warnings: result.warnings,
          snippets: result.snippets,
          importedMatches: result.importedMatches,
        };
      } catch (e: any) {
        return {
          config,
          snippetCount: 0,
          inlineCount: 0,
          resourceCount: 0,
          imageCount: 0,
          formCount: 0,
          warningCount: 1,
          warnings: [t("errors.failedToReadFile", { file: config.name, message: e?.message || e })],
          snippets: [],
          importedMatches: [],
        };
      }
    },
    [t],
  );

  const loadEspansoConfigPreview = useCallback(
    async (config: EspansoConfigFile): Promise<EspansoConfigPreview> => {
      const preview = await buildEspansoConfigPreview(config);
      setEspansoConfigPreviews((current) => [
        ...current.filter((item) => item.config.path !== config.path),
        preview,
      ]);
      return preview;
    },
    [buildEspansoConfigPreview],
  );

  const scanDefaultEspansoConfigDir = useCallback(
    async (options?: { skipIndexSync?: boolean }) => {
      setIsScanningEspanso(true);
      setEspansoScanMessage(t("status.scanningEspansoConfigs"));
      try {
        const result = await scanEspansoConfigFiles();
        setEspansoMatchDir(result.matchDir);
        if (result.matchDir && !options?.skipIndexSync) {
          startSearchIndexSync(result.matchDir).catch((err) => {
            console.warn("Background SQLite search indexing failed:", err);
          });
        }
        setEspansoPathSource(result.pathSource);
        setEspansoConfigs(result.files);
        setEspansoDirectories(result.directories || []);
        setEspansoConfigPreviews([]);
        setSelectedPreviewError("");
        setSelectedEspansoConfigPath((current) => {
          if (current && result.files.some((file) => file.path === current)) return current;
          return result.files[0]?.path || "";
        });
        setEspansoScanMessage(result.files.length > 0 ? "" : t("empty.noYamlFilesMessage"));
      } catch (e: any) {
        const message = e?.message || String(e);
        const permissionHint = message.toLowerCase().includes("forbidden")
          ? t("errors.espansoPathBlocked", { message })
          : t("errors.failedToScanEspansoConfigs", { message });
        setEspansoConfigs([]);
        setEspansoDirectories([]);
        setEspansoConfigPreviews([]);
        setEspansoScanMessage(permissionHint);
      } finally {
        setIsScanningEspanso(false);
      }
    },
    [t],
  );

  const addDroppedYamlFile = useCallback((path: string) => {
    const parts = path.split(/[/\\]/);
    const name = parts[parts.length - 1];
    const config: EspansoConfigFile = {
      name,
      path,
      relativePath: name,
    };

    setEspansoConfigs((current) => [config, ...current.filter((item) => item.path !== path)]);
    setEspansoConfigPreviews((current) => current.filter((item) => item.config.path !== path));
    setSelectedEspansoConfigPath(path);
  }, []);

  const espansoPreviewList = useMemo(() => {
    const loadedPreviewByPath = new Map(
      espansoConfigPreviews.map((preview) => [preview.config.path, preview]),
    );

    return espansoConfigs.map((config) => {
      const loadedPreview = loadedPreviewByPath.get(config.path);
      const preview = loadedPreview || {
        config,
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

      if (isYamlWarningsEnabled) {
        return preview;
      }

      return {
        ...preview,
        warningCount: 0,
        warnings: [],
      };
    });
  }, [espansoConfigPreviews, espansoConfigs, isYamlWarningsEnabled]);

  const espansoPreviewTree = useMemo(
    () => buildEspansoConfigPreviewTree(espansoPreviewList, espansoDirectories),
    [espansoPreviewList, espansoDirectories],
  );

  const selectedTreeNode = useMemo(
    () => (selectedEspansoConfigPath ? findTreeNode(espansoPreviewTree, selectedEspansoConfigPath) : null),
    [espansoPreviewTree, selectedEspansoConfigPath],
  );

  const selectedEspansoPreview = useMemo(() => {
    if (selectedTreeNode && !selectedTreeNode.isDir && selectedTreeNode.preview) {
      return selectedTreeNode.preview;
    }
    if (selectedTreeNode && selectedTreeNode.isDir) {
      return null;
    }
    if (selectedEspansoConfigPath) {
      const found = espansoPreviewList.find(
        (preview) => preview.config.path === selectedEspansoConfigPath,
      );
      if (found) return found;
    }
    return espansoPreviewList[0] || null;
  }, [selectedTreeNode, espansoPreviewList, selectedEspansoConfigPath]);

  const isSelectedPreviewLoaded = useMemo(
    () =>
      !!selectedEspansoPreview &&
      espansoConfigPreviews.some(
        (preview) => preview.config.path === selectedEspansoPreview.config.path,
      ),
    [espansoConfigPreviews, selectedEspansoPreview],
  );

  const selectedDirectoryNode = useMemo(() => {
    if (selectedTreeNode && selectedTreeNode.isDir) {
      return selectedTreeNode;
    }
    return null;
  }, [selectedTreeNode]);

  const activeDirectoryRelPath = useMemo(() => {
    if (selectedDirectoryNode) {
      return selectedDirectoryNode.relativePath;
    }
    if (selectedEspansoPreview) {
      const rel = selectedEspansoPreview.config.relativePath;
      const lastSlash = rel.lastIndexOf("/");
      return lastSlash > -1 ? rel.slice(0, lastSlash) : "";
    }
    return "";
  }, [selectedDirectoryNode, selectedEspansoPreview]);

  const activeEspansoAncestorPaths = useMemo(() => {
    const targetRelPath =
      selectedDirectoryNode?.relativePath || selectedEspansoPreview?.config.relativePath || "";
    return getEspansoConfigAncestorPaths(targetRelPath);
  }, [selectedDirectoryNode, selectedEspansoPreview]);

  useEffect(() => {
    if (!espansoMatchDir) {
      stopSearchIndexWatcher().catch((e) =>
        console.warn("Search index watcher stop failed:", e),
      );
      return;
    }

    startSearchIndexWatcher(espansoMatchDir).catch((e) =>
      console.warn("Search index watcher start failed:", e),
    );

    return () => {
      stopSearchIndexWatcher().catch((e) =>
        console.warn("Search index watcher stop failed:", e),
      );
    };
  }, [espansoMatchDir]);

  useEffect(() => {
    let statusUnlisten: (() => void) | undefined;
    let errorUnlisten: (() => void) | undefined;

    listen("search-index-status-changed", () => {
      scanDefaultEspansoConfigDir({ skipIndexSync: true }).catch((e) =>
        console.warn("Espanso collection refresh failed:", e),
      );
    }).then((fn) => {
      statusUnlisten = fn;
    });

    listen<string>("search-index-watch-error", (event) => {
      console.warn("Search index watcher failed:", event.payload);
    }).then((fn) => {
      errorUnlisten = fn;
    });

    return () => {
      if (statusUnlisten) statusUnlisten();
      if (errorUnlisten) errorUnlisten();
    };
  }, [scanDefaultEspansoConfigDir]);

  useEffect(() => {
    scanDefaultEspansoConfigDir();
  }, [scanDefaultEspansoConfigDir]);

  useEffect(() => {
    const selectedConfig = espansoConfigs.find((config) => config.path === selectedEspansoConfigPath);
    if (!selectedConfig) {
      setIsLoadingSelectedPreview(false);
      setSelectedPreviewError("");
      return;
    }

    const hasLoadedPreview = espansoConfigPreviews.some(
      (preview) => preview.config.path === selectedConfig.path,
    );
    if (hasLoadedPreview) {
      setIsLoadingSelectedPreview(false);
      setSelectedPreviewError("");
      return;
    }

    let cancelled = false;
    setIsLoadingSelectedPreview(true);
    setSelectedPreviewError("");

    loadEspansoConfigPreview(selectedConfig)
      .then((preview) => {
        if (cancelled) return;
        if (preview.warnings.length > 0 && preview.snippets.length === 0) {
          setSelectedPreviewError(preview.warnings[0]);
        }
      })
      .catch((e: any) => {
        if (cancelled) return;
        setSelectedPreviewError(e?.message || String(e));
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingSelectedPreview(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [espansoConfigPreviews, espansoConfigs, loadEspansoConfigPreview, selectedEspansoConfigPath]);

  const openCreateFileDialog = useCallback(
    (defaultParentRelPath?: string) => {
      const targetParent =
        defaultParentRelPath !== undefined ? defaultParentRelPath : activeDirectoryRelPath;
      setCreateFileName("");
      setCreateFileParentRelPath(targetParent);
      setCreateFileError("");
      setIsCreateFileOpen(true);
    },
    [activeDirectoryRelPath],
  );

  const openCreateFolderDialog = useCallback(
    (defaultParentRelPath?: string) => {
      const targetParent =
        defaultParentRelPath !== undefined ? defaultParentRelPath : activeDirectoryRelPath;
      setCreateFolderName("");
      setCreateFolderParentRelPath(targetParent);
      setCreateFolderError("");
      setIsCreateFolderOpen(true);
    },
    [activeDirectoryRelPath],
  );

  const handleCreateFile = async () => {
    if (!espansoMatchDir) {
      setCreateFileError(t("errors.espansoMatchDirUnavailable"));
      return;
    }

    const normalizedName = normalizeYamlFileName(createFileName);

    const existingFileNames = espansoConfigs
      .filter((file) => {
        if (!createFileParentRelPath) {
          return !file.relativePath.includes("/");
        }
        const parentPrefix = `${createFileParentRelPath}/`;
        if (!file.relativePath.startsWith(parentPrefix)) return false;
        const subPath = file.relativePath.slice(parentPrefix.length);
        return !subPath.includes("/");
      })
      .map((file) => file.name);

    const err = validateFileName(createFileName, existingFileNames);
    if (err) {
      setCreateFileError(localizeFileSystemError(err));
      return;
    }

    setIsCreatingFile(true);
    setCreateFileError("");

    try {
      const parentAbsPath = createFileParentRelPath
        ? `${espansoMatchDir}/${createFileParentRelPath}`
        : espansoMatchDir;
      const targetAbsPath = resolveTargetPath(parentAbsPath, normalizedName);

      const template = getInitialYamlTemplate(normalizedName);
      await markSearchIndexInternalWrite(targetAbsPath);
      await writeTextFile(targetAbsPath, template);
      if (espansoMatchDir) {
        refreshSearchIndexFile(targetAbsPath, espansoMatchDir).catch((e) =>
          console.warn("Index refresh failed:", e),
        );
      }

      setIsCreateFileOpen(false);
      await scanDefaultEspansoConfigDir();
      setSelectedEspansoConfigPath(targetAbsPath);
    } catch (e: any) {
      setCreateFileError(t("errors.failedToCreateFile", { message: e?.message || e }));
    } finally {
      setIsCreatingFile(false);
    }
  };

  const handleCreateFolder = async () => {
    if (!espansoMatchDir) {
      setCreateFolderError(t("errors.espansoMatchDirUnavailable"));
      return;
    }

    const existingFolderNames = espansoDirectories
      .filter((dir) => {
        if (!createFolderParentRelPath) {
          return !dir.relativePath.includes("/");
        }
        const parentPrefix = `${createFolderParentRelPath}/`;
        if (!dir.relativePath.startsWith(parentPrefix)) return false;
        const subPath = dir.relativePath.slice(parentPrefix.length);
        return !subPath.includes("/");
      })
      .map((dir) => dir.name);

    const err = validateFolderName(createFolderName, existingFolderNames);
    if (err) {
      setCreateFolderError(localizeFileSystemError(err));
      return;
    }

    setIsCreatingFolder(true);
    setCreateFolderError("");

    try {
      const parentAbsPath = createFolderParentRelPath
        ? `${espansoMatchDir}/${createFolderParentRelPath}`
        : espansoMatchDir;
      const targetAbsPath = resolveTargetPath(parentAbsPath, createFolderName.trim());

      await mkdir(targetAbsPath, { recursive: true });

      const newRelPath = createFolderParentRelPath
        ? `${createFolderParentRelPath}/${createFolderName.trim()}`
        : createFolderName.trim();

      setIsCreateFolderOpen(false);
      await scanDefaultEspansoConfigDir();
      setSelectedEspansoConfigPath(newRelPath);
    } catch (e: any) {
      setCreateFolderError(t("errors.failedToCreateDirectory", { message: e?.message || e }));
    } finally {
      setIsCreatingFolder(false);
    }
  };

  return {
    espansoMatchDir,
    setEspansoMatchDir,
    espansoPathSource,
    espansoConfigs,
    setEspansoConfigs,
    espansoDirectories,
    setEspansoDirectories,
    espansoConfigPreviews,
    setEspansoConfigPreviews,
    selectedEspansoConfigPath,
    setSelectedEspansoConfigPath,
    isScanningEspanso,
    isLoadingSelectedPreview,
    selectedPreviewError,
    espansoScanMessage,

    // Derived states
    espansoPreviewList,
    espansoPreviewTree,
    selectedTreeNode,
    selectedEspansoPreview,
    isSelectedPreviewLoaded,
    selectedDirectoryNode,
    activeDirectoryRelPath,
    activeEspansoAncestorPaths,

    // Actions & Methods
    buildEspansoConfigPreview,
    loadEspansoConfigPreview,
    scanDefaultEspansoConfigDir,
    addDroppedYamlFile,

    // Create File Modal state & methods
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

    // Create Folder Modal state & methods
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
  };
}
