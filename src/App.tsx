import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile, exists, copyFile, mkdir, readDir } from "@tauri-apps/plugin-fs";
import { listen } from "@tauri-apps/api/event";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  FileSearch,
  FileJson,
  FilePlus2,
  FileText,
  Folder,
  FolderOpen,
  Import,
  Loader2,
  PackageOpen,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  SquareArrowOutUpRight,
  Trash2,
  Upload,
  XCircle,
  Zap,
} from "lucide-react";
import "./App.css";

import { Button } from "./components/ui/button";
import { Card, CardContent } from "./components/ui/card";
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
import { Snippet, SnippetFile, FileTreeItem, ValidationError } from "./logic/types";
import { validate } from "./logic/validate";
import { generateYaml } from "./logic/generateYaml";
import { importYamlContent, ImportedMatch } from "./logic/importYaml";
import { buildSnippetTree } from "./logic/discoverSnippetFiles";
import {
  getIncludeFileCandidates,
  resolveAndExecuteIncludeFileCommand,
  resolveExistingIncludeFilePath,
} from "./logic/resolveIncludeFile";
import { EspansoConfigFile, EspansoPathSource, scanEspansoConfigFiles } from "./logic/espansoPaths";
import { setSetting, getSetting } from "./tauri/fileStore";
import { installAndRestart, InstallResult } from "./tauri/espansoRuntime";
import { cn } from "./lib/utils";

interface DragDropPayload {
  paths: string[];
  position: { x: number; y: number };
}

interface EspansoConfigPreview {
  config: EspansoConfigFile;
  snippetCount: number;
  inlineCount: number;
  resourceCount: number;
  warningCount: number;
  snippets: Snippet[];
  importedMatches: ImportedMatch[];
}

interface EspansoConfigPreviewTreeNode {
  name: string;
  path: string;
  isDir: boolean;
  snippetCount: number;
  fileCount: number;
  preview?: EspansoConfigPreview;
  children?: EspansoConfigPreviewTreeNode[];
}

interface SnippetDetailData {
  snippet: Snippet;
  file: string;
  index: number;
  sourceResourcePath?: string;
  sourceBaseDir?: string;
}

function App() {
  // Config & State
  const [repoPath, setRepoPath] = useState<string>("");
  const [fileTree, setFileTree] = useState<FileTreeItem[]>([]);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [selectedFile, setSelectedFile] = useState<string>(""); // Relative path from repo
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [selectedSnippetIndex, setSelectedSnippetIndex] = useState<number>(-1); // -1 = New snippet

  // Search
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchResults, setSearchResults] = useState<{ snippet: Snippet; file: string; index: number }[]>([]);

  // Form State
  const [editTrigger, setEditTrigger] = useState<string>("");
  const [editReplace, setEditReplace] = useState<string>("");
  const [editDescription, setEditDescription] = useState<string>("");
  const [editIncludeFile, setEditIncludeFile] = useState<string>("");
  const [useIncludeFile, setUseIncludeFile] = useState<boolean>(false);

  // Settings
  const [autoInstall, setAutoInstall] = useState<boolean>(true);
  const [backupDir, setBackupDir] = useState<string>("");

  // UI state
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [isConsoleOpen, setIsConsoleOpen] = useState<boolean>(false);
  const [consoleResult, setConsoleResult] = useState<InstallResult | null>(null);
  const [espansoMatchDir, setEspansoMatchDir] = useState<string>("");
  const [espansoPathSource, setEspansoPathSource] = useState<EspansoPathSource | "">("");
  const [espansoConfigs, setEspansoConfigs] = useState<EspansoConfigFile[]>([]);
  const [espansoConfigPreviews, setEspansoConfigPreviews] = useState<EspansoConfigPreview[]>([]);
  const [selectedEspansoConfigPath, setSelectedEspansoConfigPath] = useState<string>("");
  const [isScanningEspanso, setIsScanningEspanso] = useState<boolean>(false);
  const [isInitializingWorkspace, setIsInitializingWorkspace] = useState<boolean>(false);
  const [espansoScanMessage, setEspansoScanMessage] = useState<string>("");
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [detailSnippet, setDetailSnippet] = useState<SnippetDetailData | null>(null);

  // Importer state
  const [isImporterOpen, setIsImporterOpen] = useState<boolean>(false);
  const [importFilePath, setImportFilePath] = useState<string>("");
  const [importResult, setImportResult] = useState<{
    snippets: Snippet[];
    importedMatches: ImportedMatch[];
    warnings: string[];
    fileName: string;
  } | null>(null);

  // Create new file modal state
  const [isNewFileModalOpen, setIsNewFileModalOpen] = useState<boolean>(false);
  const [newFileName, setNewFileName] = useState<string>("");

  // Load Repo Path on startup
  useEffect(() => {
    async function loadSavedRepo() {
      const savedPath = await getSetting<string>("repoPath", "");
      const savedAuto = await getSetting<boolean>("autoInstall", true);
      const savedBackupDir = await getSetting<string>("backupDir", "");
      setAutoInstall(savedAuto);
      setBackupDir(savedBackupDir);

      if (savedPath) {
        // Verify snippets folder exists
        const hasSnippets = await exists(`${savedPath}/snippets`);
        if (hasSnippets) {
          setRepoPath(savedPath);
          refreshFileTree(savedPath);
        }
      }
    }
    loadSavedRepo();
    scanDefaultEspansoConfigDir();
  }, []);

  // Handle dropped file or folder path
  async function handleDroppedPath(path: string) {
    try {
      const isDirExists = await exists(path);
      if (!isDirExists) return;

      if (isSettingsOpen) {
        await saveBackupDir(path);
        return;
      }

      let resolvedRepoPath = "";
      const hasSubSnippets = await exists(`${path}/snippets`);
      if (hasSubSnippets) {
        resolvedRepoPath = path;
      } else {
        // Check if the dropped directory itself is named 'snippets'
        const isSnippetsFolder = path.replace(/[/\\]$/, "").endsWith("snippets");
        if (isSnippetsFolder) {
          const parts = path.replace(/[/\\]$/, "").split(/[/\\]/);
          parts.pop(); // Remove 'snippets' folder from path to get the repo root
          resolvedRepoPath = parts.join("/");
        }
      }

      if (resolvedRepoPath) {
        setRepoPath(resolvedRepoPath);
        await setSetting("repoPath", resolvedRepoPath);
        refreshFileTree(resolvedRepoPath);
      } else {
        // If it doesn't contain snippets, check if it's a legacy YAML to import
        if (repoPath) {
          const lowerPath = path.toLowerCase();
          if (lowerPath.endsWith(".yml") || lowerPath.endsWith(".yaml")) {
            await importYamlFileByPath(path);
          } else {
            alert("Please drop a directory named 'snippets' (or containing a 'snippets' folder) or a valid YAML config file.");
          }
        } else {
          alert("Please drop a directory named 'snippets' or a directory containing a 'snippets' folder to open workspace.");
        }
      }
    } catch (e) {
      alert(`Error handling dropped path: ${e}`);
    }
  }

  // Listen for file drag-and-drop events from Tauri
  useEffect(() => {
    let active = true;
    const unlisteners: (() => void)[] = [];

    async function setupDragDrop() {
      try {
        const uEnter = await listen<DragDropPayload>("tauri://drag-enter", () => {
          setIsDragging(true);
        });
        if (!active) { uEnter(); return; }
        unlisteners.push(uEnter);

        const uDrop = await listen<DragDropPayload>("tauri://drag-drop", async (event) => {
          setIsDragging(false);
          const paths = event.payload.paths;
          if (paths && paths.length > 0) {
            await handleDroppedPath(paths[0]);
          }
        });
        if (!active) { uDrop(); return; }
        unlisteners.push(uDrop);

        const uCancel = await listen("tauri://drag-cancelled", () => {
          setIsDragging(false);
        });
        if (!active) { uCancel(); return; }
        unlisteners.push(uCancel);
      } catch (err) {
        console.error("Failed to setup drag and drop listeners:", err);
      }
    }

    setupDragDrop();

    return () => {
      active = false;
      unlisteners.forEach((fn) => fn());
    };
  }, [repoPath, isSettingsOpen]);

  // Recalculate validation on form changes
  useEffect(() => {
    async function runValidation() {
      if (!selectedFile) return;

      const mockSnippets = [...snippets];
      const activeSnippet: Snippet = useIncludeFile
        ? { trigger: editTrigger, include_file: editIncludeFile, description: editDescription }
        : { trigger: editTrigger, replace: editReplace, description: editDescription };

      if (selectedSnippetIndex === -1) {
        mockSnippets.push(activeSnippet);
      } else {
        mockSnippets[selectedSnippetIndex] = activeSnippet;
      }

      const fileData = {
        version: 1,
        snippets: mockSnippets,
      };

      const checkFileExists = async (relPath: string) => {
        const candidates = getIncludeFileCandidates({
          includeFile: relPath,
          repoPath,
          currentSnippetFile: selectedFile,
        });

        for (const candidate of candidates) {
          try {
            if (await exists(candidate)) {
              return true;
            }
          } catch {
            // Try next candidate path
          }
        }

        return false;
      };

      const result = await validate(fileData, {
        snippetsDir: `${repoPath}/snippets`,
        checkFileExists,
      });

      setErrors(result.errors);
      setWarnings(result.warnings);
    }

    runValidation();
  }, [editTrigger, editReplace, editIncludeFile, editDescription, useIncludeFile, selectedSnippetIndex, snippets, selectedFile, repoPath]);

  // Handle Global Search
  useEffect(() => {
    if (!searchQuery.trim() || !repoPath) {
      setSearchResults([]);
      return;
    }

    async function searchAllFiles() {
      const results: { snippet: Snippet; file: string; index: number }[] = [];
      const query = searchQuery.toLowerCase();

      // We need to recursively scan all json files.
      // To keep it simple, we scan the fileTree list.
      async function scanNode(node: FileTreeItem) {
        if (node.isDir && node.children) {
          for (const child of node.children) {
            await scanNode(child);
          }
        } else if (!node.isDir) {
          try {
            const content = await readTextFile(`${repoPath}/snippets/${node.path}`);
            const data = JSON.parse(content) as SnippetFile;
            if (data && Array.isArray(data.snippets)) {
              data.snippets.forEach((snippet, index) => {
                const matchTrigger = snippet.trigger.toLowerCase().includes(query);
                const matchReplace = (snippet.replace || "").toLowerCase().includes(query);
                const matchDesc = (snippet.description || "").toLowerCase().includes(query);
                const matchInclude = (snippet.include_file || "").toLowerCase().includes(query);

                if (matchTrigger || matchReplace || matchDesc || matchInclude) {
                  results.push({
                    snippet,
                    file: node.path,
                    index,
                  });
                }
              });
            }
          } catch (e) {
            console.error(`Search failed to read ${node.path}`, e);
          }
        }
      }

      for (const node of fileTree) {
        await scanNode(node);
      }
      setSearchResults(results);
    }

    const delayDebounce = setTimeout(() => {
      searchAllFiles();
    }, 200);

    return () => clearTimeout(delayDebounce);
  }, [searchQuery, fileTree, repoPath]);

  // Refresh File Tree
  async function refreshFileTree(path: string): Promise<FileTreeItem[]> {
    const tree = await buildSnippetTree(`${path}/snippets`);
    setFileTree(tree);
    return tree;
  }

  function hasSnippetFiles(items: FileTreeItem[]): boolean {
    return items.some((item) => !item.isDir || hasSnippetFiles(item.children || []));
  }

  async function isWorkspaceEmpty(path: string): Promise<boolean> {
    const tree = await buildSnippetTree(`${path}/snippets`);
    return !hasSnippetFiles(tree);
  }

  async function ensureSnippetsDirectory(path: string) {
    const snippetsDir = `${path}/snippets`;
    if (!(await exists(snippetsDir))) {
      await mkdir(snippetsDir, { recursive: true });
    }
  }

  async function activateWorkspace(path: string) {
    await ensureSnippetsDirectory(path);
    setRepoPath(path);
    await setSetting("repoPath", path);
    await refreshFileTree(path);
  }

  async function ensureParentDirectory(filePath: string) {
    const parts = filePath.split("/");
    parts.pop();
    const parentPath = parts.join("/");
    if (parentPath) {
      await mkdir(parentPath, { recursive: true });
    }
  }

  function yamlConfigToJsonRelativePath(relativePath: string): string {
    return relativePath.replace(/\.ya?ml$/i, ".json");
  }

  function getContainingDirectory(filePath: string): string {
    const parts = filePath.split(/[/\\]/);
    parts.pop();
    return parts.join("/");
  }

  async function buildEspansoConfigPreviews(configs: EspansoConfigFile[]): Promise<EspansoConfigPreview[]> {
    const previews: EspansoConfigPreview[] = [];

    for (const config of configs) {
      try {
        const content = await readTextFile(config.path);
        const result = importYamlContent(content, config.name);
        const inlineCount = result.snippets.filter((snippet) => snippet.replace !== undefined).length;
        const resourceCount = result.snippets.filter((snippet) => snippet.include_file).length;

        previews.push({
          config,
          snippetCount: result.snippets.length,
          inlineCount,
          resourceCount,
          warningCount: result.warnings.length,
          snippets: result.snippets,
          importedMatches: result.importedMatches,
        });
      } catch {
        previews.push({
          config,
          snippetCount: 0,
          inlineCount: 0,
          resourceCount: 0,
          warningCount: 1,
          snippets: [],
          importedMatches: [],
        });
      }
    }

    return previews;
  }

  async function findReadableResourcePath(resourcePath: string, yamlFolder: string): Promise<{ path: string | null; warning?: string }> {
    const candidates = [resourcePath, `${yamlFolder}/${resourcePath}`];

    for (const candidate of candidates) {
      try {
        if (await exists(candidate)) {
          return { path: candidate };
        }
      } catch (e: any) {
        const message = e?.message || String(e);
        if (message.includes("forbidden path")) {
          return {
            path: null,
            warning: `Resource path is outside app file permissions and was not copied: ${candidate}`,
          };
        }

        return {
          path: null,
          warning: `Resource path could not be checked and was not copied: ${candidate} (${message})`,
        };
      }
    }

    return { path: null };
  }

  // Choose Repository Directory
  async function chooseRepo(): Promise<string | null> {
    const selected = await openDialog({
      directory: true,
      multiple: false,
      title: "Select Repository Directory",
    });

    if (selected && typeof selected === "string") {
      const hasSnippets = await exists(`${selected}/snippets`);
      if (hasSnippets) {
        setRepoPath(selected);
        await setSetting("repoPath", selected);
        refreshFileTree(selected);
        return selected;
      } else {
        alert("The selected directory does not contain a 'snippets' folder. Please select a valid workspace.");
      }
    }

    return null;
  }

  async function saveBackupDir(path: string) {
    if (!path) {
      setBackupDir("");
      await setSetting("backupDir", "");
      return;
    }

    try {
      await readDir(path);
      setBackupDir(path);
      await setSetting("backupDir", path);
    } catch (e) {
      alert("Please choose or drop a directory for backups.");
    }
  }

  async function chooseBackupDir(): Promise<string | null> {
    const selected = await openDialog({
      directory: true,
      multiple: false,
      title: "Select Backup Directory",
    });

    if (selected && typeof selected === "string") {
      await saveBackupDir(selected);
      return selected;
    }

    return null;
  }

  async function scanDefaultEspansoConfigDir() {
    setIsScanningEspanso(true);
    setEspansoScanMessage("");

    try {
      const result = await scanEspansoConfigFiles();
      const previews = await buildEspansoConfigPreviews(result.files);
      setEspansoMatchDir(result.matchDir);
      setEspansoPathSource(result.pathSource);
      setEspansoConfigs(result.files);
      setEspansoConfigPreviews(previews);
      setSelectedEspansoConfigPath((current) => {
        if (current && previews.some((preview) => preview.config.path === current)) {
          return current;
        }
        return previews[0]?.config.path || "";
      });
      setEspansoScanMessage(result.files.length === 0 ? "No YAML configs found in the default match directory." : "");
    } catch (e: any) {
      setEspansoConfigs([]);
      setEspansoConfigPreviews([]);
      setSelectedEspansoConfigPath("");
      const message = e.message || String(e);
      setEspansoScanMessage(
        message.includes("forbidden path")
          ? `Espanso path was resolved, but Tauri blocked file access. Add the Espanso match directory to the filesystem scope, then restart the app. (${message})`
          : `Could not scan the default Espanso match directory: ${message}`,
      );
    } finally {
      setIsScanningEspanso(false);
    }
  }

  async function importDetectedEspansoConfig(config: EspansoConfigFile) {
    let activeRepoPath = repoPath || backupDir;
    if (!activeRepoPath) {
      const selectedBackupDir = await chooseBackupDir();
      if (!selectedBackupDir) return;
      activeRepoPath = selectedBackupDir;
    }

    await ensureSnippetsDirectory(activeRepoPath);

    if (!(await isWorkspaceEmpty(activeRepoPath))) {
      alert("This import is only available while the Backup directory's snippets/ folder has no JSON configs. After initialization, that directory is the source of truth.");
      return;
    }

    await activateWorkspace(activeRepoPath);
    await importYamlFileByPath(config.path);
  }

  async function initializeWorkspaceFromEspanso() {
    if (isInitializingWorkspace) return;

    setIsInitializingWorkspace(true);

    try {
      let activeRepoPath = backupDir;
      if (!activeRepoPath) {
        const selectedBackupDir = await chooseBackupDir();
        if (!selectedBackupDir) return;
        activeRepoPath = selectedBackupDir;
      }

      await ensureSnippetsDirectory(activeRepoPath);

      if (!(await isWorkspaceEmpty(activeRepoPath))) {
        alert("Initialization is only available while the Backup directory's snippets/ folder has no JSON configs. That directory is already the source of truth.");
        return;
      }

      let configs = espansoConfigs;
      if (configs.length === 0) {
        const scanResult = await scanEspansoConfigFiles();
        const previews = await buildEspansoConfigPreviews(scanResult.files);
        setEspansoMatchDir(scanResult.matchDir);
        setEspansoPathSource(scanResult.pathSource);
        setEspansoConfigs(scanResult.files);
        setEspansoConfigPreviews(previews);
        setSelectedEspansoConfigPath(previews[0]?.config.path || "");
        configs = scanResult.files;
      }

      if (configs.length === 0) {
        alert("No Espanso YAML configs were found to initialize from.");
        return;
      }

      if (!confirm(`Initialize the empty Backup directory from ${configs.length} Espanso YAML config${configs.length === 1 ? "" : "s"}? This one-time import writes JSON under ${activeRepoPath}/snippets and keeps future changes flowing from JSON to Espanso only.`)) {
        return;
      }

      const warnings: string[] = [];
      let importedFileCount = 0;
      let importedSnippetCount = 0;
      let firstImportedJsonFile = "";

      for (const config of configs) {
        const content = await readTextFile(config.path);
        const result = importYamlContent(content, config.name);

        warnings.push(...result.warnings);
        if (result.snippets.length === 0) {
          continue;
        }

        const jsonRelativePath = yamlConfigToJsonRelativePath(config.relativePath);
        const targetJsonPath = `${activeRepoPath}/snippets/${jsonRelativePath}`;
        await ensureParentDirectory(targetJsonPath);

        const yamlFolder = getContainingDirectory(config.path);
        for (const m of result.importedMatches) {
          if (m.resourcePath && m.resourceName) {
            const resource = await findReadableResourcePath(m.resourcePath, yamlFolder);

            if (resource.path) {
              const dstPath = `${activeRepoPath}/snippets/${m.resourceName}`;
              await ensureParentDirectory(dstPath);
              try {
                await copyFile(resource.path, dstPath);
              } catch (e: any) {
                warnings.push(`[${config.name}] Resource file could not be copied: ${m.resourcePath} (${e?.message || e})`);
              }
            } else {
              warnings.push(`[${config.name}] ${resource.warning || `Resource file not found: ${m.resourcePath}`}`);
            }
          }
        }

        const configData: SnippetFile = {
          version: 1,
          snippets: result.snippets,
        };

        await writeTextFile(targetJsonPath, JSON.stringify(configData, null, 2));
        if (!firstImportedJsonFile) {
          firstImportedJsonFile = jsonRelativePath;
        }
        importedFileCount += 1;
        importedSnippetCount += result.snippets.length;
      }

      if (importedFileCount === 0) {
        alert(`No supported snippets were imported.${warnings.length ? `\n\n${warnings.slice(0, 5).join("\n")}` : ""}`);
        return;
      }

      await activateWorkspace(activeRepoPath);
      if (firstImportedJsonFile) {
        await loadSnippetFile(firstImportedJsonFile, activeRepoPath);
      }

      const warningSummary = warnings.length > 0 ? `\n\n${warnings.length} warning${warnings.length === 1 ? "" : "s"}. First warnings:\n${warnings.slice(0, 5).join("\n")}` : "";
      alert(`Initialized workspace from Espanso: ${importedFileCount} JSON config${importedFileCount === 1 ? "" : "s"}, ${importedSnippetCount} snippet${importedSnippetCount === 1 ? "" : "s"}.${warningSummary}`);
    } catch (e) {
      alert(`Initialization failed: ${e}`);
    } finally {
      setIsInitializingWorkspace(false);
    }
  }

  // Load a Snippet File
  async function loadSnippetFile(relPath: string, pathOverride?: string) {
    try {
      const activeRepoPath = pathOverride || repoPath;
      setSelectedFile(relPath);
      const filePath = `${activeRepoPath}/snippets/${relPath}`;
      const content = await readTextFile(filePath);
      const data = JSON.parse(content) as SnippetFile;

      setSnippets(data.snippets || []);
      // Select first snippet if available, else setup for new
      if (data.snippets && data.snippets.length > 0) {
        selectSnippet(data.snippets[0], 0);
      } else {
        setupForNewSnippet();
      }
      setSearchQuery(""); // Clear search query when changing files
    } catch (e) {
      alert(`Failed to load file: ${e}`);
    }
  }

  // Select Snippet to Edit
  function selectSnippet(snippet: Snippet, index: number) {
    setSelectedSnippetIndex(index);
    setEditTrigger(snippet.trigger);
    setEditDescription(snippet.description || "");
    if (snippet.include_file) {
      setUseIncludeFile(true);
      setEditIncludeFile(snippet.include_file);
      setEditReplace("");
    } else {
      setUseIncludeFile(false);
      setEditReplace(snippet.replace || "");
      setEditIncludeFile("");
    }
  }

  function showSnippetDetail(snippet: Snippet, file: string, index: number, source?: Pick<SnippetDetailData, "sourceResourcePath" | "sourceBaseDir">) {
    setDetailSnippet({ snippet, file, index, ...source });
  }

  function openSnippetDetail(snippet: Snippet, file: string, index: number) {
    selectSnippet(snippet, index);
    showSnippetDetail(snippet, file, index);
  }

  // Setup form for new Snippet
  function setupForNewSnippet() {
    setSelectedSnippetIndex(-1);
    setEditTrigger("");
    setEditReplace("");
    setEditDescription("");
    setEditIncludeFile("");
    setUseIncludeFile(false);
  }

  // Save current snippet (create or update)
  async function saveSnippet() {
    if (errors.length > 0) {
      alert("Please fix validation errors before saving.");
      return;
    }

    if (!selectedFile) return;

    const newSnippet: Snippet = useIncludeFile
      ? { trigger: editTrigger, include_file: editIncludeFile }
      : { trigger: editTrigger, replace: editReplace };

    if (editDescription) {
      newSnippet.description = editDescription;
    }

    const updatedSnippets = [...snippets];
    if (selectedSnippetIndex === -1) {
      updatedSnippets.push(newSnippet);
    } else {
      updatedSnippets[selectedSnippetIndex] = newSnippet;
    }

    const fileData: SnippetFile = {
      version: 1,
      snippets: updatedSnippets,
    };

    try {
      const filePath = `${repoPath}/snippets/${selectedFile}`;
      await writeTextFile(filePath, JSON.stringify(fileData, null, 2));

      setSnippets(updatedSnippets);
      if (selectedSnippetIndex === -1) {
        selectSnippet(newSnippet, updatedSnippets.length - 1);
      } else {
        selectSnippet(newSnippet, selectedSnippetIndex);
      }

      if (autoInstall) {
        await compileAllAndInstall();
      } else {
        alert("Snippet saved successfully!");
      }
    } catch (e) {
      alert(`Failed to save snippet: ${e}`);
    }
  }

  // Delete current snippet
  async function deleteSnippet() {
    if (selectedSnippetIndex === -1 || !selectedFile) return;

    if (!confirm("Are you sure you want to delete this snippet?")) return;

    const updatedSnippets = snippets.filter((_, i) => i !== selectedSnippetIndex);
    const fileData: SnippetFile = {
      version: 1,
      snippets: updatedSnippets,
    };

    try {
      const filePath = `${repoPath}/snippets/${selectedFile}`;
      await writeTextFile(filePath, JSON.stringify(fileData, null, 2));

      setSnippets(updatedSnippets);
      if (updatedSnippets.length > 0) {
        selectSnippet(updatedSnippets[0], 0);
      } else {
        setupForNewSnippet();
      }

      if (autoInstall) {
        await compileAllAndInstall();
      }
    } catch (e) {
      alert(`Failed to delete snippet: ${e}`);
    }
  }

  // Toggle Auto Install
  async function toggleAutoInstall() {
    const nextVal = !autoInstall;
    setAutoInstall(nextVal);
    await setSetting("autoInstall", nextVal);
  }

  // Create new JSON File
  async function handleCreateNewFile() {
    if (!newFileName.trim()) return;

    let sanitized = newFileName.trim();
    if (!sanitized.endsWith(".json")) {
      sanitized += ".json";
    }

    try {
      const filePath = `${repoPath}/snippets/${sanitized}`;
      const emptyContent: SnippetFile = {
        version: 1,
        snippets: [],
      };

      // Check if already exists
      const fileExists = await exists(filePath);
      if (fileExists) {
        alert("A file with this name already exists.");
        return;
      }

      // Ensure folders exist if user typed folder name
      const parts = sanitized.split("/");
      if (parts.length > 1) {
        parts.pop(); // Remove filename
        const folderPath = `${repoPath}/snippets/${parts.join("/")}`;
        await mkdir(folderPath, { recursive: true });
      }

      await writeTextFile(filePath, JSON.stringify(emptyContent, null, 2));
      setNewFileName("");
      setIsNewFileModalOpen(false);
      await refreshFileTree(repoPath);
      await loadSnippetFile(sanitized);
    } catch (e) {
      alert(`Failed to create file: ${e}`);
    }
  }

  // Compile all snippets and install to Espanso
  async function compileAllAndInstall() {
    if (!repoPath) return;

    setIsConsoleOpen(true);
    setConsoleResult(null);

    try {
      // 1. Gather all snippet files in the workspace
      const allSnippets: { snippet: Snippet; relFile: string }[] = [];

      async function scanTree(items: FileTreeItem[]) {
        for (const item of items) {
          if (item.isDir && item.children) {
            await scanTree(item.children);
          } else if (!item.isDir) {
            const content = await readTextFile(`${repoPath}/snippets/${item.path}`);
            const data = JSON.parse(content) as SnippetFile;
            if (data && Array.isArray(data.snippets)) {
              data.snippets.forEach((s) => {
                allSnippets.push({ snippet: s, relFile: item.path });
              });
            }
          }
        }
      }

      await scanTree(fileTree);

      if (allSnippets.length === 0) {
        setConsoleResult({
          success: false,
          message: "No snippets found to compile.",
        });
        return;
      }

      // 2. Resolve include_file paths per source JSON before generating YAML.
      const snippetsOnly = await Promise.all(allSnippets.map(async ({ snippet, relFile }) => {
        if (!snippet.include_file) {
          return snippet;
        }

        const resolvedPath = await resolveExistingIncludeFilePath(
          {
            includeFile: snippet.include_file,
            repoPath,
            currentSnippetFile: relFile,
          },
          exists,
        );

        return {
          ...snippet,
          include_file: resolvedPath || getIncludeFileCandidates({
            includeFile: snippet.include_file,
            repoPath,
            currentSnippetFile: relFile,
          })[0] || snippet.include_file,
        };
      }));

      // Generate the consolidated YAML
      // We will generate the base.yml output
      const yamlContent = generateYaml(snippetsOnly);

      // Write to local dist/base.yml first (Phase 2 requirement)
      const distDir = `${repoPath}/dist`;
      const distExists = await exists(distDir);
      if (!distExists) {
        await mkdir(distDir, { recursive: true });
      }
      await writeTextFile(`${distDir}/base.yml`, yamlContent);

      // 3. Install to Espanso & restart (Phase 3 requirement)
      const installRes = await installAndRestart(yamlContent, "base.yml", backupDir);
      setConsoleResult(installRes);
    } catch (e: any) {
      setConsoleResult({
        success: false,
        message: `Compilation failed: ${e.message || e}`,
      });
    }
  }

  // Import legacy YAML file by local file path
  async function importYamlFileByPath(filePath: string) {
    try {
      const content = await readTextFile(filePath);
      const parts = filePath.split(/[/\\]/);
      const fileName = parts[parts.length - 1];

      const result = importYamlContent(content, fileName);
      setImportFilePath(filePath);
      setImportResult({
        ...result,
        fileName,
      });
      setIsImporterOpen(true);
    } catch (e) {
      alert(`Failed to read YAML file: ${e}`);
    }
  }

  // Open Legacy Importer Dialogue
  async function selectYamlToImport() {
    const selected = await openDialog({
      directory: false,
      multiple: false,
      title: "Select Espanso YAML File to Import",
      filters: [{ name: "Espanso YAML", extensions: ["yml", "yaml"] }],
    });

    if (selected && typeof selected === "string") {
      await importYamlFileByPath(selected);
    }
  }

  // Confirm Import
  async function confirmImport() {
    if (!importResult || !repoPath) return;

    try {
      const baseName = importResult.fileName.replace(/\.ya?ml$/, "");
      const newJsonName = `${baseName}.json`;
      const targetJsonPath = `${repoPath}/snippets/${newJsonName}`;

      // Check if target file already exists
      const targetExists = await exists(targetJsonPath);
      if (targetExists) {
        if (!confirm(`File snippets/${newJsonName} already exists. Overwrite?`)) {
          return;
        }
      }

      // Copy resources if needed
      // Find directory of the source YAML file to search resources relative to it
      const parts = importFilePath.split(/[/\\]/);
      parts.pop();
      const yamlFolder = parts.join("/");

      for (const m of importResult.importedMatches) {
        if (m.resourcePath && m.resourceName) {
          const resource = await findReadableResourcePath(m.resourcePath, yamlFolder);

          if (resource.path) {
            const dstPath = `${repoPath}/snippets/${m.resourceName}`;
            await ensureParentDirectory(dstPath);
            try {
              await copyFile(resource.path, dstPath);
            } catch (e: any) {
              alert(`Resource file could not be copied: ${m.resourcePath} (${e?.message || e})`);
            }
          } else if (resource.warning) {
            alert(resource.warning);
          }
        }
      }

      // Write JSON config file
      const configData: SnippetFile = {
        version: 1,
        snippets: importResult.snippets,
      };

      await writeTextFile(targetJsonPath, JSON.stringify(configData, null, 2));

      setIsImporterOpen(false);
      setImportResult(null);
      setImportFilePath("");
      alert(`Import completed! Created snippets/${newJsonName}`);

      await refreshFileTree(repoPath);
      await loadSnippetFile(newJsonName);
    } catch (e) {
      alert(`Import failed: ${e}`);
    }
  }

  const currentFileName = selectedFile ? selectedFile.split("/").pop() : "";
  const espansoPreviewList = useMemo(
    () => espansoConfigPreviews.length > 0
      ? espansoConfigPreviews
      : espansoConfigs.map((config) => ({
        config,
        snippetCount: 0,
        inlineCount: 0,
        resourceCount: 0,
        warningCount: 0,
        snippets: [],
        importedMatches: [],
      })),
    [espansoConfigPreviews, espansoConfigs],
  );
  const espansoPreviewTotals = useMemo(
    () => espansoPreviewList.reduce(
      (total, preview) => ({
        snippets: total.snippets + preview.snippetCount,
        inline: total.inline + preview.inlineCount,
        resources: total.resources + preview.resourceCount,
        warnings: total.warnings + preview.warningCount,
      }),
      { snippets: 0, inline: 0, resources: 0, warnings: 0 },
    ),
    [espansoPreviewList],
  );
  const selectedEspansoPreview = useMemo(
    () => espansoPreviewList.find(
      (preview) => preview.config.path === selectedEspansoConfigPath,
    ) || espansoPreviewList[0],
    [espansoPreviewList, selectedEspansoConfigPath],
  );
  const espansoPreviewTree = useMemo(
    () => buildEspansoConfigPreviewTree(espansoPreviewList),
    [espansoPreviewList],
  );
  const activeEspansoAncestorPaths = useMemo(
    () => getEspansoConfigAncestorPaths(selectedEspansoPreview?.config.relativePath || ""),
    [selectedEspansoPreview],
  );
  const selectEspansoConfigPath = useCallback((path: string) => {
    setSelectedEspansoConfigPath(path);
  }, []);

  return (
    <div className="app-shell">
      {isDragging && (
        <div className="drag-overlay">
          <div className="drag-zone">
            <Upload className="mb-5 h-12 w-12" />
            <div className="text-xl font-semibold">
              {isSettingsOpen
                ? "Drop backup folder here"
                : !repoPath
                  ? "Drop snippets workspace folder here"
                  : "Drop workspace folder or YAML file here"}
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              {isSettingsOpen
                ? "This folder stores backup copies before installing to Espanso"
                : !repoPath
                  ? "Must contain a snippets folder"
                  : "Folders open a workspace; YAML files open the importer"}
            </div>
          </div>
        </div>
      )}

      {!repoPath && (
        <main className="flex h-full w-full overflow-hidden bg-[linear-gradient(180deg,hsl(var(--background))_0%,hsl(var(--secondary))_100%)] p-4">
          <Card className="flex h-full w-full flex-col p-4">
            <CardContent className="flex min-h-0 flex-1 flex-col p-0">
              <div className="grid grid-cols-2 gap-2">
                <Button className="w-full" onClick={chooseRepo}>
                  <FolderOpen />
                  Choose Folder
                </Button>
                <Button className="w-full" variant="outline" onClick={() => setIsSettingsOpen(true)}>
                  <Settings />
                  Settings
                </Button>
              </div>
              <div className="mt-3 flex min-h-0 flex-1 flex-col rounded-lg border bg-secondary/40 p-4 text-left">
                {espansoConfigs.length > 0 ? (
                  <div className="flex min-h-0 flex-1 flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-background p-3">
                      <div className="flex flex-wrap gap-3 text-sm">
                        <span className="font-semibold">{espansoConfigs.length} YAML files</span>
                        <span className="text-muted-foreground">{espansoPreviewTotals.snippets} readable snippets</span>
                        <span className="text-muted-foreground">{espansoPreviewTotals.inline} inline</span>
                        <span className="text-muted-foreground">{espansoPreviewTotals.resources} external files</span>
                        {espansoPreviewTotals.warnings > 0 && (
                          <span className="text-amber-700">{espansoPreviewTotals.warnings} warnings</span>
                        )}
                      </div>
                      <Button
                        size="sm"
                        onClick={initializeWorkspaceFromEspanso}
                        disabled={isInitializingWorkspace || isScanningEspanso}
                      >
                        {isInitializingWorkspace ? <Loader2 className="h-4 w-4 animate-spin" /> : <Import className="h-4 w-4" />}
                        Initialize Backup Directory
                      </Button>
                    </div>

                    <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden rounded-md border bg-background md:grid-cols-[18rem_1fr]">
                      <aside className="flex min-h-0 flex-col border-b bg-secondary/30 md:border-b-0 md:border-r">
                        <div className="flex h-10 shrink-0 items-center justify-between border-b px-3">
                          <h2 className="text-sm font-semibold">Collection</h2>
                          <span className="text-xs text-muted-foreground">{espansoPreviewList.length}</span>
                        </div>
                        <ScrollArea className="min-h-0 flex-1">
                          <div className="space-y-1 p-2">
                            {espansoPreviewTree.map((node) => (
                              <EspansoConfigTreeNode
                                key={node.path}
                                node={node}
                                activePath={selectedEspansoPreview?.config.path || selectedEspansoConfigPath}
                                activeAncestorPaths={activeEspansoAncestorPaths}
                                onSelect={selectEspansoConfigPath}
                              />
                            ))}
                          </div>
                        </ScrollArea>
                      </aside>

                      <section className="flex min-h-0 min-w-0 flex-col">
                        {selectedEspansoPreview ? (
                          <EspansoConfigDetail
                            preview={selectedEspansoPreview}
                            onImport={() => importDetectedEspansoConfig(selectedEspansoPreview.config)}
                            onViewSnippet={(match, index) =>
                              showSnippetDetail(match.snippet, selectedEspansoPreview.config.relativePath, index, {
                                sourceResourcePath: match.resourcePath,
                                sourceBaseDir: getContainingDirectory(selectedEspansoPreview.config.path),
                              })
                            }
                          />
                        ) : (
                          <EmptyState
                            icon={FileText}
                            title="No config selected"
                            description="Select a YAML config from the collection list to preview its snippets."
                          />
                        )}
                      </section>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    <p className="text-sm text-muted-foreground">
                      {isScanningEspanso ? "Scanning Espanso configs..." : espansoScanMessage || "Scanning starts automatically."}
                    </p>
                    {!isScanningEspanso && (
                      <Button
                        className="w-full"
                        variant="outline"
                        onClick={initializeWorkspaceFromEspanso}
                        disabled={isInitializingWorkspace}
                      >
                        {isInitializingWorkspace ? <Loader2 className="h-4 w-4 animate-spin" /> : <Import className="h-4 w-4" />}
                        Initialize Backup Directory
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </main>
      )}

      {repoPath && (
        <>
          <aside className="flex h-full w-72 shrink-0 flex-col border-r bg-card">
            <div className="space-y-4 border-b p-4">
              <div>
                <h1 className="text-base font-semibold">Snippet Manager</h1>
                <button
                  className="mt-2 flex w-full items-center gap-2 rounded-md border bg-background px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  onClick={chooseRepo}
                  title="Click to change workspace folder"
                >
                  <FolderOpen className="h-4 w-4 shrink-0" />
                  <span className="truncate">{repoPath.split("/").pop()}</span>
                </button>
              </div>
              <Button variant="outline" className="w-full justify-start" onClick={() => setIsNewFileModalOpen(true)}>
                <FilePlus2 />
                New JSON Config
              </Button>
            </div>

            <ScrollArea className="min-h-0 flex-1 p-3">
              <div className="space-y-1">
                {fileTree.map((node) => (
                  <FileTreeNode key={node.path} node={node} activePath={selectedFile} onSelect={loadSnippetFile} />
                ))}
                {fileTree.length === 0 && (
                  <div className="space-y-3 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    <div className="text-center">
                      <div className="font-medium text-foreground">No JSON configs in snippets/</div>
                      <p className="mt-1 text-xs">
                        Initialize the configured Backup directory once from your existing Espanso YAML configs.
                      </p>
                    </div>
                    <Button
                      className="w-full"
                      size="sm"
                      variant="outline"
                      onClick={initializeWorkspaceFromEspanso}
                      disabled={isInitializingWorkspace || isScanningEspanso}
                    >
                      {isInitializingWorkspace ? <Loader2 className="h-4 w-4 animate-spin" /> : <Import className="h-4 w-4" />}
                      Initialize Backup Directory
                    </Button>
                  </div>
                )}
              </div>
            </ScrollArea>

            <div className="border-t p-4">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="auto-install" className="text-sm">
                  Auto install on save
                </Label>
                <Switch id="auto-install" checked={autoInstall} onCheckedChange={toggleAutoInstall} />
              </div>
            </div>
          </aside>

          <main className="flex min-w-0 flex-1 flex-col">
            <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b bg-background px-5">
              <div className="relative max-w-md flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search trigger, replace, description..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => setIsSettingsOpen(true)} title="Settings">
                  <Settings />
                  Settings
                </Button>
                <Button variant="outline" onClick={selectYamlToImport}>
                  <Import />
                  Import YAML
                </Button>
                <Button onClick={compileAllAndInstall}>
                  <Zap />
                  Build & Install
                </Button>
              </div>
            </header>

            <div className="flex min-h-0 flex-1">
              <section className="flex w-80 shrink-0 flex-col border-r bg-secondary/30">
                <div className="flex h-14 items-center justify-between border-b px-4">
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold">
                      {searchQuery ? "Search Results" : currentFileName || "No File Loaded"}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {searchQuery ? `${searchResults.length} matches` : selectedFile ? `${snippets.length} snippets` : "Choose a file"}
                    </p>
                  </div>
                  {selectedFile && !searchQuery && (
                    <Button size="sm" variant="outline" onClick={setupForNewSnippet}>
                      <Plus />
                      Add
                    </Button>
                  )}
                </div>

                <ScrollArea className="min-h-0 flex-1 p-3">
                  <div className="space-y-2">
                    {searchQuery &&
                      searchResults.map((res, i) => (
                        <div
                          key={`search-${i}`}
                          className="flex w-full items-start gap-2 rounded-lg border bg-card p-2 shadow-sm transition-colors hover:bg-accent"
                        >
                          <button
                            className="min-w-0 flex-1 p-1 text-left"
                            onClick={async () => {
                              await loadSnippetFile(res.file);
                              selectSnippet(res.snippet, res.index);
                            }}
                          >
                            <SnippetPreview snippet={res.snippet} />
                            <div className="mt-2 truncate text-xs text-primary">in {res.file}</div>
                          </button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="mt-0.5 shrink-0"
                            title="View snippet details"
                            aria-label={`View details for ${res.snippet.trigger || "snippet"}`}
                            onClick={async () => {
                              await loadSnippetFile(res.file);
                              openSnippetDetail(res.snippet, res.file, res.index);
                            }}
                          >
                            <SquareArrowOutUpRight />
                          </Button>
                        </div>
                      ))}

                    {!searchQuery &&
                      selectedFile &&
                      snippets.map((snippet, index) => (
                        <div
                          key={`${snippet.trigger}-${index}`}
                          className={cn(
                            "flex w-full items-start gap-2 rounded-lg border bg-card p-2 shadow-sm transition-colors hover:bg-accent",
                            selectedSnippetIndex === index && "border-primary bg-primary/5 ring-1 ring-primary/25",
                          )}
                        >
                          <button className="min-w-0 flex-1 p-1 text-left" onClick={() => selectSnippet(snippet, index)}>
                            <SnippetPreview snippet={snippet} />
                          </button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="mt-0.5 shrink-0"
                            title="View snippet details"
                            aria-label={`View details for ${snippet.trigger || "snippet"}`}
                            onClick={() => openSnippetDetail(snippet, selectedFile, index)}
                          >
                            <SquareArrowOutUpRight />
                          </Button>
                        </div>
                      ))}

                    {((!selectedFile && !searchQuery) || (searchQuery && searchResults.length === 0)) && (
                      <EmptyState
                        icon={searchQuery ? Search : FileJson}
                        title={searchQuery ? "No matches found" : "No file loaded"}
                        description={
                          searchQuery
                            ? "Try another trigger, replacement, description, or include file path."
                            : "Select a JSON config file from the sidebar to start editing."
                        }
                      />
                    )}
                  </div>
                </ScrollArea>
              </section>

              <section className="min-w-0 flex-1 overflow-hidden">
                {selectedFile ? (
                  <ScrollArea className="h-full">
                    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
                      <div>
                        <h2 className="text-xl font-semibold">
                          {selectedSnippetIndex === -1 ? "New Snippet" : `Edit Snippet #${selectedSnippetIndex + 1}`}
                        </h2>
                        <p className="mt-1 text-sm text-muted-foreground">{selectedFile}</p>
                      </div>

                      {(errors.length > 0 || warnings.length > 0) && (
                        <div
                          className={cn(
                            "space-y-2 rounded-lg border p-4 text-sm",
                            errors.length > 0
                              ? "border-destructive/30 bg-destructive/10 text-destructive"
                              : "border-amber-300 bg-amber-50 text-amber-800",
                          )}
                        >
                          {errors.map((e, idx) => (
                            <div key={`err-${idx}`} className="flex gap-2">
                              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                              <span>{e.message}</span>
                            </div>
                          ))}
                          {warnings.map((w, idx) => (
                            <div key={`warn-${idx}`} className="flex gap-2">
                              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                              <span>{w}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      <Card>
                        <CardContent className="space-y-5 p-5">
                          <div className="space-y-2">
                            <Label htmlFor="trigger">Trigger</Label>
                            <Input
                              id="trigger"
                              className="mono-field"
                              placeholder="e.g. :hello"
                              value={editTrigger}
                              onChange={(e) => setEditTrigger(e.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">
                              The keyword that expands into the snippet, usually starting with a colon.
                            </p>
                          </div>

                          <div className="flex items-center justify-between rounded-lg border bg-secondary/40 p-3">
                            <div>
                              <Label htmlFor="include-file">Use external resource file</Label>
                              <p className="mt-1 text-xs text-muted-foreground">Store replacement content in include_file.</p>
                            </div>
                            <Switch id="include-file" checked={useIncludeFile} onCheckedChange={setUseIncludeFile} />
                          </div>

                          {useIncludeFile ? (
                            <div className="space-y-2">
                              <Label htmlFor="include-path">Include File Path</Label>
                              <Input
                                id="include-path"
                                className="mono-field"
                                placeholder="e.g. templates/message.txt"
                                value={editIncludeFile}
                                onChange={(e) => setEditIncludeFile(e.target.value)}
                              />
                              <p className="text-xs text-muted-foreground">Relative to the current snippet file folder.</p>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <Label htmlFor="replace">Replace Content</Label>
                              <Textarea
                                id="replace"
                                className="mono-field min-h-48 resize-y"
                                placeholder="What to expand trigger into..."
                                value={editReplace}
                                onChange={(e) => setEditReplace(e.target.value)}
                              />
                            </div>
                          )}

                          <div className="space-y-2">
                            <Label htmlFor="description">Description</Label>
                            <Input
                              id="description"
                              placeholder="A brief note about what this snippet does..."
                              value={editDescription}
                              onChange={(e) => setEditDescription(e.target.value)}
                            />
                          </div>

                          <div className="flex flex-wrap gap-2 pt-2">
                            <Button onClick={saveSnippet}>
                              <Save />
                              Save Snippet
                            </Button>
                            {selectedSnippetIndex !== -1 && (
                              <Button variant="destructive" onClick={deleteSnippet}>
                                <Trash2 />
                                Delete Snippet
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </ScrollArea>
                ) : (
                  <EmptyState
                    icon={PackageOpen}
                    title="No file loaded"
                    description="Select a config JSON file or create a new one to begin editing snippets."
                  />
                )}
              </section>
            </div>
          </main>
        </>
      )}

      <Dialog open={detailSnippet !== null} onOpenChange={(open) => !open && setDetailSnippet(null)}>
        <DialogContent className="max-h-[calc(100vh-2rem)] max-w-3xl overflow-hidden">
          {detailSnippet && <SnippetDetail detail={detailSnippet} repoPath={repoPath} />}
        </DialogContent>
      </Dialog>

      <Dialog open={isNewFileModalOpen} onOpenChange={setIsNewFileModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Snippet JSON File</DialogTitle>
            <DialogDescription>Nested folders are created automatically. The .json extension is added if missing.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="new-file">File path relative to snippets/</Label>
            <Input
              id="new-file"
              placeholder="e.g. personal/shortcuts.json"
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateNewFile();
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewFileModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateNewFile}>Create File</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Directory Settings</DialogTitle>
            <DialogDescription>Espanso is the live output directory. Backups are stored separately when configured.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border bg-secondary/40 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-background text-primary">
                  {isScanningEspanso ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileSearch className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <Label className="text-sm font-semibold">Espanso config scan</Label>
                    <Button size="sm" variant="outline" onClick={scanDefaultEspansoConfigDir} disabled={isScanningEspanso}>
                      {isScanningEspanso ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                      Scan
                    </Button>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {espansoMatchDir || "Default match directory"}
                  </p>
                  {espansoPathSource && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {espansoPathSource === "cli" ? "Resolved with espanso path" : "Using platform default path"}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <button
              className="flex w-full items-center gap-3 rounded-lg border-2 border-dashed bg-background p-4 text-left transition-colors hover:bg-secondary"
              onClick={chooseBackupDir}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary text-primary">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <Label>Backup directory</Label>
                <p className="mt-1 truncate text-sm text-muted-foreground">
                  {backupDir || "Drop a folder here or click to choose one."}
                </p>
              </div>
              <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>

            <div className="rounded-lg border bg-secondary/40 p-4">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="settings-auto-install" className="text-sm">
                  Auto install on save
                </Label>
                <Switch id="settings-auto-install" checked={autoInstall} onCheckedChange={toggleAutoInstall} />
              </div>
            </div>
          </div>
          <DialogFooter>
            {backupDir && (
              <Button variant="outline" onClick={() => saveBackupDir("")}>
                Clear Backup Folder
              </Button>
            )}
            <Button onClick={() => setIsSettingsOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isImporterOpen} onOpenChange={setIsImporterOpen}>
        <DialogContent>
          {importResult && (
            <>
              <DialogHeader>
                <DialogTitle>Import Legacy YAML</DialogTitle>
                <DialogDescription>{importResult.fileName}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="rounded-lg border bg-secondary/40 p-4 text-sm">
                  Found <span className="font-semibold">{importResult.snippets.length}</span> valid snippets.
                </div>
                {importResult.warnings.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-amber-700">Skipped items and warnings</Label>
                    <ScrollArea className="max-h-40 rounded-md border bg-background p-3">
                      <div className="space-y-2 text-sm text-amber-700">
                        {importResult.warnings.map((w, i) => (
                          <div key={i} className="flex gap-2">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>{w}</span>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}
                <p className="text-sm text-muted-foreground">
                  This creates <span className="font-medium text-foreground">snippets/{importResult.fileName.replace(/\.ya?ml$/, ".json")}</span> and
                  copies associated external resources.
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsImporterOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={confirmImport}>Import Snippets</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isConsoleOpen} onOpenChange={setIsConsoleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Build & Installation Status</DialogTitle>
            <DialogDescription>Compiles all JSON snippets into Espanso YAML and installs base.yml.</DialogDescription>
          </DialogHeader>
          {!consoleResult ? (
            <div className="flex items-center gap-3 rounded-lg border bg-secondary/40 p-4 text-sm">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span>Compiling JSON snippets into YAML matches...</span>
            </div>
          ) : (
            <div className="space-y-4">
              <div
                className={cn(
                  "flex items-center gap-2 rounded-lg border p-4 text-sm font-medium",
                  consoleResult.success
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-destructive/30 bg-destructive/10 text-destructive",
                )}
              >
                {consoleResult.success ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
                {consoleResult.success ? "Success" : "Failed"}
              </div>
              <p className="text-sm text-muted-foreground">{consoleResult.message}</p>
              {(consoleResult.stdout || consoleResult.stderr) && (
                <div className="space-y-2">
                  <Label>Shell logs</Label>
                  <ScrollArea className="max-h-56 rounded-md border bg-slate-950 p-3">
                    <pre className="whitespace-pre-wrap text-xs text-slate-200">
                      {consoleResult.stdout}
                      {consoleResult.stderr}
                    </pre>
                  </ScrollArea>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsConsoleOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function buildEspansoConfigPreviewTree(previews: EspansoConfigPreview[]): EspansoConfigPreviewTreeNode[] {
  const root: EspansoConfigPreviewTreeNode[] = [];

  function getOrCreateDir(
    nodes: EspansoConfigPreviewTreeNode[],
    name: string,
    path: string,
  ): EspansoConfigPreviewTreeNode {
    let dir = nodes.find((node) => node.isDir && node.name === name);
    if (!dir) {
      dir = {
        name,
        path,
        isDir: true,
        snippetCount: 0,
        fileCount: 0,
        children: [],
      };
      nodes.push(dir);
    }
    return dir;
  }

  for (const preview of previews) {
    const parts = preview.config.relativePath.split("/").filter(Boolean);
    let currentNodes = root;
    let currentPath = "";

    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index];
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isFile = index === parts.length - 1;

      if (isFile) {
        currentNodes.push({
          name: part,
          path: preview.config.path,
          isDir: false,
          snippetCount: preview.snippetCount,
          fileCount: 1,
          preview,
        });
      } else {
        const dir = getOrCreateDir(currentNodes, part, currentPath);
        dir.snippetCount += preview.snippetCount;
        dir.fileCount += 1;
        currentNodes = dir.children || [];
      }
    }
  }

  function sortNodes(nodes: EspansoConfigPreviewTreeNode[]) {
    nodes.sort((a, b) => {
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach((node) => {
      if (node.children) {
        sortNodes(node.children);
      }
    });
  }

  sortNodes(root);
  return root;
}

function getEspansoConfigAncestorPaths(relativePath: string): Set<string> {
  const ancestors = new Set<string>();
  const parts = relativePath.split("/").filter(Boolean);
  let currentPath = "";

  for (let index = 0; index < parts.length - 1; index += 1) {
    currentPath = currentPath ? `${currentPath}/${parts[index]}` : parts[index];
    ancestors.add(currentPath);
  }

  return ancestors;
}

interface EspansoConfigTreeNodeProps {
  node: EspansoConfigPreviewTreeNode;
  activePath: string;
  activeAncestorPaths: Set<string>;
  onSelect: (path: string) => void;
}

const EspansoConfigTreeNode = memo(function EspansoConfigTreeNode({
  node,
  activePath,
  activeAncestorPaths,
  onSelect,
}: EspansoConfigTreeNodeProps) {
  const containsActive = activeAncestorPaths.has(node.path);
  const [isOpen, setIsOpen] = useState<boolean>(false);

  if (node.isDir) {
    return (
      <div>
        <button
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            containsActive && "text-foreground",
          )}
          onClick={() => setIsOpen(!isOpen)}
        >
          {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
          {isOpen ? <FolderOpen className="h-4 w-4 shrink-0" /> : <Folder className="h-4 w-4 shrink-0" />}
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{node.name}</div>
          </div>
        </button>
        {isOpen && node.children && (
          <div className="ml-4 mt-1 space-y-1 border-l pl-2">
            {node.children.map((child) => (
              <EspansoConfigTreeNode
                key={child.path}
                node={child}
                activePath={activePath}
                activeAncestorPaths={activeAncestorPaths}
                onSelect={onSelect}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const isActive = node.preview?.config.path === activePath;

  return (
    <button
      className={cn(
        "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-accent",
        isActive && "bg-primary text-primary-foreground hover:bg-primary/90",
      )}
      onClick={() => node.preview && onSelect(node.preview.config.path)}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-background/80 text-primary">
        <FileText className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{node.name.replace(/\.ya?ml$/i, "")}</div>
      </div>
    </button>
  );
});

// Sidebar File Tree Node helper component
interface TreeNodeProps {
  node: FileTreeItem;
  activePath: string;
  onSelect: (path: string) => void;
}

function FileTreeNode({ node, activePath, onSelect }: TreeNodeProps) {
  const [isOpen, setIsOpen] = useState<boolean>(true);

  if (node.isDir) {
    return (
      <div>
        <button
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          onClick={() => setIsOpen(!isOpen)}
        >
          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <Folder className="h-4 w-4" />
          <span className="truncate">{node.name}</span>
        </button>
        {isOpen && node.children && (
          <div className="ml-4 mt-1 space-y-1 border-l pl-2">
            {node.children.map((child) => (
              <FileTreeNode key={child.path} node={child} activePath={activePath} onSelect={onSelect} />
            ))}
          </div>
        )}
      </div>
    );
  }

  const isActive = activePath === node.path;
  return (
    <button
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-secondary",
        isActive && "bg-primary text-primary-foreground hover:bg-primary/90",
      )}
      onClick={() => onSelect(node.path)}
    >
      <FileJson className="h-4 w-4 shrink-0" />
      <span className="truncate">{node.name.replace(".json", "")}</span>
    </button>
  );
}

interface SnippetPreviewProps {
  snippet: Snippet;
}

interface SnippetDetailProps {
  detail: SnippetDetailData;
  repoPath?: string;
}

interface EspansoConfigDetailProps {
  preview: EspansoConfigPreview;
  onImport: () => void;
  onViewSnippet: (match: ImportedMatch, index: number) => void;
}

function EspansoConfigDetail({ preview, onImport, onViewSnippet }: EspansoConfigDetailProps) {
  const ROW_HEIGHT = 36;
  const OVERSCAN_ROWS = 8;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const snippetCount = preview.snippets.length;
  const totalHeight = snippetCount * ROW_HEIGHT;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN_ROWS);
  const visibleRowCount = Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN_ROWS * 2;
  const endIndex = Math.min(snippetCount, startIndex + visibleRowCount);
  const visibleSnippets = preview.snippets.slice(startIndex, endIndex);

  useLayoutEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport) return;

    const updateViewportHeight = () => {
      setViewportHeight(viewport.clientHeight);
    };

    updateViewportHeight();
    const resizeObserver = new ResizeObserver(updateViewportHeight);
    resizeObserver.observe(viewport);

    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    setScrollTop(0);
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [preview.config.path]);

  return (
    <>
      <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">{preview.config.relativePath}</h2>
          <p className="mt-1 truncate text-xs text-muted-foreground">{preview.config.path}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {preview.warningCount > 0 && (
            <span className="rounded-md bg-amber-100 px-2 py-1 text-xs text-amber-800">
              {preview.warningCount} warnings
            </span>
          )}
          <Button size="sm" variant="outline" onClick={onImport}>
            <Import className="h-4 w-4" />
            Import
          </Button>
        </div>
      </div>

      <div className="grid h-9 shrink-0 grid-cols-[minmax(8rem,1.1fr)_3rem_minmax(6rem,0.65fr)_minmax(12rem,2fr)_2.25rem] items-center border-b bg-secondary/40 px-3 text-xs font-semibold text-muted-foreground">
        <div className="truncate">Name</div>
        <div className="truncate text-center">A→</div>
        <div className="truncate">Keyword</div>
        <div className="truncate">Snippet</div>
        <div className="sr-only">Details</div>
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-auto"
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      >
        {preview.snippets.length > 0 ? (
          <div className="relative divide-y" style={{ height: totalHeight }}>
            <div
              className="absolute inset-x-0 top-0 divide-y"
              style={{ transform: `translateY(${startIndex * ROW_HEIGHT}px)` }}
            >
              {visibleSnippets.map((snippet, offset) => {
                const index = startIndex + offset;

                return (
                  <button
                    key={`${snippet.trigger}-${index}`}
                    className="grid h-9 w-full grid-cols-[minmax(8rem,1.1fr)_3rem_minmax(6rem,0.65fr)_minmax(12rem,2fr)_2.25rem] items-center px-3 text-left text-sm transition-colors hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    onClick={() => onViewSnippet(preview.importedMatches[index] || { snippet }, index)}
                    title={`View details for ${snippet.trigger || `Snippet ${index + 1}`}`}
                  >
                    <div className="min-w-0 pr-3">
                      <div className="truncate font-medium">
                        {snippet.description || snippet.trigger || `Snippet ${index + 1}`}
                      </div>
                    </div>
                    <div className="flex justify-center">
                      <span
                        className={cn(
                          "h-4 w-4 rounded",
                          snippet.include_file ? "bg-primary/70" : "bg-muted-foreground/35",
                        )}
                        title={snippet.include_file ? "External file snippet" : "Inline replacement snippet"}
                      />
                    </div>
                    <div className="mono-field min-w-0 truncate pr-3 text-sm">{snippet.trigger}</div>
                    <div className="min-w-0 truncate text-muted-foreground">
                      {snippet.include_file ? `include: ${snippet.include_file}` : snippet.replace || "Empty replacement"}
                    </div>
                    <div className="flex justify-end text-muted-foreground">
                      <SquareArrowOutUpRight className="h-4 w-4" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <EmptyState
            icon={FileText}
            title="No supported snippets"
            description="This YAML file was found, but no supported Espanso matches could be previewed."
          />
        )}
      </div>
    </>
  );
}

function SnippetPreview({ snippet }: SnippetPreviewProps) {
  return (
    <div className="space-y-1">
      <div className="mono-field truncate text-sm font-semibold text-primary">{snippet.trigger || "Untitled trigger"}</div>
      <div className="flex items-start gap-2 text-xs text-muted-foreground">
        {snippet.include_file && <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
        <span className="line-clamp-2">
          {snippet.include_file ? `include: ${snippet.include_file}` : snippet.replace || "Empty replacement"}
        </span>
      </div>
      {snippet.description && <div className="truncate text-xs text-muted-foreground/80">{snippet.description}</div>}
    </div>
  );
}

function SnippetDetail({ detail, repoPath }: SnippetDetailProps) {
  const { snippet, file, index, sourceResourcePath, sourceBaseDir } = detail;
  const isExternalFile = Boolean(snippet.include_file);
  const content = isExternalFile ? snippet.include_file || "" : snippet.replace || "";

  const [dynamicContent, setDynamicContent] = useState<string | null>(null);
  const [resolvedPath, setResolvedPath] = useState<string | null>(null);
  const [executedCmd, setExecutedCmd] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadIncludeFileContent = useCallback(async () => {
    if (!isExternalFile || !snippet.include_file) return;

    setLoading(true);
    setError(null);
    setDynamicContent(null);
    setResolvedPath(null);
    setExecutedCmd(null);
    try {
      const res = await resolveAndExecuteIncludeFileCommand(
        {
          includeFile: sourceResourcePath || snippet.include_file,
          baseDir: sourceBaseDir,
          repoPath: sourceResourcePath ? undefined : repoPath,
          currentSnippetFile: file,
        },
        exists,
        async (cmd: string) => {
          return await invoke<string>("execute_shell_cmd", { cmd });
        },
        readTextFile
      );

      setResolvedPath(res.resolvedPath || null);
      setExecutedCmd(res.command || null);

      if (res.found && res.content !== undefined) {
        setDynamicContent(res.content);
      } else {
        setError(res.error || "Command execution returned empty output or failed");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to execute shell command");
    } finally {
      setLoading(false);
    }
  }, [isExternalFile, snippet.include_file, sourceResourcePath, sourceBaseDir, repoPath, file]);

  useEffect(() => {
    loadIncludeFileContent();
  }, [loadIncludeFileContent]);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <DialogHeader className="pr-8">
        <DialogTitle className="mono-field break-all text-primary">{snippet.trigger || "Untitled trigger"}</DialogTitle>
        <DialogDescription className="break-all">
          {file} · Snippet #{index + 1}
        </DialogDescription>
      </DialogHeader>

      <div className="min-h-0 space-y-4 overflow-auto pr-1">
        {snippet.description && (
          <div className="space-y-1">
            <Label>Description</Label>
            <p className="rounded-md border bg-secondary/30 p-3 text-sm text-foreground">{snippet.description}</p>
          </div>
        )}

        <div className="space-y-1">
          <Label>{isExternalFile ? "Include File Path" : "Replacement"}</Label>
          <div className="rounded-md border bg-secondary/30">
            <div className="flex items-center justify-between border-b px-3 py-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                {isExternalFile ? <FileText className="h-4 w-4 text-primary" /> : <SquareArrowOutUpRight className="h-4 w-4" />}
                <span>{isExternalFile ? "Configured resource file" : "Inline text content"}</span>
              </div>
              {isExternalFile && resolvedPath && (
                <span className="mono-field truncate max-w-[320px] text-[11px] text-muted-foreground/80" title={resolvedPath}>
                  {resolvedPath}
                </span>
              )}
            </div>
            <pre className="mono-field max-h-[16vh] overflow-auto whitespace-pre-wrap break-words p-3 text-sm leading-relaxed text-foreground">
              {content || (isExternalFile ? "No include_file set" : "Empty replacement")}
            </pre>
          </div>
        </div>

        {isExternalFile && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="flex items-center gap-1.5 text-primary font-medium">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Dynamically Injected Content (via Shell Command)</span>
                </Label>
                {executedCmd && (
                  <p className="mono-field text-[11px] text-muted-foreground">
                    Executed: <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">{executedCmd}</code>
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {loading && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Executing cmd...
                  </span>
                )}
                {!loading && dynamicContent !== null && (
                  <span className="text-[11px] text-emerald-500 font-mono bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    Command Output ({dynamicContent.split("\n").length} lines, {new Blob([dynamicContent]).size} B)
                  </span>
                )}
                {!loading && error && (
                  <span className="text-[11px] text-destructive font-mono bg-destructive/10 px-2 py-0.5 rounded border border-destructive/20">
                    {error}
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={loadIncludeFileContent}
                  disabled={loading}
                  title="Re-execute command"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                </Button>
                {dynamicContent !== null && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2.5 text-xs gap-1"
                    onClick={() => copyToClipboard(dynamicContent)}
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{copied ? "Copied" : "Copy"}</span>
                  </Button>
                )}
              </div>
            </div>

            <div className="rounded-md border bg-slate-950/90 text-slate-100 dark:bg-slate-950 dark:text-slate-100 shadow-inner">
              {loading ? (
                <div className="flex items-center justify-center p-8 text-xs text-slate-400">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin text-primary" />
                  Executing Shell command: {executedCmd || "..."}...
                </div>
              ) : error ? (
                <div className="p-4 text-xs text-rose-400 space-y-1">
                  <p className="font-semibold">Shell Command Execution Failed</p>
                  <p className="text-slate-400 font-mono text-[11px]">{error}</p>
                </div>
              ) : (
                <pre className="mono-field max-h-[42vh] overflow-auto whitespace-pre-wrap break-words p-3.5 text-xs leading-relaxed font-mono">
                  {dynamicContent || <span className="italic text-slate-500">(Command returned empty output)</span>}
                </pre>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface EmptyStateProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}

function EmptyState({ icon: Icon, title, description }: EmptyStateProps) {
  return (
    <div className="flex h-full min-h-56 flex-col items-center justify-center p-6 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg border bg-card text-muted-foreground">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export default App;
