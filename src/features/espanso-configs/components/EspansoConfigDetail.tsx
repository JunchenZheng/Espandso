import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Columns,
  Copy,
  FileDown,
  FileText,
  GitCompareArrows,
  ListChecks,
  Plus,
  Trash2,
} from "lucide-react";
import { EmptyState } from "../../../components/shared/EmptyState";
import { Button } from "../../../components/ui/button";
import { useI18n } from "../../../i18n/useI18n";
import { cn } from "../../../lib/utils";
import type { ImportedMatch } from "../../../logic/importYaml";
import { getSnippetTextContent, getSnippetTriggers } from "../../../logic/snippetUtils";
import type { EspansoConfigPreview } from "../types";

export interface EspansoConfigDetailProps {
  preview: EspansoConfigPreview;
  highlightedIndex?: number | null;
  deletingIndices?: Set<number>;
  onViewSnippet: (match: ImportedMatch, index: number) => void;
  onAddSnippet: () => void;
  onOpenTriggerConflicts?: () => void;
  triggerConflictCount?: number;
  onOpenVisualEditor?: () => void;
  onOpenImportAlfred?: () => void;
  onOpenWarnings?: (path: string) => void;
  onBatchDelete?: (matchIndices: number[], displayIndices: number[], onComplete: () => void) => void;
}

export function EspansoConfigDetail({
  preview,
  highlightedIndex,
  deletingIndices,
  onViewSnippet,
  onAddSnippet,
  onOpenTriggerConflicts,
  triggerConflictCount = 0,
  onOpenVisualEditor,
  onOpenImportAlfred,
  onOpenWarnings,
  onBatchDelete,
}: EspansoConfigDetailProps) {
  const { t } = useI18n();
  const ROW_HEIGHT = 36;
  const HEADER_HEIGHT = 36;
  // Use rem (not ch): header is text-xs and rows are text-sm, so ch-based tracks misalign.
  const previewGridColumns = "grid-cols-[7.5rem_5.5rem_minmax(0,1fr)_minmax(0,2fr)]";
  const batchPreviewGridColumns =
    "grid-cols-[2.25rem_7.5rem_5.5rem_minmax(0,1fr)_minmax(0,2fr)]";
  const previewGridClassName = "grid items-center gap-x-4 px-3";

  const OVERSCAN_ROWS = 8;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState(false);
  const snippetCount = preview.snippets.length;
  const totalHeight = snippetCount * ROW_HEIGHT;
  const contentScrollTop = Math.max(0, scrollTop - HEADER_HEIGHT);

  useEffect(() => {
    if (highlightedIndex !== undefined && highlightedIndex !== null && highlightedIndex >= 0) {
      const targetScrollTop = Math.max(0, HEADER_HEIGHT + highlightedIndex * ROW_HEIGHT - 60);
      setScrollTop(targetScrollTop);
      if (scrollRef.current) {
        scrollRef.current.scrollTop = targetScrollTop;
      }
    }
  }, [highlightedIndex, ROW_HEIGHT, HEADER_HEIGHT]);

  const startIndex = Math.max(0, Math.floor(contentScrollTop / ROW_HEIGHT) - OVERSCAN_ROWS);
  const visibleRowCount =
    Math.ceil(Math.max(viewportHeight - HEADER_HEIGHT, ROW_HEIGHT) / ROW_HEIGHT) + OVERSCAN_ROWS * 2;
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
                  const displayIndices = Array.from(selectedIndices).sort((a, b) => a - b);
                  const originalIndices = displayIndices.map((idx) => {
                    return preview.importedMatches[idx]?.originalMatchIndex ?? idx;
                  });
                  onBatchDelete?.(originalIndices, displayIndices, exitBatchMode);
                }}
              >
                <Trash2 className="h-4 w-4" />
                {t("actions.batchDelete", { count: selectedIndices.size })}
              </Button>
            </>
          ) : (
            <>
              {onOpenTriggerConflicts && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onOpenTriggerConflicts}
                  title={t("actions.triggerConflictsTitle", { count: triggerConflictCount })}
                >
                  <GitCompareArrows className="h-4 w-4" />
                  {t("actions.triggerConflicts")}
                  {triggerConflictCount > 0 && (
                    <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-800">
                      {triggerConflictCount}
                    </span>
                  )}
                </Button>
              )}
              {onOpenVisualEditor && (
                <Button size="sm" variant="outline" onClick={onOpenVisualEditor}>
                  <Columns className="h-4 w-4" />
                  {t("actions.visualEditor")}
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => setIsBatchMode(true)}>
                <ListChecks className="h-4 w-4" />
                {t("actions.batchSelect")}
              </Button>
              {onOpenImportAlfred && (
                <Button
                  size="sm"
                  variant="outline"
                  data-testid="import-alfred-btn"
                  onClick={onOpenImportAlfred}
                >
                  <FileDown className="h-4 w-4" />
                  {t("actions.importAlfred")}
                </Button>
              )}
              <Button size="sm" onClick={onAddSnippet}>
                <Plus className="h-4 w-4" />
                {t("actions.addSnippet")}
              </Button>
            </>
          )}
        </div>
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-auto"
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      >
        <div
          className={cn(
            previewGridClassName,
            "sticky top-0 z-10 h-9 border-b bg-secondary/40 text-xs font-semibold text-muted-foreground",
            isBatchMode ? batchPreviewGridColumns : previewGridColumns,
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
          <div className="min-w-0 truncate">{t("table.trigger")}</div>
          <div className="flex min-w-0 items-center gap-1.5">
            <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 opacity-0" />
            <span className="truncate">{t("table.type")}</span>
          </div>
          <div className="min-w-0 truncate">{t("table.description")}</div>
          <div className="min-w-0 truncate">{t("table.content")}</div>
        </div>

        {preview.snippets.length > 0 ? (
          <div className="relative divide-y" style={{ height: totalHeight }}>
            <div
              className="absolute inset-x-0 top-0 divide-y"
              style={{ transform: `translateY(${startIndex * ROW_HEIGHT}px)` }}
            >
              {visibleSnippets.map((snippet, offset) => {
                const index = startIndex + offset;
                const triggers = getSnippetTriggers(snippet);
                const displayTrigger =
                  triggers.length > 0
                    ? triggers.join(", ")
                    : t("snippets.snippetNumber", { number: index + 1 });
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
                      : getSnippetTextContent(snippet) || t("snippets.emptyReplacement");

                const isSelected = selectedIndices.has(index);
                const isHighlighted = highlightedIndex === index;
                const isDeleting = deletingIndices?.has(index) ?? false;

                return (
                  <button
                    key={`${triggers.join("-")}-${index}`}
                    data-testid="snippet-row"
                    data-snippet-index={index}
                    data-snippet-trigger={displayTrigger}
                    className={cn(
                      previewGridClassName,
                      "h-9 w-full text-left text-sm transition-all hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                      isBatchMode ? batchPreviewGridColumns : previewGridColumns,
                      isSelected &&
                        "bg-emerald-500/15 hover:bg-emerald-500/20 shadow-[inset_2px_0_0_0_rgb(16_185_129)]",
                      isHighlighted &&
                        "bg-emerald-500/20 hover:bg-emerald-500/30 font-semibold ring-1 ring-emerald-500/50 animate-pulse shadow-[inset_4px_0_0_0_rgb(16_185_129)]",
                      isDeleting &&
                        "bg-red-500/20 hover:bg-red-500/30 font-semibold ring-1 ring-red-500/50 animate-pulse shadow-[inset_4px_0_0_0_rgb(239_68_68)]",
                    )}
                    onClick={() => {
                      if (isDeleting) {
                        return;
                      }
                      if (isBatchMode) {
                        toggleSelectIndex(index);
                      } else {
                        onViewSnippet(
                          preview.importedMatches[index] || { snippet, originalMatchIndex: index },
                          index,
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
                          data-testid="batch-select-all"
                          type="checkbox"
                          readOnly
                          className="h-3.5 w-3.5 rounded border-emerald-500/50 text-emerald-600 focus:ring-emerald-500 accent-emerald-600"
                          checked={isSelected}
                        />
                      </div>
                    )}
                    <div className="mono-field min-w-0 truncate text-sm font-medium">
                      {displayTrigger}
                    </div>
                    <div className="flex min-w-0 items-center gap-1.5">
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
                    <div className="min-w-0 truncate text-muted-foreground">
                      {snippet.description || ""}
                    </div>
                    <div className="min-w-0 truncate text-muted-foreground">{snippetPreview}</div>
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
