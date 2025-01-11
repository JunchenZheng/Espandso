import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { listen } from "@tauri-apps/api/event";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import {
  AlertTriangle,
  AlignLeft,
  ChevronDown,
  ChevronRight,
  FileSearch,
  FileText,
  Folder,
  FolderOpen,
  List,
  ListChecks,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Settings,
  SquareArrowOutUpRight,
  Trash2,
  Type,
  Upload,
  XCircle,
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
import { Textarea } from "./components/ui/textarea";
import { Snippet, ValidationError } from "./logic/types";
import { validate } from "./logic/validate";
import { importYamlContent, ImportedMatch } from "./logic/importYaml";
import { buildTriggerInput, getSnippetTriggers, normalizeTriggerLines } from "./logic/snippetUtils";
import { appendSnippetToYamlContent, deleteSnippetFromYamlContent, replaceSnippetInYamlContent } from "./logic/yamlEditor";
import { EspansoConfigFile, EspansoPathSource, scanEspansoConfigFiles } from "./logic/espansoPaths";
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
  formCount: number;
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

interface SnippetEditTarget {
  preview: EspansoConfigPreview;
  match: ImportedMatch;
  displayIndex: number;
}

type AddSnippetKind = "text" | "file" | "form";
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

function snippetKindLabel(kind: AddSnippetKind): string {
  if (kind === "file") return "File";
  if (kind === "form") return "Form";
  return "Text";
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

function App() {
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [espansoMatchDir, setEspansoMatchDir] = useState<string>("");
  const [espansoPathSource, setEspansoPathSource] = useState<EspansoPathSource | "">("");
  const [espansoConfigs, setEspansoConfigs] = useState<EspansoConfigFile[]>([]);
  const [espansoConfigPreviews, setEspansoConfigPreviews] = useState<EspansoConfigPreview[]>([]);
  const [selectedEspansoConfigPath, setSelectedEspansoConfigPath] = useState<string>("");
  const [isScanningEspanso, setIsScanningEspanso] = useState<boolean>(false);
  const [espansoScanMessage, setEspansoScanMessage] = useState<string>("");
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isAddSnippetOpen, setIsAddSnippetOpen] = useState<boolean>(false);
  const [snippetEditTarget, setSnippetEditTarget] = useState<SnippetEditTarget | null>(null);
  const [addSnippetKind, setAddSnippetKind] = useState<AddSnippetKind>("text");
  const [editTriggersText, setEditTriggersText] = useState<string>("");
  const [editReplace, setEditReplace] = useState<string>("");
  const [editIncludeFile, setEditIncludeFile] = useState<string>("");
  const [editForm, setEditForm] = useState<string>("");
  const [editFormFieldConfigs, setEditFormFieldConfigs] = useState<FormFieldConfig[]>([]);
  const [formSelection, setFormSelection] = useState<FormSelectionState | null>(null);
  const [editDescription, setEditDescription] = useState<string>("");
  const [addErrors, setAddErrors] = useState<ValidationError[]>([]);
  const [addWarnings, setAddWarnings] = useState<string[]>([]);
  const [isSavingSnippet, setIsSavingSnippet] = useState<boolean>(false);
  const formTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const buildEspansoConfigPreviews = useCallback(async (configs: EspansoConfigFile[]): Promise<EspansoConfigPreview[]> => {
    const previews: EspansoConfigPreview[] = [];

    for (const config of configs) {
      try {
        const content = await readTextFile(config.path);
        const result = importYamlContent(content, config.name);
        const inlineCount = result.snippets.filter((snippet) => snippet.replace !== undefined).length;
        const resourceCount = result.snippets.filter((snippet) => snippet.include_file).length;
        const formCount = result.snippets.filter((snippet) => snippet.form !== undefined).length;

        previews.push({
          config,
          snippetCount: result.snippets.length,
          inlineCount,
          resourceCount,
          formCount,
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
          formCount: 0,
          warningCount: 1,
          snippets: [],
          importedMatches: [],
        });
      }
    }

    return previews;
  }, []);

  const scanDefaultEspansoConfigDir = useCallback(async () => {
    setIsScanningEspanso(true);
    setEspansoScanMessage("Scanning Espanso match directory...");
    try {
      const result = await scanEspansoConfigFiles();
      setEspansoMatchDir(result.matchDir);
      setEspansoPathSource(result.pathSource);
      setEspansoConfigs(result.files);
      setEspansoConfigPreviews(await buildEspansoConfigPreviews(result.files));
      setSelectedEspansoConfigPath((current) => {
        if (current && result.files.some((file) => file.path === current)) return current;
        return result.files[0]?.path || "";
      });
      setEspansoScanMessage(result.files.length > 0 ? "" : "No YAML configs found in the Espanso match directory.");
    } catch (e: any) {
      const message = e?.message || String(e);
      const permissionHint = message.toLowerCase().includes("forbidden")
        ? `Espanso path was resolved, but Tauri blocked file access. Add the Espanso match directory to the filesystem scope, then restart the app. (${message})`
        : `Failed to scan Espanso configs: ${message}`;
      setEspansoConfigs([]);
      setEspansoConfigPreviews([]);
      setEspansoScanMessage(permissionHint);
    } finally {
      setIsScanningEspanso(false);
    }
  }, [buildEspansoConfigPreviews]);

  useEffect(() => {
    scanDefaultEspansoConfigDir();
  }, [scanDefaultEspansoConfigDir]);

  async function addDroppedYamlPreview(path: string) {
    if (isAddSnippetOpen && addSnippetKind === "file") {
      setEditIncludeFile(path);
      setIsDragging(false);
      return;
    }

    const lowerPath = path.toLowerCase();
    if (!lowerPath.endsWith(".yml") && !lowerPath.endsWith(".yaml")) {
      alert("Please drop an Espanso YAML file.");
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
    setEspansoConfigPreviews(await buildEspansoConfigPreviews(nextConfigs));
    setSelectedEspansoConfigPath(path);
  }

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
  }, [addSnippetKind, buildEspansoConfigPreviews, espansoConfigs, isAddSnippetOpen, snippetEditTarget]);

  const espansoPreviewList = useMemo(
    () => espansoConfigPreviews.length > 0
      ? espansoConfigPreviews
      : espansoConfigs.map((config) => ({
        config,
        snippetCount: 0,
        inlineCount: 0,
        resourceCount: 0,
        formCount: 0,
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
        forms: total.forms + preview.formCount,
        warnings: total.warnings + preview.warningCount,
      }),
      { snippets: 0, inline: 0, resources: 0, forms: 0, warnings: 0 },
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
  const activeSnippetKind: AddSnippetKind = addSnippetKind;
  const detectedFormFieldNames = useMemo(() => extractFormFieldNames(editForm), [editForm]);
  const detectedFormFieldKey = detectedFormFieldNames.join("\n");
  const snippetDialogTitle = snippetEditTarget
    ? `Edit ${snippetKindLabel(activeSnippetKind)} Snippet`
    : `Add ${snippetKindLabel(activeSnippetKind)} Snippet`;

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
    setEditIncludeFile("");
    setEditForm("");
    setEditFormFieldConfigs([]);
    setFormSelection(null);
    setEditDescription("");
    setAddErrors([]);
    setAddWarnings([]);
  }

  function openAddSnippetDialog() {
    if (!selectedEspansoPreview) {
      alert("Select a YAML config before adding a snippet.");
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
    setAddSnippetKind(editableSnippet.include_file ? "file" : editableSnippet.form !== undefined ? "form" : "text");
    setEditTriggersText(triggerInput.multiline);
    setEditReplace(editableSnippet.replace || "");
    setEditIncludeFile(target.match.resourcePath || editableSnippet.include_file || "");
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
    } else if (activeSnippetKind === "form") {
      snippet.form = editForm;
      const formFields = configsToFormFields(editFormFieldConfigs);
      if (formFields) {
        snippet.form_fields = formFields;
      }
    } else {
      snippet.replace = editReplace;
    }

    if (editDescription.trim()) {
      snippet.description = editDescription.trim();
    }

    return snippet;
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

  useEffect(() => {
    let active = true;

    async function validateSnippetForm() {
      if (!isAddSnippetOpen || !selectedEspansoPreview) {
        setAddErrors([]);
        setAddWarnings([]);
        return;
      }

      const hasAnyInput = editTriggersText.trim()
        || editReplace.trim()
        || editIncludeFile.trim()
        || editForm.trim()
        || editFormFieldConfigs.some((field) => field.defaultValue.trim() || field.valuesText.trim() || field.control !== "text")
        || editDescription.trim();
      if (!hasAnyInput) {
        setAddErrors([]);
        setAddWarnings([]);
        return;
      }

      let snippet: Snippet;
      try {
        snippet = buildFormSnippet();
      } catch (e: any) {
        if (!active) return;
        setAddErrors([{ message: e?.message || String(e) }]);
        setAddWarnings([]);
        return;
      }
      const snippetsForValidation = snippetEditTarget
        ? snippetEditTarget.preview.importedMatches
          .filter((match) => match.originalMatchIndex !== snippetEditTarget.match.originalMatchIndex)
          .map((match) => match.snippet)
        : selectedEspansoPreview.snippets;
      const result = await validate({
        version: 1,
        snippets: [...snippetsForValidation, snippet],
      });

      if (!active) return;
      setAddErrors(result.errors);
      setAddWarnings(result.warnings);
    }

    validateSnippetForm();
    return () => {
      active = false;
    };
  }, [activeSnippetKind, editTriggersText, editReplace, editIncludeFile, editForm, editFormFieldConfigs, editDescription, isAddSnippetOpen, selectedEspansoPreview, snippetEditTarget]);

  async function chooseSnippetFile() {
    const selected = await openDialog({
      multiple: false,
      directory: false,
    });

    if (typeof selected === "string") {
      setEditIncludeFile(selected);
    } else if (Array.isArray(selected) && typeof selected[0] === "string") {
      setEditIncludeFile(selected[0]);
    }
  }

  async function saveSnippetToYaml() {
    const targetPreview = snippetEditTarget?.preview || selectedEspansoPreview;
    if (!targetPreview || isSavingSnippet) return;
    if (addErrors.length > 0) {
      alert("Please fix validation errors before saving.");
      return;
    }

    setIsSavingSnippet(true);
    try {
      const snippet = buildFormSnippet();
      const content = await readTextFile(targetPreview.config.path);
      const updatedContent = snippetEditTarget
        ? replaceSnippetInYamlContent(content, snippetEditTarget.match.originalMatchIndex, snippet)
        : appendSnippetToYamlContent(content, snippet);
      await writeTextFile(targetPreview.config.path, updatedContent);
      // Espanso has its own hot-reload path for match files. Keep restart disabled
      // while testing which edits actually require the more expensive CLI restart.
      setIsAddSnippetOpen(false);
      resetSnippetForm();
      setSnippetEditTarget(null);
      await scanDefaultEspansoConfigDir();
      setSelectedEspansoConfigPath(targetPreview.config.path);
    } catch (e: any) {
      alert(`Failed to save snippet: ${e?.message || e}`);
    } finally {
      setIsSavingSnippet(false);
    }
  }

  async function deleteSnippetFromYaml(target: SnippetEditTarget) {
    const triggers = getSnippetTriggers(target.match.originalSnippet || target.match.snippet);
    const displayTrigger = triggers.length > 0 ? triggers.join(", ") : `Snippet ${target.displayIndex + 1}`;
    const confirmed = window.confirm(`Delete ${displayTrigger} from ${target.preview.config.relativePath}?`);
    if (!confirmed) return;

    try {
      const content = await readTextFile(target.preview.config.path);
      const updatedContent = deleteSnippetFromYamlContent(content, target.match.originalMatchIndex);
      await writeTextFile(target.preview.config.path, updatedContent);
      // Espanso has its own hot-reload path for match files. Keep restart disabled
      // while testing which edits actually require the more expensive CLI restart.
      setIsAddSnippetOpen(false);
      resetSnippetForm();
      setSnippetEditTarget(null);
      await scanDefaultEspansoConfigDir();
      setSelectedEspansoConfigPath(target.preview.config.path);
    } catch (e: any) {
      alert(`Failed to delete snippet: ${e?.message || e}`);
    }
  }

  async function openYamlFileInDefaultApp(path: string) {
    try {
      await openPath(path);
    } catch (e: any) {
      alert(`Failed to open YAML file: ${e?.message || e}`);
    }
  }

  return (
    <div className="app-shell">
      {isDragging && (
        <div className="drag-overlay">
          <div className="drag-zone">
            <Upload className="mb-5 h-12 w-12" />
            <div className="text-xl font-semibold">
              {isAddSnippetOpen && addSnippetKind === "file" ? "Drop file here" : "Drop YAML file here"}
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              {isAddSnippetOpen && addSnippetKind === "file"
                ? "Dropped files are used as the snippet source."
                : "Dropped YAML files are previewed and edited directly."}
            </div>
          </div>
        </div>
      )}

      <main className="flex h-full w-full overflow-hidden bg-[linear-gradient(180deg,hsl(var(--background))_0%,hsl(var(--secondary))_100%)] p-4">
        <Card className="flex h-full w-full flex-col p-4">
          <CardContent className="flex min-h-0 flex-1 flex-col p-0">
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={scanDefaultEspansoConfigDir}
                disabled={isScanningEspanso}
                aria-label="Refresh YAML configs"
                title="Refresh YAML configs"
              >
                <RefreshCw className={cn("h-4 w-4", isScanningEspanso && "animate-spin")} />
                Refresh
              </Button>
              <Button variant="outline" onClick={() => setIsSettingsOpen(true)}>
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
                      <span className="text-muted-foreground">{espansoPreviewTotals.forms} forms</span>
                      {espansoPreviewTotals.warnings > 0 && (
                        <span className="text-amber-700">{espansoPreviewTotals.warnings} warnings</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={scanDefaultEspansoConfigDir}
                        disabled={isScanningEspanso}
                        aria-label="Refresh YAML configs"
                        title="Refresh YAML configs"
                      >
                        <RefreshCw className={cn("h-4 w-4", isScanningEspanso && "animate-spin")} />
                        Refresh
                      </Button>
                      <Button size="sm" onClick={openAddSnippetDialog} disabled={!selectedEspansoPreview}>
                        <Plus className="h-4 w-4" />
                        Add Snippet
                      </Button>
                    </div>
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
                              onSelect={setSelectedEspansoConfigPath}
                              onOpenFile={openYamlFileInDefaultApp}
                            />
                          ))}
                        </div>
                      </ScrollArea>
                    </aside>

                    <section className="flex min-h-0 min-w-0 flex-col">
                      {selectedEspansoPreview ? (
                        <EspansoConfigDetail
                          preview={selectedEspansoPreview}
                          onViewSnippet={(match, index) =>
                            openEditSnippetDialog({
                              preview: selectedEspansoPreview,
                              match,
                              displayIndex: index,
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
                      onClick={scanDefaultEspansoConfigDir}
                    >
                      <RefreshCw className="h-4 w-4" />
                      Scan Default Espanso Directory
                    </Button>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </main>

      <Dialog open={isAddSnippetOpen} onOpenChange={(open) => {
        setIsAddSnippetOpen(open);
        if (!open) {
          resetSnippetForm();
          setSnippetEditTarget(null);
        }
      }}>
        <DialogContent
          className={cn(
            "grid max-h-[calc(100vh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden",
            snippetEditTarget
              ? "h-[min(50rem,calc(100vh-2rem))] w-[50vw] min-w-[min(42rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)]"
              : "h-[min(50rem,calc(100vh-2rem))] max-w-2xl",
          )}
        >
          <DialogHeader>
            <DialogTitle>{snippetDialogTitle}</DialogTitle>
            <DialogDescription className="break-all">
              {snippetEditTarget?.preview.config.relativePath || selectedEspansoPreview?.config.relativePath || "Select a YAML file"}
              {snippetEditTarget ? ` · Snippet #${snippetEditTarget.displayIndex + 1}` : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 space-y-5 overflow-auto pr-1">
            {(addErrors.length > 0 || addWarnings.length > 0) && (
              <div
                className={cn(
                  "space-y-2 rounded-lg border p-4 text-sm",
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
                {addWarnings.map((w, idx) => (
                  <div key={`warn-${idx}`} className="flex gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="trigger-0">Trigger</Label>
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
                        title="Remove trigger"
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
                  Add Trigger Alias
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-3 rounded-md border bg-secondary/60 p-1">
              <Button
                type="button"
                variant={activeSnippetKind === "text" ? "secondary" : "ghost"}
                className="h-8"
                onClick={() => setAddSnippetKind("text")}
              >
                Text
              </Button>
              <Button
                type="button"
                variant={activeSnippetKind === "file" ? "secondary" : "ghost"}
                className="h-8"
                onClick={() => setAddSnippetKind("file")}
              >
                File
              </Button>
              <Button
                type="button"
                variant={activeSnippetKind === "form" ? "secondary" : "ghost"}
                className="h-8"
                onClick={() => setAddSnippetKind("form")}
              >
                Form
              </Button>
            </div>

            {activeSnippetKind === "file" ? (
              <div className="space-y-3">
                <Label htmlFor="include-file">File</Label>
                <div
                  className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-md border border-dashed bg-secondary/30 p-5 text-center"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    const droppedFile = event.dataTransfer.files[0];
                    const droppedPath = droppedFile ? (droppedFile as File & { path?: string }).path : "";
                    if (droppedPath) {
                      setEditIncludeFile(droppedPath);
                    }
                  }}
                >
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <div className="w-full space-y-2">
                    <Input
                      id="include-file"
                      className="mono-field"
                      placeholder="Choose or drop a file path..."
                      value={editIncludeFile}
                      onChange={(e) => setEditIncludeFile(e.target.value)}
                    />
                    <Button type="button" variant="outline" onClick={chooseSnippetFile}>
                      <FileSearch className="h-4 w-4" />
                      Choose File
                    </Button>
                  </div>
                </div>
              </div>
            ) : activeSnippetKind === "form" ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="form">Form Layout</Label>
                  <Textarea
                    id="form"
                    ref={formTextareaRef}
                    className="mono-field min-h-44 resize-y"
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
                  <div className="space-y-2 rounded-md border bg-secondary/25 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Label>Selected Text Action</Label>
                      <span className="max-w-full truncate text-xs text-muted-foreground">
                        {formSelection ? formSelection.text.trim() : "Select text in the form layout"}
                      </span>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-4">
                      {([
                        ["text", "Single-line Text", Type],
                        ["multiline", "Multiline Text", AlignLeft],
                        ["choice", "Choice Box", ListChecks],
                        ["list", "List Box", List],
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
                </div>
                {editFormFieldConfigs.length > 0 && (
                  <div className="space-y-3">
                    <Label>Fields</Label>
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
                            Undo
                          </Button>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-3">
                          {([
                            ["text", "Text Fields"],
                            ["choice", "Choice Box"],
                            ["list", "List Box"],
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
                              <Label>Text Field Shape</Label>
                              <div className="grid grid-cols-2 gap-2">
                                {([
                                  ["single", "Single-line"],
                                  ["multiline", "Multiline"],
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
                              <Label htmlFor={`form-field-default-${fieldIndex}`}>Default</Label>
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
                              <Label htmlFor={`form-field-default-${fieldIndex}`}>Default</Label>
                              <Input
                                id={`form-field-default-${fieldIndex}`}
                                value={field.defaultValue}
                                onChange={(event) => updateFormFieldConfig(field.id, { defaultValue: event.target.value })}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor={`form-field-values-${fieldIndex}`}>Values</Label>
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
          </div>

          <DialogFooter className={cn(snippetEditTarget && "sm:justify-between")}>
            {snippetEditTarget && (
              <Button
                variant="destructive"
                onClick={() => deleteSnippetFromYaml(snippetEditTarget)}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => setIsAddSnippetOpen(false)}>
                Cancel
              </Button>
              <Button onClick={saveSnippetToYaml} disabled={isSavingSnippet}>
                {isSavingSnippet ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {snippetEditTarget ? "Update YAML" : "Save to YAML"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
            <DialogDescription>Scan the default Espanso match directory.</DialogDescription>
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
          </div>
          <DialogFooter>
            <Button onClick={() => setIsSettingsOpen(false)}>Done</Button>
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

function buildEspansoConfigPreviewTree(previews: EspansoConfigPreview[]): EspansoConfigPreviewTreeNode[] {
  const root: EspansoConfigPreviewTreeNode[] = [];

  function getOrCreateDir(
    nodes: EspansoConfigPreviewTreeNode[],
    name: string,
    path: string,
  ): EspansoConfigPreviewTreeNode {
    const existing = nodes.find((node) => node.isDir && node.path === path);
    if (existing) return existing;

    const dir: EspansoConfigPreviewTreeNode = {
      name,
      path,
      isDir: true,
      snippetCount: 0,
      fileCount: 0,
      children: [],
    };
    nodes.push(dir);
    nodes.sort((a, b) => Number(a.isDir !== b.isDir) || a.name.localeCompare(b.name));
    return dir;
  }

  for (const preview of previews) {
    const parts = preview.config.relativePath.split("/");
    let currentNodes = root;
    let currentPath = "";

    parts.forEach((part, index) => {
      const isLast = index === parts.length - 1;
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      if (isLast) {
        currentNodes.push({
          name: part,
          path: currentPath,
          isDir: false,
          snippetCount: preview.snippetCount,
          fileCount: 1,
          preview,
        });
        currentNodes.sort((a, b) => Number(a.isDir !== b.isDir) || a.name.localeCompare(b.name));
      } else {
        const dir = getOrCreateDir(currentNodes, part, currentPath);
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
}

const EspansoConfigTreeNode = memo(function EspansoConfigTreeNode({
  node,
  activePath,
  activeAncestorPaths,
  onSelect,
  onOpenFile,
}: EspansoConfigTreeNodeProps) {
  const containsActive = activeAncestorPaths.has(node.path);
  const [isOpen, setIsOpen] = useState<boolean>(containsActive);

  useEffect(() => {
    if (containsActive) {
      setIsOpen(true);
    }
  }, [containsActive]);

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
                onOpenFile={onOpenFile}
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
        "group flex w-full items-center rounded-md transition-colors hover:bg-accent",
        isActive && "bg-primary text-primary-foreground hover:bg-primary/90",
      )}
    >
      <button
        className="flex min-w-0 flex-1 items-center gap-3 rounded-l-md px-3 py-2 text-left"
        onClick={() => node.preview && onSelect(node.preview.config.path)}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-background/80 text-primary">
          <FileText className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{node.name.replace(/\.ya?ml$/i, "")}</div>
        </div>
      </button>
      {node.preview && (
        <button
          className={cn(
            "mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md opacity-70 transition hover:bg-background/80 hover:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            isActive && "hover:bg-primary-foreground/20",
          )}
          title={`Open ${node.name} in default app`}
          onClick={() => onOpenFile(node.preview!.config.path)}
        >
          <SquareArrowOutUpRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
});

interface EspansoConfigDetailProps {
  preview: EspansoConfigPreview;
  onViewSnippet: (match: ImportedMatch, index: number) => void;
}

function EspansoConfigDetail({ preview, onViewSnippet }: EspansoConfigDetailProps) {
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
        {preview.warningCount > 0 && (
          <span className="shrink-0 rounded-md bg-amber-100 px-2 py-1 text-xs text-amber-800">
            {preview.warningCount} warnings
          </span>
        )}
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
                const triggers = getSnippetTriggers(snippet);
                const displayTrigger = triggers.length > 0 ? triggers.join(", ") : `Snippet ${index + 1}`;
                const snippetKind = snippet.include_file ? "file" : snippet.form !== undefined ? "form" : "text";
                const snippetPreview = snippet.include_file
                  ? `include: ${snippet.include_file}`
                  : snippet.form !== undefined
                    ? snippet.form || "Empty form"
                    : snippet.replace || "Empty replacement";

                return (
                  <button
                    key={`${triggers.join("-")}-${index}`}
                    className="grid h-9 w-full grid-cols-[minmax(8rem,1.1fr)_3rem_minmax(6rem,0.65fr)_minmax(12rem,2fr)_2.25rem] items-center px-3 text-left text-sm transition-colors hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    onClick={() => onViewSnippet(preview.importedMatches[index] || { snippet, originalMatchIndex: index }, index)}
                    title={`View details for ${displayTrigger}`}
                  >
                    <div className="min-w-0 pr-3">
                      <div className="truncate font-medium">
                        {snippet.description || displayTrigger}
                      </div>
                    </div>
                    <div className="flex justify-center">
                      <span
                        className={cn(
                          "h-4 w-4 rounded",
                          snippetKind === "file" && "bg-primary/70",
                          snippetKind === "form" && "bg-emerald-500/70",
                          snippetKind === "text" && "bg-muted-foreground/35",
                        )}
                        title={snippetKind === "file" ? "External file snippet" : snippetKind === "form" ? "Form snippet" : "Inline replacement snippet"}
                      />
                    </div>
                    <div className="mono-field min-w-0 truncate pr-3 text-sm">{displayTrigger}</div>
                    <div className="min-w-0 truncate text-muted-foreground">
                      {snippetPreview}
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
