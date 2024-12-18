import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { readTextFile, writeTextFile, exists } from "@tauri-apps/plugin-fs";
import { listen } from "@tauri-apps/api/event";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  FileSearch,
  FileText,
  Folder,
  FolderOpen,
  Pencil,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Settings,
  SquareArrowOutUpRight,
  Trash2,
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
import {
  getIncludeFileCandidates,
  resolveAndExecuteIncludeFileCommand,
} from "./logic/resolveIncludeFile";
import { buildTriggerInput, getSnippetTriggers, normalizeTriggerLines } from "./logic/snippetUtils";
import { appendSnippetToYamlContent, deleteSnippetFromYamlContent, replaceSnippetInYamlContent } from "./logic/yamlEditor";
import { EspansoConfigFile, EspansoPathSource, scanEspansoConfigFiles } from "./logic/espansoPaths";
import { restartEspanso, InstallResult } from "./tauri/espansoRuntime";
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
  match: ImportedMatch;
  sourceResourcePath?: string;
  sourceBaseDir?: string;
}

interface SnippetEditTarget {
  preview: EspansoConfigPreview;
  match: ImportedMatch;
  displayIndex: number;
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
  const [detailSnippet, setDetailSnippet] = useState<SnippetDetailData | null>(null);
  const [isAddSnippetOpen, setIsAddSnippetOpen] = useState<boolean>(false);
  const [snippetEditTarget, setSnippetEditTarget] = useState<SnippetEditTarget | null>(null);
  const [triggerMode, setTriggerMode] = useState<"single" | "multiple">("single");
  const [editTrigger, setEditTrigger] = useState<string>("");
  const [editTriggersText, setEditTriggersText] = useState<string>("");
  const [editReplace, setEditReplace] = useState<string>("");
  const [editDescription, setEditDescription] = useState<string>("");
  const [addErrors, setAddErrors] = useState<ValidationError[]>([]);
  const [addWarnings, setAddWarnings] = useState<string[]>([]);
  const [isSavingSnippet, setIsSavingSnippet] = useState<boolean>(false);
  const [consoleResult, setConsoleResult] = useState<InstallResult | null>(null);

  const buildEspansoConfigPreviews = useCallback(async (configs: EspansoConfigFile[]): Promise<EspansoConfigPreview[]> => {
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
  }, [buildEspansoConfigPreviews, espansoConfigs]);

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

  function resetSnippetForm() {
    setTriggerMode("single");
    setEditTrigger("");
    setEditTriggersText("");
    setEditReplace("");
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
    if (editableSnippet.include_file) {
      alert("External file snippets can be deleted, but only inline text snippets can be edited here.");
      return;
    }

    const triggerInput = buildTriggerInput(editableSnippet);
    setSnippetEditTarget(target);
    setTriggerMode(triggerInput.mode);
    setEditTrigger(triggerInput.single);
    setEditTriggersText(triggerInput.multiline);
    setEditReplace(editableSnippet.replace || "");
    setEditDescription(editableSnippet.description || "");
    setAddErrors([]);
    setAddWarnings([]);
    setDetailSnippet(null);
    setIsAddSnippetOpen(true);
  }

  function buildFormSnippet(): Snippet {
    const triggerFields =
      triggerMode === "multiple"
        ? { triggers: normalizeTriggerLines(editTriggersText) }
        : { trigger: editTrigger.trim() };

    const snippet: Snippet = {
      ...triggerFields,
      replace: editReplace,
    };

    if (editDescription.trim()) {
      snippet.description = editDescription.trim();
    }

    return snippet;
  }

  useEffect(() => {
    let active = true;

    async function validateSnippetForm() {
      if (!isAddSnippetOpen || !selectedEspansoPreview) {
        setAddErrors([]);
        setAddWarnings([]);
        return;
      }

      const hasAnyInput = editTrigger.trim() || editTriggersText.trim() || editReplace.trim() || editDescription.trim();
      if (!hasAnyInput) {
        setAddErrors([]);
        setAddWarnings([]);
        return;
      }

      const snippet = buildFormSnippet();
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
  }, [triggerMode, editTrigger, editTriggersText, editReplace, editDescription, isAddSnippetOpen, selectedEspansoPreview, snippetEditTarget]);

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
      const restartResult = await restartEspanso();
      setConsoleResult(restartResult);
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

  function showSnippetDetail(match: ImportedMatch, file: string, index: number, source?: Pick<SnippetDetailData, "sourceResourcePath" | "sourceBaseDir">) {
    setDetailSnippet({ snippet: match.snippet, file, index, match, ...source });
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
      const restartResult = await restartEspanso();
      setConsoleResult(restartResult);
      setDetailSnippet(null);
      await scanDefaultEspansoConfigDir();
      setSelectedEspansoConfigPath(target.preview.config.path);
    } catch (e: any) {
      alert(`Failed to delete snippet: ${e?.message || e}`);
    }
  }

  return (
    <div className="app-shell">
      {isDragging && (
        <div className="drag-overlay">
          <div className="drag-zone">
            <Upload className="mb-5 h-12 w-12" />
            <div className="text-xl font-semibold">Drop YAML file here</div>
            <div className="mt-2 text-sm text-muted-foreground">Dropped YAML files are previewed and edited directly.</div>
          </div>
        </div>
      )}

      <main className="flex h-full w-full overflow-hidden bg-[linear-gradient(180deg,hsl(var(--background))_0%,hsl(var(--secondary))_100%)] p-4">
        <Card className="flex h-full w-full flex-col p-4">
          <CardContent className="flex min-h-0 flex-1 flex-col p-0">
            <div className="flex justify-end">
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
                      {espansoPreviewTotals.warnings > 0 && (
                        <span className="text-amber-700">{espansoPreviewTotals.warnings} warnings</span>
                      )}
                    </div>
                    <Button size="sm" onClick={openAddSnippetDialog} disabled={!selectedEspansoPreview}>
                      <Plus className="h-4 w-4" />
                      Add Snippet
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
                              onSelect={setSelectedEspansoConfigPath}
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
                            showSnippetDetail(match, selectedEspansoPreview.config.relativePath, index, {
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
        <DialogContent className="max-h-[calc(100vh-2rem)] max-w-2xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>{snippetEditTarget ? "Edit Static Text Snippet" : "Add Static Text Snippet"}</DialogTitle>
            <DialogDescription className="break-all">
              {snippetEditTarget?.preview.config.relativePath || selectedEspansoPreview?.config.relativePath || "Select a YAML file"}
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
              <div className="flex items-center justify-between">
                <Label htmlFor="trigger">Trigger</Label>
                <div className="flex items-center space-x-1 rounded-md bg-muted p-1 text-xs">
                  <button
                    type="button"
                    className={cn(
                      "rounded px-2.5 py-1 font-medium transition-colors",
                      triggerMode === "single"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => {
                      if (!editTrigger && editTriggersText) {
                        setEditTrigger(editTriggersText.split("\n")[0] || "");
                      }
                      setTriggerMode("single");
                    }}
                  >
                    Single Trigger
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "rounded px-2.5 py-1 font-medium transition-colors",
                      triggerMode === "multiple"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => {
                      if (!editTriggersText && editTrigger) {
                        setEditTriggersText(editTrigger);
                      }
                      setTriggerMode("multiple");
                    }}
                  >
                    Multiple Triggers
                  </button>
                </div>
              </div>

              {triggerMode === "single" ? (
                <Input
                  id="trigger"
                  className="mono-field"
                  placeholder="e.g. :hello"
                  value={editTrigger}
                  onChange={(e) => setEditTrigger(e.target.value)}
                />
              ) : (
                <div className="space-y-2">
                  {(editTriggersText ? editTriggersText.split("\n") : [""]).map((line, idx, lines) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input
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
              )}
            </div>

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

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddSnippetOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveSnippetToYaml} disabled={isSavingSnippet}>
              {isSavingSnippet ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {snippetEditTarget ? "Update YAML" : "Save to YAML"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detailSnippet !== null} onOpenChange={(open) => !open && setDetailSnippet(null)}>
        <DialogContent className="max-h-[calc(100vh-2rem)] max-w-3xl overflow-hidden">
          {detailSnippet && selectedEspansoPreview && (
            <SnippetDetail
              detail={detailSnippet}
              onEdit={() => openEditSnippetDialog({
                preview: selectedEspansoPreview,
                match: detailSnippet.match,
                displayIndex: detailSnippet.index,
              })}
              onDelete={() => deleteSnippetFromYaml({
                preview: selectedEspansoPreview,
                match: detailSnippet.match,
                displayIndex: detailSnippet.index,
              })}
            />
          )}
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

      <Dialog open={consoleResult !== null} onOpenChange={(open) => !open && setConsoleResult(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{consoleResult?.success ? "Espanso restarted" : "Espanso restart issue"}</DialogTitle>
            <DialogDescription>{consoleResult?.message}</DialogDescription>
          </DialogHeader>
          {(consoleResult?.stdout || consoleResult?.stderr) && (
            <pre className="mono-field max-h-64 overflow-auto rounded-md border bg-secondary/40 p-3 text-xs">
              {consoleResult.stdout}
              {consoleResult.stderr}
            </pre>
          )}
          <DialogFooter>
            <Button onClick={() => setConsoleResult(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function getContainingDirectory(filePath: string): string {
  const parts = filePath.split(/[/\\]/);
  parts.pop();
  return parts.join("/");
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
}

const EspansoConfigTreeNode = memo(function EspansoConfigTreeNode({
  node,
  activePath,
  activeAncestorPaths,
  onSelect,
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
                          snippet.include_file ? "bg-primary/70" : "bg-muted-foreground/35",
                        )}
                        title={snippet.include_file ? "External file snippet" : "Inline replacement snippet"}
                      />
                    </div>
                    <div className="mono-field min-w-0 truncate pr-3 text-sm">{displayTrigger}</div>
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

interface SnippetDetailProps {
  detail: SnippetDetailData;
  onEdit: () => void;
  onDelete: () => void;
}

function SnippetDetail({ detail, onEdit, onDelete }: SnippetDetailProps) {
  const { snippet, file, index, sourceResourcePath, sourceBaseDir } = detail;
  const isExternalFile = Boolean(snippet.include_file);
  const content = isExternalFile ? snippet.include_file || "" : snippet.replace || "";
  const triggers = getSnippetTriggers(snippet);
  const displayTrigger = triggers.length > 0 ? triggers.join(", ") : "Untitled trigger";

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
          currentYamlFile: file,
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
  }, [isExternalFile, snippet.include_file, sourceResourcePath, sourceBaseDir, file]);

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
        <DialogTitle className="mono-field break-all text-primary">{displayTrigger}</DialogTitle>
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
                <span className="mono-field max-w-[320px] truncate text-[11px] text-muted-foreground/80" title={resolvedPath}>
                  {resolvedPath}
                </span>
              )}
            </div>
            <pre className="mono-field max-h-[16vh] overflow-auto whitespace-pre-wrap break-words p-3 text-sm leading-relaxed text-foreground">
              {isExternalFile
                ? loading
                  ? "Loading dynamic content..."
                  : error
                    ? content
                    : dynamicContent ?? content
                : content}
            </pre>
          </div>
        </div>

        {isExternalFile && (
          <div className="space-y-2 rounded-md border bg-secondary/20 p-3 text-xs text-muted-foreground">
            <div className="font-medium text-foreground">Dynamic resource resolution</div>
            {loading && <div>Executing file read command...</div>}
            {executedCmd && <div className="mono-field break-all">Command: {executedCmd}</div>}
            {error && <div className="text-destructive">{error}</div>}
            {!loading && !error && dynamicContent !== null && (
              <div className="text-emerald-700">Loaded dynamic content from resource file.</div>
            )}
            {getIncludeFileCandidates({
              includeFile: sourceResourcePath || snippet.include_file || "",
              baseDir: sourceBaseDir,
              currentYamlFile: file,
            }).length > 0 && (
              <div>
                <div className="mb-1 font-medium text-foreground">Candidates</div>
                <ul className="space-y-1">
                  {getIncludeFileCandidates({
                    includeFile: sourceResourcePath || snippet.include_file || "",
                    baseDir: sourceBaseDir,
                    currentYamlFile: file,
                  }).map((candidate) => (
                    <li key={candidate} className="mono-field break-all">{candidate}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      <DialogFooter>
        <Button
          variant="destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
          Delete
        </Button>
        <Button
          variant="outline"
          onClick={onEdit}
          disabled={isExternalFile}
          title={isExternalFile ? "External file snippets cannot be edited here" : "Edit snippet"}
        >
          <Pencil className="h-4 w-4" />
          Edit
        </Button>
        <Button
          variant="outline"
          onClick={() => copyToClipboard(isExternalFile ? dynamicContent ?? content : content)}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </DialogFooter>
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
