import { useCallback, useEffect, useRef, useState } from "react";
import { SEARCH_SHORTCUT_KEY } from "../../../logic/keyboardShortcut";
import type { SearchResult } from "../../../logic/snippetSearch";

export interface UseSearchIndexOptions {
  onSelectConfigPath?: (path: string) => void;
}

export function useSearchIndex(options: UseSearchIndexOptions = {}) {
  const { onSelectConfigPath } = options;
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [highlightedSnippetIndex, setHighlightedSnippetIndex] = useState<number | null>(null);
  const clearHighlightTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === SEARCH_SHORTCUT_KEY) {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    return () => {
      if (clearHighlightTimeoutRef.current !== null) {
        window.clearTimeout(clearHighlightTimeoutRef.current);
      }
    };
  }, []);

  const highlightSnippetIndex = useCallback((snippetIndex: number) => {
    setHighlightedSnippetIndex(snippetIndex);

    if (clearHighlightTimeoutRef.current !== null) {
      window.clearTimeout(clearHighlightTimeoutRef.current);
    }
    clearHighlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightedSnippetIndex((prev) => (prev === snippetIndex ? null : prev));
      clearHighlightTimeoutRef.current = null;
    }, 2500);
  }, []);

  const handleSelectSearchResult = useCallback(
    (result: SearchResult, overrideSelectPath?: (path: string) => void) => {
      const selectPath = overrideSelectPath || onSelectConfigPath;
      if (selectPath) {
        selectPath(result.filePath);
      }
      highlightSnippetIndex(result.snippetIndex);
    },
    [highlightSnippetIndex, onSelectConfigPath],
  );

  return {
    isSearchOpen,
    setIsSearchOpen,
    highlightedSnippetIndex,
    setHighlightedSnippetIndex,
    highlightSnippetIndex,
    handleSelectSearchResult,
  };
}
