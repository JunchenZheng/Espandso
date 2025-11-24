import { useState, useCallback, useMemo, useEffect } from "react";
import { readYamlFile, writeYamlFile } from "../../../repositories/snippetYamlRepository";
import {
  DeleteTriggerSelection,
  deleteSelectedTriggersFromYamlContent,
  findDeleteSelectionLineRangesInYaml,
  findSnippetLineRangeInYaml,
} from "../../../logic/yamlEditor";
import { importYamlContent, ImportedMatch } from "../../../logic/importYaml";
import { EspansoConfigPreview } from "../../espanso-configs/types";
import { EspansoConfigFile } from "../../../logic/espansoPaths";
import { SnippetEditTarget } from "../types";

export interface UseVisualYamlEditorProps {
  selectedEspansoPreview: EspansoConfigPreview | null;
  snippetEditTarget: SnippetEditTarget | null;
  espansoConfigs: EspansoConfigFile[];
  espansoMatchDir: string;
  loadEspansoConfigPreview: (config: EspansoConfigFile) => Promise<unknown>;
  setSelectedEspansoConfigPath: (path: string) => void;
  t: (key: string, options?: any) => string;
}

export function useVisualYamlEditor({
  selectedEspansoPreview,
  snippetEditTarget,
  espansoConfigs,
  espansoMatchDir,
  loadEspansoConfigPreview,
  setSelectedEspansoConfigPath,
  t,
}: UseVisualYamlEditorProps) {
  const [isVisualEditorOpen, setIsVisualEditorOpen] = useState<boolean>(false);
  const [visualEditorYamlContent, setVisualEditorYamlContent] = useState<string>("");
  const [isLoadingVisualEditorYaml, setIsLoadingVisualEditorYaml] = useState<boolean>(false);
  const [visualEditorMode, setVisualEditorMode] = useState<"add" | "delete">("add");
  const [visualEditorOriginalYaml, setVisualEditorOriginalYaml] = useState<string>("");
  const [pendingDeleteSelections, setPendingDeleteSelections] = useState<DeleteTriggerSelection[]>([]);
  const [deleteSearchQuery, setDeleteSearchQuery] = useState<string>("");
  const [highlightedLineRange, setHighlightedLineRange] = useState<{ startLine: number; endLine: number } | null>(null);

  const activeVisualEditorPreview = snippetEditTarget?.preview || selectedEspansoPreview;

  const loadVisualEditorYaml = useCallback(async (pathOverride?: string, matchIndexToHighlight?: number) => {
    const targetPath = pathOverride || activeVisualEditorPreview?.config.path;
    if (!targetPath) return;
    setIsLoadingVisualEditorYaml(true);
    try {
      const content = await readYamlFile(targetPath);
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
  }, [activeVisualEditorPreview, t]);

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

  const visualEditorMatches: ImportedMatch[] = useMemo(() => {
    if (!visualEditorOriginalYaml) return [];
    const relPath = activeVisualEditorPreview?.config.relativePath || "file.yml";
    const res = importYamlContent(visualEditorOriginalYaml, relPath);
    return res.importedMatches;
  }, [visualEditorOriginalYaml, activeVisualEditorPreview]);

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

  useEffect(() => {
    if (isVisualEditorOpen && highlightedLineRange) {
      const lineEl = document.getElementById(`ve-yaml-line-${highlightedLineRange.startLine}`);
      if (lineEl) {
        lineEl.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [isVisualEditorOpen, highlightedLineRange, visualEditorYamlContent]);

  const applyPendingDeleteWorkflow = useCallback(async () => {
    const targetPath = activeVisualEditorPreview?.config.path;
    if (!targetPath) {
      return false;
    }

    if (pendingDeleteSelections.length === 0) {
      setIsVisualEditorOpen(false);
      return true;
    }

    await writeYamlFile(targetPath, visualEditorYamlContent, espansoMatchDir || undefined);
    setPendingDeleteSelections([]);
    const targetConfig = espansoConfigs.find((config) => config.path === targetPath);
    if (targetConfig) {
      await loadEspansoConfigPreview(targetConfig);
    }
    setSelectedEspansoConfigPath(targetPath);
    setIsVisualEditorOpen(false);
    return true;
  }, [
    activeVisualEditorPreview,
    pendingDeleteSelections,
    visualEditorYamlContent,
    espansoMatchDir,
    espansoConfigs,
    loadEspansoConfigPreview,
    setSelectedEspansoConfigPath,
  ]);

  return {
    isVisualEditorOpen,
    setIsVisualEditorOpen,
    visualEditorYamlContent,
    setVisualEditorYamlContent,
    isLoadingVisualEditorYaml,
    visualEditorMode,
    setVisualEditorMode,
    visualEditorOriginalYaml,
    setVisualEditorOriginalYaml,
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
  };
}
