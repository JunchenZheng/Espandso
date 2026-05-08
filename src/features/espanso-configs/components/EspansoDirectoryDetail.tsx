import {
  ChevronRight,
  FileDown,
  FilePlus,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
} from "lucide-react";
import { Button } from "../../../components/ui/button";
import { ScrollArea } from "../../../components/ui/scroll-area";
import { useI18n } from "../../../i18n/useI18n";
import type { EspansoConfigPreviewTreeNode } from "../types";

export interface EspansoDirectoryDetailProps {
  node: EspansoConfigPreviewTreeNode;
  onSelectFile: (path: string) => void;
  onCreateFile: (parentRelPath?: string) => void;
  onCreateFolder: (parentRelPath?: string) => void;
  onOpenImportAlfred?: () => void;
}

export function EspansoDirectoryDetail({
  node,
  onSelectFile,
  onCreateFile,
  onCreateFolder,
  onOpenImportAlfred,
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
            <p className="text-xs text-muted-foreground mt-0.5">{t("filesystem.directory")}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {onOpenImportAlfred && (
            <Button
              size="sm"
              variant="outline"
              data-testid="directory-import-alfred-btn"
              onClick={onOpenImportAlfred}
              className="gap-1.5"
            >
              <FileDown className="h-4 w-4" />
              {t("actions.importAlfred")}
            </Button>
          )}
          <Button size="sm" onClick={() => onCreateFolder(node.relativePath)} className="gap-1.5">
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
        <div className="mx-auto w-full max-w-4xl space-y-4">
          <h3 className="text-sm font-semibold text-foreground">
            {t("filesystem.contentsIn", { name: node.name })}
          </h3>
          {!node.children || node.children.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center bg-muted/10">
              <Folder className="mx-auto mb-2 h-10 w-10 text-muted-foreground" />
              <p className="text-sm font-medium text-muted-foreground">
                {t("empty.directoryEmpty")}
              </p>
              <p className="mb-4 mt-1 text-xs text-muted-foreground">
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
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
