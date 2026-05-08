import { useCallback, useEffect, useState, type DragEvent } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { AlertCircle, FileArchive, Loader2, UploadCloud } from "lucide-react";
import { Button } from "../../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import { ScrollArea } from "../../../components/ui/scroll-area";
import { useI18n } from "../../../i18n/useI18n";
import { parseAlfredSnippetsZip, type ParsedAlfredSnippet } from "../../../logic/alfredImporter";

export interface ImportAlfredSnippetsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  configPaths: string[];
  defaultConfigPath?: string;
  targetDirectoryRelPath?: string;
  initialFilePath?: string | null;
  onImport: (
    selectedSnippets: ParsedAlfredSnippet[],
    targetConfigPath: string,
    sourceFileName: string,
  ) => Promise<void> | void;
}

export function ImportAlfredSnippetsDialog({
  isOpen,
  onClose,
  configPaths,
  defaultConfigPath,
  targetDirectoryRelPath,
  initialFilePath,
  onImport,
}: ImportAlfredSnippetsDialogProps) {
  const { t } = useI18n();

  const [fileName, setFileName] = useState<string | null>(null);
  const [parsedSnippets, setParsedSnippets] = useState<ParsedAlfredSnippet[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [targetConfigPath, setTargetConfigPath] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const isDirectoryTarget = targetDirectoryRelPath !== undefined;

  const handleProcessBuffer = useCallback(
    async (buffer: Uint8Array | ArrayBuffer, name: string) => {
      setIsLoading(true);
      setErrorMessage(null);
      setFileName(name);
      try {
        const snippets = await parseAlfredSnippetsZip(buffer);
        if (snippets.length === 0) {
          setErrorMessage(t("alfredImport.noSnippetsFound"));
          setParsedSnippets([]);
          setSelectedIds(new Set());
        } else {
          setParsedSnippets(snippets);
          setSelectedIds(new Set(snippets.map((s) => s.id)));
        }
      } catch {
        setErrorMessage(t("alfredImport.parseError"));
        setParsedSnippets([]);
        setSelectedIds(new Set());
      } finally {
        setIsLoading(false);
      }
    },
    [t],
  );

  // Initialize target path & reset state on dialog open
  useEffect(() => {
    if (isOpen) {
      setFileName(null);
      setParsedSnippets([]);
      setSelectedIds(new Set());
      setIsLoading(false);
      setIsImporting(false);
      setErrorMessage(null);
      setIsDragOver(false);

      const initialTarget =
        defaultConfigPath && configPaths.includes(defaultConfigPath)
          ? defaultConfigPath
          : configPaths[0] || "";
      setTargetConfigPath(initialTarget);

      if (initialFilePath) {
        const basename =
          initialFilePath.split("/").pop() || initialFilePath.split("\\").pop() || initialFilePath;
        setIsLoading(true);
        readFile(initialFilePath)
          .then((buffer) => handleProcessBuffer(buffer, basename))
          .catch(() => {
            setErrorMessage(t("alfredImport.parseError"));
            setIsLoading(false);
          });
      }
    }
  }, [isOpen, defaultConfigPath, configPaths, initialFilePath, handleProcessBuffer, t]);

  const handleFileDrop = useCallback(
    async (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        if (!file.name.toLowerCase().endsWith(".alfredsnippets")) {
          setErrorMessage(t("alfredImport.parseError"));
          return;
        }
        const buffer = await file.arrayBuffer();
        await handleProcessBuffer(buffer, file.name);
      }
    },
    [handleProcessBuffer, t],
  );

  const handleBrowseFile = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "Alfred Snippets", extensions: ["alfredsnippets"] }],
      });

      if (!selected) return;

      const pathStr = typeof selected === "string" ? selected : selected[0];
      if (!pathStr) return;

      const basename = pathStr.split("/").pop() || pathStr.split("\\").pop() || pathStr;
      setIsLoading(true);
      const data = await readFile(pathStr);
      await handleProcessBuffer(data, basename);
    } catch {
      setErrorMessage(t("alfredImport.parseError"));
      setIsLoading(false);
    }
  }, [handleProcessBuffer, t]);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === parsedSnippets.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(parsedSnippets.map((s) => s.id)));
    }
  }, [parsedSnippets, selectedIds.size]);

  const toggleSelectSnippet = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleConfirmImport = useCallback(async () => {
    if (selectedIds.size === 0 || (!isDirectoryTarget && !targetConfigPath) || !fileName) return;

    const toImport = parsedSnippets.filter((s) => selectedIds.has(s.id));
    setIsImporting(true);
    try {
      await onImport(toImport, targetConfigPath, fileName);
      onClose();
    } catch {
      setErrorMessage(t("alfredImport.parseError"));
    } finally {
      setIsImporting(false);
    }
  }, [selectedIds, isDirectoryTarget, targetConfigPath, fileName, parsedSnippets, onImport, onClose, t]);

  return (
    <Dialog open={isOpen} onOpenChange={(openState) => !openState && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-6">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">{t("alfredImport.title")}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {t("alfredImport.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 min-h-0 flex-1 my-2">
          {/* Dropzone & File Pick Area */}
          <div
            data-testid="alfred-dropzone"
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setIsDragOver(false);
            }}
            onDrop={handleFileDrop}
            onClick={handleBrowseFile}
            className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg transition-colors cursor-pointer text-center ${
              isDragOver
                ? "border-primary bg-primary/10"
                : fileName
                  ? "border-emerald-500/50 bg-emerald-500/5"
                  : "border-muted-foreground/30 hover:border-primary/50 bg-secondary/20"
            }`}
          >
            {isLoading ? (
              <div className="flex items-center gap-2 text-primary">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="text-sm font-medium">{t("alfredImport.parsingFile")}</span>
              </div>
            ) : fileName ? (
              <div className="flex items-center gap-3">
                <FileArchive className="h-8 w-8 text-emerald-500" />
                <div className="text-left">
                  <p className="text-sm font-semibold">{fileName}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("alfredImport.selectedCount", {
                      selected: selectedIds.size,
                      total: parsedSnippets.length,
                    })}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <UploadCloud className="h-10 w-10 text-muted-foreground" />
                <p className="text-sm font-medium">{t("alfredImport.dropzoneHint")}</p>
              </div>
            )}
          </div>

          {errorMessage && (
            <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/15 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Snippet Preview List */}
          {parsedSnippets.length > 0 && (
            <div className="flex flex-col border rounded-md min-h-0 flex-1 overflow-hidden bg-background">
              {/* Header */}
              <div className="grid grid-cols-[2.5rem_minmax(6rem,1fr)_minmax(10rem,2fr)_minmax(6rem,1fr)] items-center h-9 px-3 border-b bg-secondary/40 text-xs font-semibold text-muted-foreground">
                <div className="flex items-center justify-center">
                  <input
                    type="checkbox"
                    data-testid="alfred-select-all"
                    className="h-3.5 w-3.5 rounded border-emerald-500/50 text-emerald-600 focus:ring-emerald-500 cursor-pointer accent-emerald-600"
                    checked={selectedIds.size === parsedSnippets.length}
                    onChange={toggleSelectAll}
                  />
                </div>
                <div>{t("alfredImport.trigger")}</div>
                <div>{t("alfredImport.replace")}</div>
                <div>{t("alfredImport.name")}</div>
              </div>

              {/* Scrollable Snippets Table */}
              <ScrollArea className="min-h-0 flex-1">
                <div className="divide-y">
                  {parsedSnippets.map((snippet) => {
                    const isChecked = selectedIds.has(snippet.id);
                    return (
                      <div
                        key={snippet.id}
                        data-testid="alfred-snippet-row"
                        onClick={() => toggleSelectSnippet(snippet.id)}
                        className={`grid grid-cols-[2.5rem_minmax(6rem,1fr)_minmax(10rem,2fr)_minmax(6rem,1fr)] items-center min-h-9 px-3 py-1.5 text-sm transition-colors cursor-pointer hover:bg-secondary/30 ${
                          isChecked ? "bg-emerald-500/10" : ""
                        }`}
                      >
                        <div
                          className="flex items-center justify-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleSelectSnippet(snippet.id)}
                            className="h-3.5 w-3.5 rounded border-emerald-500/50 text-emerald-600 focus:ring-emerald-500 cursor-pointer accent-emerald-600"
                          />
                        </div>
                        <div className="font-mono text-xs font-semibold truncate pr-2">
                          {snippet.trigger || "-"}
                        </div>
                        <div className="truncate pr-2 text-xs text-foreground">
                          {snippet.replace}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {snippet.name || "-"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
                </div>
              )}

          {/* Target Config Selector */}
          {isDirectoryTarget ? (
            <div className="rounded-md border bg-secondary/30 px-3 py-2 text-sm">
              <div className="text-xs font-semibold text-muted-foreground">
                {t("alfredImport.targetDirectory")}
              </div>
              <div className="mt-1 font-mono text-xs text-foreground">
                {targetDirectoryRelPath ? `/${targetDirectoryRelPath}` : "/"}
              </div>
              {fileName && (
                <div className="mt-1 text-xs text-muted-foreground">
                  {t("alfredImport.createTargetFile", {
                    file: fileName.replace(/\.alfredsnippets$/iu, ".yml"),
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-md border bg-secondary/30 px-3 py-2 text-sm">
              <div className="text-xs font-semibold text-muted-foreground">
                {t("alfredImport.targetFile")}
              </div>
              <div
                data-testid="alfred-target-file"
                className="mt-1 truncate font-mono text-xs text-foreground"
              >
                {targetConfigPath || t("alfredImport.selectTargetFilePlaceholder")}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={onClose} disabled={isImporting}>
            {t("actions.cancel")}
          </Button>
          <Button
            data-testid="alfred-submit-btn"
            onClick={handleConfirmImport}
            disabled={selectedIds.size === 0 || (!isDirectoryTarget && !targetConfigPath) || isImporting}
          >
            {isImporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("alfredImport.importCount", { count: selectedIds.size })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
