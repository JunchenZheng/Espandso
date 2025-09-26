import { memo, type CSSProperties, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { mkdir, readFile, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { listen } from "@tauri-apps/api/event";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import {
  AlertTriangle,
  AlignLeft,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Columns,
  Copy,
  FileCode,
  FilePlus,
  FileSearch,
  FileText,
  FlaskConical,
  Folder,
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
  SquareArrowOutUpRight,
  Terminal,
  Trash2,
  Type,
  Upload,
  X,
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
import { SearchDialog } from "./components/SearchDialog";
import { startSearchIndexSync, refreshSearchIndexFile } from "./tauri/searchIndex";
import { WarningsDialog } from "./components/WarningsDialog";
import { SearchResult } from "./logic/snippetSearch";
import {
  IS_EXPERIMENTAL_BUILD,
  getExperimentalYamlWarningsEnabled,
  setExperimentalYamlWarningsEnabled,
  isYamlWarningsActive,
} from "./logic/features";
import { Snippet, SnippetVar, ValidationError } from "./logic/types";
import { DATE_FORMAT_OPTIONS, DateFormatOption, generateUniqueVarName, getReferencedVars } from "./logic/dateFormats";
import { validate } from "./logic/validate";
import { importYamlContent, ImportedMatch } from "./logic/importYaml";
import { buildTriggerInput, getSnippetTriggers, isImageFilePath, normalizeTriggerLines } from "./logic/snippetUtils";
import { appendSnippetToYamlContent, deleteSnippetFromYamlContent, deleteMultipleSnippetsFromYamlContent, deleteSelectedTriggersFromYamlContent, findSnippetLineRangeInYaml, findDeleteSelectionLineRangesInYaml, replaceSnippetInYamlContent, DeleteTriggerSelection, SnippetLineRange } from "./logic/yamlEditor";
import { EspansoConfigFile, EspansoDirectoryInfo, EspansoPathSource, scanEspansoConfigFiles } from "./logic/espansoPaths";
import { getInitialYamlTemplate, normalizeYamlFileName, resolveTargetPath, validateFileName, validateFolderName } from "./logic/createFileSystem";
import { checkIsBinaryFilePath, isBinaryDomFile } from "./logic/fileCheck";
import { cn } from "./lib/utils";

interface DragDropPayload {
  paths: string[];
  position: { x: number; y: number };
}

export interface EspansoConfigPreview {
  config: EspansoConfigFile;
  snippetCount: number;
  inlineCount: number;
  resourceCount: number;
  imageCount: number;
  formCount: number;
  warningCount: number;
  warnings: string[];
  snippets: Snippet[];
  importedMatches: ImportedMatch[];
}

interface EspansoConfigPreviewTreeNode {
  name: string;
  path: string;
  relativePath: string;
  isDir: boolean;
  snippetCount: number;
  fileCount: number;
  preview?: EspansoConfigPreview;
  children?: EspansoConfigPreviewTreeNode[];
}

interface SnippetEditTarget {
  preview: EspansoConfigPreview;
  match: ImportedMatch;
  displayIndex: number;
}

type AddSnippetKind = "text" | "file" | "image" | "form";
type FormFieldControl = "text" | "multiline" | "choice" | "list";
type FormFieldCategory = "text" | "choice" | "list";
type TextFieldMode = "single" | "multiline";

interface FormSelectionState {
  start: number;
  end: number;
  text: string;
}

interface FormFieldConfig {
  id: string;
  control: FormFieldControl;
  defaultValue: string;
  valuesText: string;
}

type TranslateFn = ReturnType<typeof useI18n>["t"];

const DEFAULT_COLLECTION_PANE_WIDTH = 20;
const MIN_COLLECTION_PANE_WIDTH = 14;
const MAX_COLLECTION_PANE_WIDTH = 40;

function snippetKindLabel(kind: AddSnippetKind, t: TranslateFn): string {
  if (kind === "file") return t("snippets.typeFileShort");
  if (kind === "image") return t("snippets.typeImageShort");
  if (kind === "form") return t("snippets.typeFormShort");
  return t("snippets.typeTextShort");
}

function createDefaultFormFieldConfig(id: string): FormFieldConfig {
  return {
    id,
    control: "text",
    defaultValue: "",
    valuesText: "",
  };
}

function extractFormFieldNames(form: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  const fieldPattern = /\[\[([^\][\n]+)\]\]/g;
  let match: RegExpExecArray | null;

  while ((match = fieldPattern.exec(form)) !== null) {
    const name = match[1].trim();
    if (name && !seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }

  return names;
}

function getSelectedFormFieldId(selection: string): string {
  const trimmed = selection.trim();
  const placeholderMatch = trimmed.match(/^\[\[([^\][\n]+)\]\]$/);
  const rawName = placeholderMatch ? placeholderMatch[1] : trimmed;
  return rawName
    .trim()
    .replace(/^\[\[|\]\]$/g, "")
    .replace(/\s+/g, "_")
    .replace(/[\[\]{}]/g, "")
    .trim();
}

function buildUniqueFormFieldId(baseId: string, fieldNames: string[]): string {
  const fallback = baseId || "field";
  if (!fieldNames.includes(fallback)) return fallback;

  let suffix = 2;
  while (fieldNames.includes(`${fallback}_${suffix}`)) {
    suffix += 1;
  }
  return `${fallback}_${suffix}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeFormFieldConfigs(fieldNames: string[], current: FormFieldConfig[]): FormFieldConfig[] {
  return fieldNames.map((name) => current.find((field) => field.id === name) || createDefaultFormFieldConfig(name));
}

function areFormFieldConfigsEqual(a: FormFieldConfig[], b: FormFieldConfig[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((field, index) => {
    const other = b[index];
    return field.id === other.id
      && field.control === other.control
      && field.defaultValue === other.defaultValue
      && field.valuesText === other.valuesText;
  });
}

function getFormFieldCategory(field: FormFieldConfig): FormFieldCategory {
  if (field.control === "choice" || field.control === "list") return field.control;
  return "text";
}

function getTextFieldMode(field: FormFieldConfig): TextFieldMode {
  return field.control === "multiline" ? "multiline" : "single";
}

function DateInsertMenu({ onSelect }: { onSelect: (option: DateFormatOption) => void }) {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 gap-1 px-2 text-xs font-normal border-dashed text-muted-foreground hover:text-foreground hover:bg-accent"
        onClick={() => setIsOpen(!isOpen)}
      >
        <Calendar className="h-3.5 w-3.5 text-primary" />
        <span>{t("dateFormats.addDate")}</span>
        <ChevronDown className="h-3 w-3 opacity-60" />
      </Button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-1 w-72 origin-top-right rounded-md bg-popover p-1.5 shadow-lg border border-border text-popover-foreground animate-in fade-in-80 zoom-in-95">
          <div className="px-2 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border/50 mb-1">
            {t("dateFormats.addDate")}
          </div>
          <div className="max-h-64 overflow-y-auto space-y-0.5">
            {DATE_FORMAT_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-accent hover:text-accent-foreground transition-colors flex flex-col gap-0.5 group"
                onClick={() => {
                  onSelect(opt);
                  setIsOpen(false);
                }}
              >
                <div className="flex items-center justify-between font-medium">
                  <span>{t(opt.labelKey as any)}</span>
                </div>
                <div className="text-[11px] text-muted-foreground/80 font-mono">
                  {opt.example}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DateVariableList({ vars, onRemove }: { vars: SnippetVar[]; onRemove: (varName: string) => void }) {
  const { t } = useI18n();
  if (vars.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-1">
      <span className="text-xs font-medium text-muted-foreground shrink-0 inline-flex items-center gap-1">
        <Calendar className="h-3 w-3 text-primary" />
        {t("dateFormats.associatedDateVars")}
      </span>
      {vars.map((v) => (
        <span
          key={v.name}
          className="inline-flex items-center gap-1 rounded bg-muted/80 px-2 py-0.5 text-xs font-mono text-foreground border border-border/50"
        >
          <span className="text-primary font-medium">{`{{${v.name}}}`}</span>
          <button
            type="button"
            onClick={() => onRemove(v.name)}
            className="ml-0.5 text-muted-foreground hover:text-destructive rounded p-0.5 transition-colors"
            title={t("dateFormats.removeVariable")}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
    </div>
  );
}

function formFieldsToConfigs(formFields: Record<string, any> | undefined): FormFieldConfig[] {
  if (!formFields) return [];

  return Object.entries(formFields).map(([id, value]) => {
    const field = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const rawType = field.type === "choice" || field.type === "list" ? field.type : "";
    const control: FormFieldControl = field.multiline === true ? "multiline" : rawType || "text";
    const values = field.values;

    return {
      id,
      control,
      defaultValue: field.default !== undefined && field.default !== null ? String(field.default) : "",
      valuesText: Array.isArray(values) ? values.map((item) => String(item)).join("\n") : values ? String(values) : "",
    };
  });
}

function configsToFormFields(configs: FormFieldConfig[]): Record<string, any> | undefined {
  const formFields: Record<string, any> = {};

  for (const config of configs) {
    const field: Record<string, any> = {};
    if (config.control === "multiline") {
      field.multiline = true;
    } else if (config.control === "choice" || config.control === "list") {
      field.type = config.control;
      const values = config.valuesText
        .split("\n")
        .map((value) => value.trim())
        .filter(Boolean);
      if (values.length > 0) {
        field.values = values;
      }
    }

    if (config.defaultValue.trim()) {
      field.default = config.defaultValue.trim();
    }

    if (Object.keys(field).length > 0) {
      formFields[config.id] = field;
    }
  }

  return Object.keys(formFields).length > 0 ? formFields : undefined;
}

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
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [highlightedSnippetIndex, setHighlightedSnippetIndex] = useState<number | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isLogOpen, setIsLogOpen] = useState<boolean>(false);
  const [isAboutOpen, setIsAboutOpen] = useState<boolean>(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSelectSearchResult = useCallback((result: SearchResult) => {
    setSelectedEspansoConfigPath(result.filePath);
    setHighlightedSnippetIndex(result.snippetIndex);

    // Clear highlight after 2.5 seconds
    setTimeout(() => {
      setHighlightedSnippetIndex((prev) => (prev === result.snippetIndex ? null : prev));
    }, 2500);
  }, []);
  const [isAddSnippetOpen, setIsAddSnippetOpen] = useState<boolean>(false);
  const [isVisualEditorOpen, setIsVisualEditorOpen] = useState<boolean>(false);
  const [visualEditorYamlContent, setVisualEditorYamlContent] = useState<string>("");
  const [isLoadingVisualEditorYaml, setIsLoadingVisualEditorYaml] = useState<boolean>(false);
  const [highlightedLineRange, setHighlightedLineRange] = useState<SnippetLineRange | null>(null);
  const [snippetEditTarget, setSnippetEditTarget] = useState<SnippetEditTarget | null>(null);
  const [addSnippetKind, setAddSnippetKind] = useState<AddSnippetKind>("text");
  const [editTriggersText, setEditTriggersText] = useState<string>("");
  const [editReplace, setEditReplace] = useState<string>("");
  const [editVars, setEditVars] = useState<SnippetVar[]>([]);
  const replaceTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const visualEditorReplaceTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [editIncludeFile, setEditIncludeFile] = useState<string>("");
  const [editImagePath, setEditImagePath] = useState<string>("");
  const [editForm, setEditForm] = useState<string>("");
  const [editFormFieldConfigs, setEditFormFieldConfigs] = useState<FormFieldConfig[]>([]);
  const [formSelection, setFormSelection] = useState<FormSelectionState | null>(null);
  const [editDescription, setEditDescription] = useState<string>("");
  const [addErrors, setAddErrors] = useState<ValidationError[]>([]);
  const [addWarnings, setAddWarnings] = useState<string[]>([]);
  const [isSavingSnippet, setIsSavingSnippet] = useState<boolean>(false);
  const formTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [visualEditorMode, setVisualEditorMode] = useState<"add" | "delete">("add");
  const [visualEditorOriginalYaml, setVisualEditorOriginalYaml] = useState<string>("");
  const [pendingDeleteSelections, setPendingDeleteSelections] = useState<DeleteTriggerSelection[]>([]);
  const [deleteSearchQuery, setDeleteSearchQuery] = useState<string>("");

  const [enableExperimentalYamlWarnings, setEnableExperimentalYamlWarnings] = useState<boolean>(() =>
    getExperimentalYamlWarningsEnabled(),
  );

  const isYamlWarningsEnabled = useMemo(
    () => isYamlWarningsActive(enableExperimentalYamlWarnings),
    [enableExperimentalYamlWarnings],
  );

  const handleToggleExperimentalYamlWarnings = (checked: boolean) => {
    setEnableExperimentalYamlWarnings(checked);
    setExperimentalYamlWarningsEnabled(checked);
  };

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

  useEffect(() => {
    if (isVisualEditorOpen && highlightedLineRange) {
      const timer = setTimeout(() => {
        const el = document.getElementById(`ve-yaml-line-${highlightedLineRange.startLine}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 120);
      return () => clearTimeout(timer);
    }
  }, [isVisualEditorOpen, highlightedLineRange, visualEditorYamlContent]);

  const espansoPreviewList = useMemo(
    () => {
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
    },
    [espansoConfigPreviews, espansoConfigs, isYamlWarningsEnabled],
  );

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
    () => !!selectedEspansoPreview && espansoConfigPreviews.some(
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

  const [alertDialog, setAlertDialog] = useState<AlertDialogState>({
    isOpen: false,
    title: "",
    description: "",
    confirmText: t("actions.ok"),
  });

  const localizeFileSystemError = useCallback((message: string): string => {
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
  }, [t]);

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

  const buildEspansoConfigPreview = useCallback(async (config: EspansoConfigFile): Promise<EspansoConfigPreview> => {
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
  }, [t]);

  const loadEspansoConfigPreview = useCallback(async (config: EspansoConfigFile): Promise<EspansoConfigPreview> => {
    const preview = await buildEspansoConfigPreview(config);
    setEspansoConfigPreviews((current) => [
      ...current.filter((item) => item.config.path !== config.path),
      preview,
    ]);
    return preview;
  }, [buildEspansoConfigPreview]);



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

  // Warnings Dialog State
  const [isWarningsDialogOpen, setIsWarningsDialogOpen] = useState<boolean>(false);
  const [warningsFilterPath, setWarningsFilterPath] = useState<string | null>(null);

  const scanDefaultEspansoConfigDir = useCallback(async () => {
    setIsScanningEspanso(true);
    setEspansoScanMessage(t("status.scanningEspansoConfigs"));
    try {
      const result = await scanEspansoConfigFiles();
      setEspansoMatchDir(result.matchDir);
      if (result.matchDir) {
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
  }, [t]);

  const openCreateFileDialog = useCallback((defaultParentRelPath?: string) => {
    const targetParent = defaultParentRelPath !== undefined ? defaultParentRelPath : activeDirectoryRelPath;
    setCreateFileName("");
    setCreateFileParentRelPath(targetParent);
    setCreateFileError("");
    setIsCreateFileOpen(true);
  }, [activeDirectoryRelPath]);

  const openCreateFolderDialog = useCallback((defaultParentRelPath?: string) => {
    const targetParent = defaultParentRelPath !== undefined ? defaultParentRelPath : activeDirectoryRelPath;
    setCreateFolderName("");
    setCreateFolderParentRelPath(targetParent);
    setCreateFolderError("");
    setIsCreateFolderOpen(true);
  }, [activeDirectoryRelPath]);

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
      await writeTextFile(targetAbsPath, template);
      if (espansoMatchDir) {
        refreshSearchIndexFile(targetAbsPath, espansoMatchDir).catch((e) =>
          console.warn("Index refresh failed:", e)
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

    const parts = path.split(/[/\\]/);
    const name = parts[parts.length - 1];
    const config: EspansoConfigFile = {
      name,
      path,
      relativePath: name,
    };

    const nextConfigs = [config, ...espansoConfigs.filter((item) => item.path !== path)];
    setEspansoConfigs(nextConfigs);
    setEspansoConfigPreviews((current) => current.filter((item) => item.config.path !== path));
    setSelectedEspansoConfigPath(path);
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

  function resetSnippetForm() {
    setAddSnippetKind("text");
    setEditTriggersText("");
    setEditReplace("");
    setEditVars([]);
    setEditIncludeFile("");
    setEditImagePath("");
    setEditForm("");
    setEditFormFieldConfigs([]);
    setFormSelection(null);
    setEditDescription("");
    setAddErrors([]);
    setAddWarnings([]);
  }

  const loadVisualEditorYaml = useCallback(async (pathOverride?: string, matchIndexToHighlight?: number) => {
    const targetPath = pathOverride || snippetEditTarget?.preview.config.path || selectedEspansoPreview?.config.path;
    if (!targetPath) return;
    setIsLoadingVisualEditorYaml(true);
    try {
      const content = await readTextFile(targetPath);
      setVisualEditorOriginalYaml(content);
      setVisualEditorYamlContent(content);
      setPendingDeleteSelections([]);
      if (typeof matchIndexToHighlight === "number" && matchIndexToHighlight >= 0) {
        const range = findSnippetLineRangeInYaml(content, matchIndexToHighlight);
        setHighlightedLineRange(range);
      } else {
        setHighlightedLineRange(null);
      }
    } catch (e: any) {
      setVisualEditorOriginalYaml("");
      setVisualEditorYamlContent(`# ${t("errors.genericError")}: ${e?.message || e}`);
    } finally {
      setIsLoadingVisualEditorYaml(false);
    }
  }, [selectedEspansoPreview, snippetEditTarget, t]);

  const applyPendingDeletionsToYaml = useCallback((originalContent: string, selections: DeleteTriggerSelection[]) => {
    if (selections.length === 0) {
      return originalContent;
    }
    return deleteSelectedTriggersFromYamlContent(originalContent, selections);
  }, []);

  const getDeleteSelectionKey = (selection: DeleteTriggerSelection) => `${selection.matchIndex}:${selection.triggerIndex}`;

  const toggleDeleteSelection = (selection: DeleteTriggerSelection) => {
    const selectionKey = getDeleteSelectionKey(selection);
    let nextSelections: DeleteTriggerSelection[];
    if (pendingDeleteSelections.some((item) => getDeleteSelectionKey(item) === selectionKey)) {
      nextSelections = pendingDeleteSelections.filter((item) => getDeleteSelectionKey(item) !== selectionKey);
    } else {
      nextSelections = [...pendingDeleteSelections, selection];
    }
    setPendingDeleteSelections(nextSelections);
    const updatedYaml = applyPendingDeletionsToYaml(visualEditorOriginalYaml, nextSelections);
    setVisualEditorYamlContent(updatedYaml);

    if (!pendingDeleteSelections.some((item) => getDeleteSelectionKey(item) === selectionKey)) {
      const range = findDeleteSelectionLineRangesInYaml(visualEditorOriginalYaml, [selection])[0]
        || findSnippetLineRangeInYaml(visualEditorOriginalYaml, selection.matchIndex);
      setHighlightedLineRange(range);
    } else {
      setHighlightedLineRange(null);
    }
  };

  const handleUndoLastDelete = () => {
    if (pendingDeleteSelections.length === 0) return;
    const nextSelections = pendingDeleteSelections.slice(0, -1);
    setPendingDeleteSelections(nextSelections);
    const updatedYaml = applyPendingDeletionsToYaml(visualEditorOriginalYaml, nextSelections);
    setVisualEditorYamlContent(updatedYaml);
    setHighlightedLineRange(null);
  };

  const handleResetDeletions = () => {
    setPendingDeleteSelections([]);
    setVisualEditorYamlContent(visualEditorOriginalYaml);
    setHighlightedLineRange(null);
  };

  const visualEditorMatches = useMemo(() => {
    if (!visualEditorOriginalYaml) return [];
    const relPath = snippetEditTarget?.preview.config.relativePath || selectedEspansoPreview?.config.relativePath || "file.yml";
    const res = importYamlContent(visualEditorOriginalYaml, relPath);
    return res.importedMatches;
  }, [visualEditorOriginalYaml, snippetEditTarget, selectedEspansoPreview]);

  const visualEditorPreviewYamlContent = visualEditorMode === "delete"
    ? visualEditorOriginalYaml
    : visualEditorYamlContent;

  const pendingDeletedLineNumbers = useMemo(() => {
    if (visualEditorMode !== "delete" || pendingDeleteSelections.length === 0) {
      return new Set<number>();
    }

    const ranges = findDeleteSelectionLineRangesInYaml(visualEditorOriginalYaml, pendingDeleteSelections);
    const lineNumbers = new Set<number>();
    for (const range of ranges) {
      for (let lineNumber = range.startLine; lineNumber <= range.endLine; lineNumber++) {
        lineNumbers.add(lineNumber);
      }
    }
    return lineNumbers;
  }, [visualEditorMode, visualEditorOriginalYaml, pendingDeleteSelections]);

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
    setSnippetEditTarget(null);
    resetSnippetForm();
    setIsAddSnippetOpen(true);
  }

  function openEditSnippetDialog(target: SnippetEditTarget) {
    const editableSnippet = target.match.originalSnippet || target.match.snippet;
    const triggerInput = buildTriggerInput(editableSnippet);
    setSnippetEditTarget(target);
    setAddSnippetKind(
      editableSnippet.include_file
        ? "file"
        : editableSnippet.image_path !== undefined
          ? "image"
          : editableSnippet.form !== undefined
            ? "form"
            : "text",
    );
    setEditTriggersText(triggerInput.multiline);
    setEditReplace(editableSnippet.replace || "");
    setEditVars(editableSnippet.vars ? [...editableSnippet.vars] : []);
    setEditIncludeFile(target.match.resourcePath || editableSnippet.include_file || "");
    setEditImagePath(editableSnippet.image_path || "");
    setEditForm(editableSnippet.form || "");
    setEditFormFieldConfigs(formFieldsToConfigs(editableSnippet.form_fields));
    setFormSelection(null);
    setEditDescription(editableSnippet.description || "");
    setAddErrors([]);
    setAddWarnings([]);
    setIsAddSnippetOpen(true);
  }

  function buildFormSnippet(): Snippet {
    const normalizedTriggers = normalizeTriggerLines(editTriggersText);
    const triggerFields = normalizedTriggers.length > 1
      ? { triggers: normalizedTriggers }
      : { trigger: normalizedTriggers[0] || "" };

    const snippet: Snippet = {
      ...triggerFields,
    };

    if (activeSnippetKind === "file") {
      snippet.include_file = editIncludeFile.trim();
    } else if (activeSnippetKind === "image") {
      snippet.image_path = editImagePath.trim();
    } else if (activeSnippetKind === "form") {
      snippet.form = editForm;
      const formFields = configsToFormFields(editFormFieldConfigs);
      if (formFields) {
        snippet.form_fields = formFields;
      }
      const referencedVars = getReferencedVars(editForm, editVars);
      if (referencedVars.length > 0) {
        snippet.vars = referencedVars;
      }
    } else {
      snippet.replace = editReplace;
      const referencedVars = getReferencedVars(editReplace, editVars);
      if (referencedVars.length > 0) {
        snippet.vars = referencedVars;
      }
    }

    if (editDescription.trim()) {
      snippet.description = editDescription.trim();
    }

    return snippet;
  }

  function handleInsertDateVariable(option: DateFormatOption, target: "replace" | "visualReplace" | "form" = "replace") {
    const varName = generateUniqueVarName(editVars, option.defaultVarName);
    const newVar: SnippetVar = {
      name: varName,
      type: "date",
      params: {
        format: option.format,
      },
    };
    setEditVars((prev) => [...prev, newVar]);

    const tagToInsert = `{{${varName}}}`;
    const targetRef = target === "form"
      ? formTextareaRef
      : target === "visualReplace"
        ? visualEditorReplaceTextareaRef
        : replaceTextareaRef;
    const textarea = targetRef.current;

    if (textarea) {
      const start = textarea.selectionStart || 0;
      const end = textarea.selectionEnd || 0;
      const currentVal = target === "form" ? editForm : editReplace;
      const nextVal = currentVal.substring(0, start) + tagToInsert + currentVal.substring(end);
      if (target === "form") {
        setEditForm(nextVal);
      } else {
        setEditReplace(nextVal);
      }

      requestAnimationFrame(() => {
        textarea.focus();
        const newPos = start + tagToInsert.length;
        textarea.setSelectionRange(newPos, newPos);
      });
    } else {
      if (target === "form") {
        setEditForm((prev) => (prev ? `${prev} ${tagToInsert}` : tagToInsert));
      } else {
        setEditReplace((prev) => (prev ? `${prev} ${tagToInsert}` : tagToInsert));
      }
    }
  }

  function handleRemoveDateVar(varName: string) {
    setEditVars((prev) => prev.filter((v) => v.name !== varName));
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
      const targetPath = snippetEditTarget?.preview.config.path || selectedEspansoPreview?.config.path;
      if (!targetPath) return;

      if (pendingDeleteSelections.length === 0) {
        setIsVisualEditorOpen(false);
        return;
      }

      setIsSavingSnippet(true);
      try {
        await writeTextFile(targetPath, visualEditorYamlContent);
        if (espansoMatchDir) {
          refreshSearchIndexFile(targetPath, espansoMatchDir).catch((e) =>
            console.warn("Index refresh failed:", e)
          );
        }
        setPendingDeleteSelections([]);
        const targetConfig = espansoConfigs.find((config) => config.path === targetPath);
        if (targetConfig) {
          await loadEspansoConfigPreview(targetConfig);
        }
        setSelectedEspansoConfigPath(targetPath);
        setIsVisualEditorOpen(false);
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
      const content = await readTextFile(targetPreview.config.path);
      const updatedContent = snippetEditTarget
        ? replaceSnippetInYamlContent(content, snippetEditTarget.match.originalMatchIndex, snippet)
        : appendSnippetToYamlContent(content, snippet);
      await writeTextFile(targetPreview.config.path, updatedContent);
      if (espansoMatchDir) {
        refreshSearchIndexFile(targetPreview.config.path, espansoMatchDir).catch((e) =>
          console.warn("Index refresh failed:", e)
        );
      }
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
          const content = await readTextFile(target.preview.config.path);
          const updatedContent = deleteSnippetFromYamlContent(content, target.match.originalMatchIndex);
          await writeTextFile(target.preview.config.path, updatedContent);
          if (espansoMatchDir) {
            refreshSearchIndexFile(target.preview.config.path, espansoMatchDir).catch((e) =>
              console.warn("Index refresh failed:", e)
            );
          }
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
          const content = await readTextFile(configPath);
          const updatedContent = deleteMultipleSnippetsFromYamlContent(content, matchIndices);
          await writeTextFile(configPath, updatedContent);
          if (espansoMatchDir) {
            refreshSearchIndexFile(configPath, espansoMatchDir).catch((e) =>
              console.warn("Index refresh failed:", e)
            );
          }
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
                    onClick={scanDefaultEspansoConfigDir}
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
                      onOpenWarnings={(path) => {
                        setWarningsFilterPath(path);
                        setIsWarningsDialogOpen(true);
                      }}
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
                  <Button variant="ghost" onClick={scanDefaultEspansoConfigDir}>
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

      <Dialog open={isVisualEditorOpen} onOpenChange={(open) => {
        setIsVisualEditorOpen(open);
        if (!open) {
          resetSnippetForm();
          setSnippetEditTarget(null);
        }
      }}>
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
                    <Button variant="outline" onClick={() => setIsVisualEditorOpen(false)}>
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
                  <FileCode className="h-4 w-4 text-primary" />
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
                    <Button size="sm" variant="outline" onClick={scanDefaultEspansoConfigDir} disabled={isScanningEspanso}>
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

function getEspansoConfigAncestorPaths(relativePath: string): Set<string> {
  const paths = new Set<string>();
  const parts = relativePath.split("/");
  parts.pop();

  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    paths.add(current);
  }

  return paths;
}

function findTreeNode(
  nodes: EspansoConfigPreviewTreeNode[],
  targetPath: string,
): EspansoConfigPreviewTreeNode | null {
  if (!targetPath) return null;
  for (const node of nodes) {
    if (
      node.path === targetPath ||
      node.relativePath === targetPath ||
      (node.preview && node.preview.config.path === targetPath)
    ) {
      return node;
    }
    if (node.children) {
      const found = findTreeNode(node.children, targetPath);
      if (found) return found;
    }
  }
  return null;
}

function buildEspansoConfigPreviewTree(
  previews: EspansoConfigPreview[],
  directories: EspansoDirectoryInfo[] = [],
): EspansoConfigPreviewTreeNode[] {
  const root: EspansoConfigPreviewTreeNode[] = [];

  function getOrCreateDir(
    nodes: EspansoConfigPreviewTreeNode[],
    name: string,
    path: string,
    relativePath: string,
  ): EspansoConfigPreviewTreeNode {
    const existing = nodes.find((node) => node.isDir && node.path === path);
    if (existing) return existing;

    const dir: EspansoConfigPreviewTreeNode = {
      name,
      path,
      relativePath,
      isDir: true,
      snippetCount: 0,
      fileCount: 0,
      children: [],
    };
    nodes.push(dir);
    nodes.sort((a, b) => Number(a.isDir !== b.isDir) || a.name.localeCompare(b.name));
    return dir;
  }

  // Register all directories first so empty folders are preserved in the tree
  for (const directory of directories) {
    const parts = directory.relativePath.split("/");
    let currentNodes = root;
    let currentPath = "";
    let currentRelPath = "";

    parts.forEach((part) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      currentRelPath = currentRelPath ? `${currentRelPath}/${part}` : part;

      const dirNode = getOrCreateDir(currentNodes, part, currentPath, currentRelPath);
      currentNodes = dirNode.children || [];
    });
  }

  // Register files
  for (const preview of previews) {
    const parts = preview.config.relativePath.split("/");
    let currentNodes = root;
    let currentPath = "";
    let currentRelPath = "";

    parts.forEach((part, index) => {
      const isLast = index === parts.length - 1;
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      currentRelPath = currentRelPath ? `${currentRelPath}/${part}` : part;

      if (isLast) {
        if (!currentNodes.some((n) => !n.isDir && n.path === preview.config.path)) {
          currentNodes.push({
            name: part,
            path: preview.config.path,
            relativePath: currentRelPath,
            isDir: false,
            snippetCount: preview.snippetCount,
            fileCount: 1,
            preview,
          });
          currentNodes.sort((a, b) => Number(a.isDir !== b.isDir) || a.name.localeCompare(b.name));
        }
      } else {
        const dir = getOrCreateDir(currentNodes, part, currentPath, currentRelPath);
        dir.snippetCount += preview.snippetCount;
        dir.fileCount += 1;
        currentNodes = dir.children || [];
      }
    });
  }

  return root;
}

interface EspansoConfigTreeNodeProps {
  node: EspansoConfigPreviewTreeNode;
  activePath: string;
  activeAncestorPaths: Set<string>;
  onSelect: (path: string) => void;
  onOpenFile: (path: string) => void;
  onCreateFile?: (parentRelPath: string) => void;
  onCreateFolder?: (parentRelPath: string) => void;
}

const EspansoConfigTreeNode = memo(function EspansoConfigTreeNode({
  node,
  activePath,
  activeAncestorPaths,
  onSelect,
  onOpenFile,
  onCreateFile,
  onCreateFolder,
}: EspansoConfigTreeNodeProps) {
  const { t } = useI18n();
  const containsActive = activeAncestorPaths.has(node.relativePath || node.path);
  const [isOpen, setIsOpen] = useState<boolean>(containsActive);

  useEffect(() => {
    if (containsActive) {
      setIsOpen(true);
    }
  }, [containsActive]);

  if (node.isDir) {
    return (
      <div className="mb-0.5">
        <div
          className={cn(
            "group flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent/70",
            containsActive ? "text-foreground font-semibold" : "text-foreground/80 font-medium",
          )}
        >
          <button
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
            onClick={() => setIsOpen(!isOpen)}
          >
            {isOpen ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground/70 transition-transform" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/70 transition-transform" />
            )}
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400">
              {isOpen ? <FolderOpen className="h-4 w-4" /> : <Folder className="h-4 w-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold tracking-tight">{node.name}</div>
            </div>
          </button>
          <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent-foreground/10 hover:text-foreground"
              title={t("filesystem.createFolderIn", { path: node.name })}
              onClick={(e) => {
                e.stopPropagation();
                onCreateFolder?.(node.relativePath);
              }}
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </button>
            <button
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent-foreground/10 hover:text-foreground"
              title={t("filesystem.createFileIn", { path: node.name })}
              onClick={(e) => {
                e.stopPropagation();
                onCreateFile?.(node.relativePath);
              }}
            >
              <FilePlus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        {isOpen && node.children && (
          <div className="ml-3.5 mt-0.5 space-y-0.5 border-l border-border/50 pl-2">
            {node.children.map((child) => (
              <EspansoConfigTreeNode
                key={child.path}
                node={child}
                activePath={activePath}
                activeAncestorPaths={activeAncestorPaths}
                onSelect={onSelect}
                onOpenFile={onOpenFile}
                onCreateFile={onCreateFile}
                onCreateFolder={onCreateFolder}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const isActive = node.preview?.config.path === activePath;

  return (
    <div
      className={cn(
        "group flex w-full items-center rounded-md transition-colors",
        isActive
          ? "bg-primary text-primary-foreground font-medium"
          : "text-foreground/80 hover:bg-accent hover:text-foreground",
      )}
    >
      <button
        className="flex min-w-0 flex-1 items-center gap-2 rounded-l-md px-2 py-1.5 text-left"
        onClick={() => node.preview && onSelect(node.preview.config.path)}
      >
        <FileText className={cn("h-4 w-4 shrink-0", isActive ? "text-primary-foreground" : "text-muted-foreground")} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium">{node.name.replace(/\.ya?ml$/i, "")}</div>
        </div>
      </button>
      {node.preview && (
        <button
          className={cn(
            "mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded opacity-70 transition hover:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            isActive ? "hover:bg-primary-foreground/20 text-primary-foreground" : "hover:bg-accent-foreground/10 text-muted-foreground",
          )}
          title={t("filesystem.openFileInDefaultApp", { file: node.name })}
          onClick={() => onOpenFile(node.preview!.config.path)}
        >
          <SquareArrowOutUpRight className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
});

interface EspansoConfigDetailProps {
  preview: EspansoConfigPreview;
  highlightedIndex?: number | null;
  onViewSnippet: (match: ImportedMatch, index: number) => void;
  onAddSnippet: () => void;
  onOpenVisualEditor?: () => void;
  onOpenWarnings?: (path: string) => void;
  onBatchDelete?: (matchIndices: number[], onComplete: () => void) => void;
}

function EspansoConfigDetail({
  preview,
  highlightedIndex,
  onViewSnippet,
  onAddSnippet,
  onOpenVisualEditor,
  onOpenWarnings,
  onBatchDelete,
}: EspansoConfigDetailProps) {
  const { t } = useI18n();
  const ROW_HEIGHT = 36;

  const OVERSCAN_ROWS = 8;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState(false);
  const snippetCount = preview.snippets.length;
  const totalHeight = snippetCount * ROW_HEIGHT;

  useEffect(() => {
    if (highlightedIndex !== undefined && highlightedIndex !== null && highlightedIndex >= 0) {
      const targetScrollTop = Math.max(0, highlightedIndex * ROW_HEIGHT - 60);
      setScrollTop(targetScrollTop);
      if (scrollRef.current) {
        scrollRef.current.scrollTop = targetScrollTop;
      }
    }
  }, [highlightedIndex, ROW_HEIGHT]);
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN_ROWS);
  const visibleRowCount = Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN_ROWS * 2;
  const endIndex = Math.min(snippetCount, startIndex + visibleRowCount);
  const visibleSnippets = preview.snippets.slice(startIndex, endIndex);

  const handleCopyPath = useCallback(() => {
    if (!preview.config.path) return;
    navigator.clipboard
      .writeText(preview.config.path)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  }, [preview.config.path]);

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
    setIsBatchMode(false);
    setSelectedIndices(new Set());
    setCopied(false);
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [preview.config.path]);

  const exitBatchMode = () => {
    setIsBatchMode(false);
    setSelectedIndices(new Set());
  };

  const toggleSelectIndex = (index: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  return (
    <>
      <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xl font-bold">{preview.config.relativePath}</h2>
          <div className="mt-1 flex items-center gap-1.5 min-w-0">
            <p className="truncate text-sm text-muted-foreground">{preview.config.path}</p>
            <button
              type="button"
              onClick={handleCopyPath}
              className="shrink-0 rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors cursor-pointer"
              title={copied ? t("actions.copied") : t("actions.copyAbsolutePath")}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-muted-foreground/80 hover:text-foreground" />
              )}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {preview.warningCount > 0 && (
            <button
              type="button"
              onClick={() => onOpenWarnings?.(preview.config.path)}
              className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-md bg-amber-100 hover:bg-amber-200 text-amber-800 transition-colors cursor-pointer"
              title={t("warnings.viewFileTitle")}
            >
              <AlertTriangle className="h-3.5 w-3.5 text-amber-700" />
            </button>
          )}
          {isBatchMode ? (
            <>
              <Button size="sm" variant="ghost" onClick={exitBatchMode}>
                {t("actions.cancel")}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={selectedIndices.size === 0}
                onClick={() => {
                  if (selectedIndices.size === 0) return;
                  const originalIndices = Array.from(selectedIndices).map((idx) => {
                    return preview.importedMatches[idx]?.originalMatchIndex ?? idx;
                  });
                  onBatchDelete?.(originalIndices, exitBatchMode);
                }}
              >
                <Trash2 className="h-4 w-4" />
                {t("actions.batchDelete", { count: selectedIndices.size })}
              </Button>
            </>
          ) : (
            <>
              {onOpenVisualEditor && (
                <Button size="sm" variant="outline" onClick={onOpenVisualEditor}>
                  <Columns className="h-4 w-4" />
                  {t("actions.visualEditor")}
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsBatchMode(true)}
              >
                <ListChecks className="h-4 w-4" />
                {t("actions.batchSelect")}
              </Button>
              <Button size="sm" onClick={onAddSnippet}>
                <Plus className="h-4 w-4" />
                {t("actions.addSnippet")}
              </Button>
            </>
          )}
        </div>
      </div>

      <div
        className={cn(
          "grid h-9 shrink-0 items-center border-b bg-secondary/40 px-3 text-xs font-semibold text-muted-foreground",
          isBatchMode
            ? "grid-cols-[2.25rem_minmax(7rem,0.8fr)_minmax(4.5rem,0.45fr)_minmax(8rem,1fr)_minmax(12rem,2fr)]"
            : "grid-cols-[minmax(7rem,0.8fr)_minmax(4.5rem,0.45fr)_minmax(8rem,1fr)_minmax(12rem,2fr)]"
        )}
      >
        {isBatchMode && (
          <div className="flex items-center justify-center">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 rounded border-emerald-500/50 text-emerald-600 focus:ring-emerald-500 cursor-pointer accent-emerald-600"
              checked={snippetCount > 0 && selectedIndices.size === snippetCount}
              onChange={(e) => {
                if (e.target.checked) {
                  setSelectedIndices(new Set(Array.from({ length: snippetCount }, (_, i) => i)));
                } else {
                  setSelectedIndices(new Set());
                }
              }}
            />
          </div>
        )}
        <div className="truncate">{t("table.trigger")}</div>
        <div className="truncate">{t("table.type")}</div>
        <div className="truncate">{t("table.description")}</div>
        <div className="truncate">{t("table.content")}</div>
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
                const triggers = getSnippetTriggers(snippet);
                const displayTrigger = triggers.length > 0 ? triggers.join(", ") : t("snippets.snippetNumber", { number: index + 1 });
                const snippetKind = snippet.include_file
                  ? "file"
                  : snippet.image_path !== undefined
                    ? "image"
                    : snippet.form !== undefined
                      ? "form"
                      : "text";
                const snippetPreview = snippet.include_file
                  ? `include: ${snippet.include_file}`
                  : snippet.image_path !== undefined
                    ? `image: ${snippet.image_path}`
                    : snippet.form !== undefined
                      ? snippet.form || t("snippets.emptyForm")
                      : snippet.replace || t("snippets.emptyReplacement");

                const isSelected = selectedIndices.has(index);
                const isHighlighted = highlightedIndex === index;

                return (
                  <button
                    key={`${triggers.join("-")}-${index}`}
                    className={cn(
                      "grid h-9 w-full items-center px-3 text-left text-sm transition-all hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                      isBatchMode
                        ? "grid-cols-[2.25rem_minmax(7rem,0.8fr)_minmax(4.5rem,0.45fr)_minmax(8rem,1fr)_minmax(12rem,2fr)]"
                        : "grid-cols-[minmax(7rem,0.8fr)_minmax(4.5rem,0.45fr)_minmax(8rem,1fr)_minmax(12rem,2fr)]",
                      isSelected && "bg-emerald-500/15 hover:bg-emerald-500/20 border-l-2 border-l-emerald-500",
                      isHighlighted && "bg-emerald-500/20 hover:bg-emerald-500/30 border-l-4 border-l-emerald-500 font-semibold ring-1 ring-emerald-500/50 animate-pulse"
                    )}
                    onClick={() => {
                      if (isBatchMode) {
                        toggleSelectIndex(index);
                      } else {
                        onViewSnippet(
                          preview.importedMatches[index] || { snippet, originalMatchIndex: index },
                          index
                        );
                      }
                    }}
                    title={
                      isBatchMode
                        ? displayTrigger
                        : t("snippets.viewDetailsFor", { trigger: displayTrigger })
                    }
                  >
                    {isBatchMode && (
                      <div className="flex items-center justify-center pointer-events-none">
                        <input
                          type="checkbox"
                          readOnly
                          className="h-3.5 w-3.5 rounded border-emerald-500/50 text-emerald-600 focus:ring-emerald-500 accent-emerald-600"
                          checked={isSelected}
                        />
                      </div>
                    )}
                    <div className="mono-field min-w-0 truncate pr-3 text-sm font-medium">{displayTrigger}</div>
                    <div className="flex items-center gap-1.5 min-w-0 pr-2">
                      <span
                        className={cn(
                          "h-2.5 w-2.5 shrink-0 rounded-full",
                          snippetKind === "file" && "bg-primary",
                          snippetKind === "image" && "bg-purple-500",
                          snippetKind === "form" && "bg-emerald-500",
                          snippetKind === "text" && "bg-muted-foreground/50",
                        )}
                      />
                      <span className="truncate text-xs font-medium text-muted-foreground">
                        {snippetKind === "file"
                          ? t("snippets.fileType")
                          : snippetKind === "image"
                            ? t("snippets.imageType")
                            : snippetKind === "form"
                              ? t("snippets.formType")
                              : t("snippets.textType")}
                      </span>
                    </div>
                    <div className="min-w-0 pr-3">
                      <div className="truncate text-muted-foreground">
                        {snippet.description || ""}
                      </div>
                    </div>
                    <div className="min-w-0 truncate text-muted-foreground">
                      {snippetPreview}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <EmptyState
            icon={FileText}
            title={t("empty.noSupportedSnippets")}
            description={t("empty.noSupportedSnippetsDescription")}
          />
        )}
      </div>
    </>
  );
}

interface EspansoDirectoryDetailProps {
  node: EspansoConfigPreviewTreeNode;
  onSelectFile: (path: string) => void;
  onCreateFile: (parentRelPath?: string) => void;
  onCreateFolder: (parentRelPath?: string) => void;
}

function EspansoDirectoryDetail({
  node,
  onSelectFile,
  onCreateFile,
  onCreateFolder,
}: EspansoDirectoryDetailProps) {
  const { t } = useI18n();

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      {/* Directory Header */}
      <div className="flex items-center justify-between border-b px-6 py-4 bg-secondary/20">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
            <FolderOpen className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-foreground">{node.name}</h2>
              <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-mono text-muted-foreground">
                {node.relativePath ? `/${node.relativePath}` : "/"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("filesystem.directory")}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => onCreateFolder(node.relativePath)}
            className="gap-1.5"
          >
            <FolderPlus className="h-4 w-4" />
            {t("filesystem.newSubdirectory")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onCreateFile(node.relativePath)}
            className="gap-1.5"
          >
            <FilePlus className="h-4 w-4" />
            {t("filesystem.newFile")}
          </Button>
        </div>
      </div>

      {/* Directory Contents */}
      <ScrollArea className="flex-1 p-6">
        <div className="max-w-4xl space-y-4">
          <h3 className="text-sm font-semibold text-foreground/80">{t("filesystem.contentsIn", { name: node.name })}</h3>
          {!node.children || node.children.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center bg-muted/10">
              <Folder className="h-10 w-10 text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-sm font-medium text-muted-foreground">{t("empty.directoryEmpty")}</p>
              <p className="text-xs text-muted-foreground/70 mt-1 mb-4">
                {t("empty.directoryEmptyDescription")}
              </p>
              <div className="flex justify-center gap-2">
                <Button size="sm" onClick={() => onCreateFolder(node.relativePath)}>
                  <FolderPlus className="h-3.5 w-3.5 mr-1.5" />
                  {t("filesystem.createFolderShort")}
                </Button>
                <Button size="sm" variant="outline" onClick={() => onCreateFile(node.relativePath)}>
                  <FilePlus className="h-3.5 w-3.5 mr-1.5" />
                  {t("filesystem.createYamlFile")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {node.children.map((child) => (
                <div
                  key={child.path}
                  className="flex items-center justify-between rounded-lg border bg-card p-3.5 shadow-sm hover:border-primary/50 hover:shadow-md transition-all cursor-pointer group"
                  onClick={() => {
                    if (child.isDir) {
                      onSelectFile(child.relativePath || child.path);
                    } else if (child.preview) {
                      onSelectFile(child.preview.config.path);
                    }
                  }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {child.isDir ? (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400">
                        <Folder className="h-4 w-4" />
                      </div>
                    ) : (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <FileText className="h-4 w-4" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                        {child.name}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-foreground transition-colors shrink-0" />
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
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
