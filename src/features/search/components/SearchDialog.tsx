import { useState, useEffect, useRef, useCallback } from "react";
import { Search, X, FileText, Check, Database, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { ScrollArea } from "../../../components/ui/scroll-area";
import { useI18n } from "../../../i18n/useI18n";
import {
  searchSnippets,
  SearchScope,
  SearchResult,
  SearchableConfigPreview,
} from "../../../logic/snippetSearch";
import { getSnippetTriggers } from "../../../logic/snippetUtils";
import { cn } from "../../../lib/utils";
import {
  searchSnippetIndex,
  SearchIndexStatus,
  SearchIndexResult,
} from "../../../tauri/searchIndex";

const SEARCH_PAGE_SIZE = 50;

export interface SearchDialogProps<T extends SearchableConfigPreview> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  previews: T[];
  matchDir?: string;
  onSelectResult: (result: SearchResult) => void;
}

export function SearchDialog<T extends SearchableConfigPreview>({
  open,
  onOpenChange,
  previews,
  matchDir,
  onSelectResult,
}: SearchDialogProps<T>) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<SearchScope>({
    trigger: true,
    description: true,
    content: true,
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [indexStatus, setIndexStatus] = useState<SearchIndexStatus | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const activeSearchIdRef = useRef(0);

  useEffect(() => {
    if (open) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    } else {
      setQuery("");
      setResults([]);
      setTotalResults(0);
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [open]);

  const toggleScope = (key: keyof SearchScope) => {
    setScope((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      if (!next.trigger && !next.description && !next.content) {
        return prev;
      }
      return next;
    });
  };

  const runSearch = useCallback(
    async (offset = 0, append = false) => {
      const trimmed = query.trim();
      if (!trimmed) {
        setResults([]);
        setTotalResults(0);
        setIsLoading(false);
        setIsLoadingMore(false);
        return;
      }

      if (!scope.trigger && !scope.description && !scope.content) {
        setResults([]);
        setTotalResults(0);
        setIsLoading(false);
        setIsLoadingMore(false);
        return;
      }

      const searchId = ++activeSearchIdRef.current;
      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }

      if (matchDir) {
        try {
          const resp = await searchSnippetIndex({
            matchDir,
            query: trimmed,
            scope,
            limit: SEARCH_PAGE_SIZE,
            offset,
          });

          if (searchId !== activeSearchIdRef.current) return;

          setIndexStatus(resp.indexStatus);

          const mapped: SearchResult[] = resp.results.map((r: SearchIndexResult) => ({
            filePath: r.filePath,
            fileRelativePath: r.fileRelativePath,
            filename: r.filename,
            snippet: r.snippet,
            snippetIndex: r.snippetIndex,
            originalMatchIndex: r.originalMatchIndex,
            triggerIndex: r.triggerIndex,
            matchedFields: r.matchedFields,
          }));

          setResults((current) => (append ? [...current, ...mapped] : mapped));
          setTotalResults(resp.total);
          setIsLoading(false);
          setIsLoadingMore(false);
          return;
        } catch (e) {
          console.warn("SQLite search failed, falling back to loaded preview search:", e);
        }
      }

      const fallbackRes = searchSnippets(previews, trimmed, scope);
      if (searchId !== activeSearchIdRef.current) return;
      setResults((current) =>
        append
          ? [...current, ...fallbackRes.slice(offset, offset + SEARCH_PAGE_SIZE)]
          : fallbackRes.slice(0, SEARCH_PAGE_SIZE),
      );
      setTotalResults(fallbackRes.length);
      setIsLoading(false);
      setIsLoadingMore(false);
    },
    [matchDir, previews, query, scope],
  );

  // Debounced search via SQLite index with pure TS fallback
  useEffect(() => {
    activeSearchIdRef.current += 1;
    const timer = setTimeout(() => {
      void runSearch(0, false);
    }, 150);

    return () => clearTimeout(timer);
  }, [runSearch]);

  const handleItemClick = (result: SearchResult) => {
    onSelectResult(result);
    onOpenChange(false);
  };

  const getIndexStatusText = () => {
    if (!indexStatus) return "";
    if (indexStatus.state === "indexing") {
      return t("search.indexingStatus");
    }
    if (indexStatus.state === "error") {
      return t("search.indexErrorStatus");
    }
    return t("search.indexedReadyStatus", {
      files: indexStatus.indexedFiles,
      matches: indexStatus.indexedMatches,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden border border-border/80 shadow-2xl">
        <DialogHeader className="p-4 pb-3 border-b bg-secondary/30">
          <DialogTitle className="flex items-center justify-between text-base font-semibold">
            <div className="flex items-center gap-2">
              <Search className="h-5 w-5 text-primary shrink-0" />
              <span>{t("search.title")}</span>
            </div>
            {indexStatus && (
              <div className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground bg-background/50 px-2 py-0.5 rounded border">
                <Database className="h-3.5 w-3.5 text-primary" />
                <span>{getIndexStatusText()}</span>
              </div>
            )}
          </DialogTitle>

          {/* Search Input Box */}
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("search.placeholder")}
              className="pl-9 pr-9 h-10 bg-background text-sm shadow-inner focus-visible:ring-primary/50"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Scope Selector Chips */}
          <div className="flex items-center justify-between mt-3 pt-2 text-xs">
            <span className="text-muted-foreground font-medium">{t("search.scopeTitle")}</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => toggleScope("trigger")}
                className={cn(
                  "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors cursor-pointer",
                  scope.trigger
                    ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 font-semibold"
                    : "bg-muted/40 border-transparent text-muted-foreground hover:bg-muted",
                )}
              >
                {scope.trigger && <Check className="h-3 w-3" />}
                {t("search.scopeTrigger")}
              </button>

              <button
                type="button"
                onClick={() => toggleScope("description")}
                className={cn(
                  "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors cursor-pointer",
                  scope.description
                    ? "bg-blue-500/15 border-blue-500/40 text-blue-700 dark:text-blue-300 font-semibold"
                    : "bg-muted/40 border-transparent text-muted-foreground hover:bg-muted",
                )}
              >
                {scope.description && <Check className="h-3 w-3" />}
                {t("search.scopeDescription")}
              </button>

              <button
                type="button"
                onClick={() => toggleScope("content")}
                className={cn(
                  "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors cursor-pointer",
                  scope.content
                    ? "bg-purple-500/15 border-purple-500/40 text-purple-700 dark:text-purple-300 font-semibold"
                    : "bg-muted/40 border-transparent text-muted-foreground hover:bg-muted",
                )}
              >
                {scope.content && <Check className="h-3 w-3" />}
                {t("search.scopeContent")}
              </button>
            </div>
          </div>
        </DialogHeader>

        {/* Results Body */}
        <ScrollArea className="max-h-[380px] min-h-[160px] p-2">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
              <Loader2 className="h-8 w-8 mb-2 animate-spin text-primary" />
              <p className="text-sm">{t("search.indexingStatus")}</p>
            </div>
          ) : query.trim() === "" ? (
            <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
              <Search className="h-10 w-10 mb-2 opacity-30 stroke-1" />
              <p className="text-sm">{t("search.placeholder")}</p>
            </div>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
              <X className="h-10 w-10 mb-2 opacity-30 stroke-1" />
              <p className="text-sm font-medium">{t("search.noResults")}</p>
            </div>
          ) : (
            <div className="space-y-1.5 p-1">
              <div className="px-2 py-1 text-xs text-muted-foreground font-medium">
                {t("search.resultsCount", { count: totalResults || results.length })}
              </div>

              {results.map((res) => {
                const triggers = getSnippetTriggers(res.snippet);
                const displayTrigger =
                  triggers.length > 0 ? triggers.join(", ") : `#${res.snippetIndex + 1}`;
                const previewText =
                  res.snippet.replace ||
                  res.snippet.form ||
                  res.snippet.image_path ||
                  res.snippet.include_file ||
                  "";

                return (
                  <button
                    key={`${res.filePath}-${res.snippetIndex}`}
                    type="button"
                    onClick={() => handleItemClick(res)}
                    className="w-full group flex flex-col gap-1.5 p-3 rounded-lg border border-transparent bg-background/60 hover:bg-accent/60 hover:border-accent transition-all text-left cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono font-semibold text-sm text-foreground bg-primary/10 text-primary px-2 py-0.5 rounded border border-primary/20 shrink-0">
                          {displayTrigger}
                        </span>
                        <span className="text-xs text-muted-foreground truncate flex items-center gap-1">
                          <FileText className="h-3.5 w-3.5 shrink-0 opacity-70" />
                          {res.fileRelativePath}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {res.matchedFields.includes("trigger") && (
                          <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                            {t("search.scopeTrigger")}
                          </span>
                        )}
                        {res.matchedFields.includes("description") && (
                          <span className="inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400">
                            {t("search.scopeDescription")}
                          </span>
                        )}
                        {res.matchedFields.includes("content") && (
                          <span className="inline-flex items-center rounded-full border border-purple-500/30 bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-medium text-purple-600 dark:text-purple-400">
                            {t("search.scopeContent")}
                          </span>
                        )}
                      </div>
                    </div>

                    {res.snippet.description && (
                      <p className="text-xs text-foreground/80 font-medium line-clamp-1">
                        {res.snippet.description}
                      </p>
                    )}

                    {previewText && (
                      <p className="text-xs text-muted-foreground font-mono bg-muted/30 p-1.5 rounded line-clamp-2 break-all">
                        {previewText}
                      </p>
                    )}
                  </button>
                );
              })}

              {results.length < totalResults && (
                <button
                  type="button"
                  onClick={() => void runSearch(results.length, true)}
                  disabled={isLoadingMore}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLoadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t("search.loadMore")}
                </button>
              )}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
