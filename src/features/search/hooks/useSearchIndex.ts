import { useCallback, useEffect, useState } from "react";
import type { SearchResult } from "../../../logic/snippetSearch";

export interface UseSearchIndexOptions {
  onSelectConfigPath?: (path: string) => void;
}

export function useSearchIndex(options: UseSearchIndexOptions = {}) {
  const { onSelectConfigPath } = options;
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [highlightedSnippetIndex, setHighlightedSnippetIndex] = useState<number | null>(null);

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

  const handleSelectSearchResult = useCallback(
    (result: SearchResult, overrideSelectPath?: (path: string) => void) => {
      const selectPath = overrideSelectPath || onSelectConfigPath;
      if (selectPath) {
        selectPath(result.filePath);
      }
      setHighlightedSnippetIndex(result.snippetIndex);

      setTimeout(() => {
        setHighlightedSnippetIndex((prev) => (prev === result.snippetIndex ? null : prev));
      }, 2500);
    },
    [onSelectConfigPath],
  );

  return {
    isSearchOpen,
    setIsSearchOpen,
    highlightedSnippetIndex,
    setHighlightedSnippetIndex,
    handleSelectSearchResult,
  };
}
