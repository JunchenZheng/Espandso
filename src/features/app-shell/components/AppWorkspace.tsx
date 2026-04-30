import type { CSSProperties, PointerEvent, RefObject } from "react";
import { FilePlus, FileText, FolderOpen, FolderPlus, Loader2, RefreshCw } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { ScrollArea } from "../../../components/ui/scroll-area";
import { EmptyState } from "../../../components/shared/EmptyState";
import { useI18n } from "../../../i18n/useI18n";
import { cn } from "../../../lib/utils";
import { EspansoConfigDetail } from "../../espanso-configs/components/EspansoConfigDetail";
import { EspansoConfigTreeNode } from "../../espanso-configs/components/EspansoConfigTreeNode";
import { EspansoDirectoryDetail } from "../../espanso-configs/components/EspansoDirectoryDetail";
import type {
  EspansoConfigPreview,
  EspansoConfigPreviewTreeNode,
} from "../../espanso-configs/types";
import type { SnippetEditTarget } from "../../snippets/types";
import { AppHeader } from "./AppHeader";

interface AppWorkspaceProps {
  espansoMatchDir: string | null;
  espansoConfigsCount: number;
  espansoPreviewTree: EspansoConfigPreviewTreeNode[];
  selectedEspansoConfigPath: string;
  selectedEspansoPreview: EspansoConfigPreview | null;
  selectedDirectoryNode: EspansoConfigPreviewTreeNode | null;
  activeDirectoryRelPath: string;
  activeEspansoAncestorPaths: Set<string>;
  collectionPaneWidth: number;
  isCollectionResizing: boolean;
  isScanningEspanso: boolean;
  isLoadingSelectedPreview: boolean;
  isSelectedPreviewLoaded: boolean;
  selectedPreviewError: string;
  espansoScanMessage: string;
  highlightedSnippetIndex: number | null;
  updatedSnippetIndex: number | null;
  deletingSnippetIndices: Set<number>;
  mainSplitRef: RefObject<HTMLDivElement | null>;
  onOpenSearch: () => void;
  onRefresh: () => void;
  onOpenLogs: () => void;
  onOpenSettings: () => void;
  onSelectConfigPath: (path: string) => void;
  onOpenYamlFile: (path: string) => void;
  onCreateFile: (parentRelPath?: string) => void;
  onCreateFolder: (parentRelPath?: string) => void;
  onOpenSnippet: (target: SnippetEditTarget) => void;
  onAddSnippet: () => void;
  onOpenTriggerConflicts: () => void;
  triggerConflictCount: number;
  onOpenVisualEditor: () => void;
  onOpenImportAlfred?: () => void;
  onOpenWarnings: (path: string) => void;
  onBatchDelete: (matchIndices: number[], displayIndices: number[], onComplete: () => void) => void;
  onCollectionResizeStart: (event: PointerEvent<HTMLButtonElement>) => void;
  onCollectionResizeMove: (event: PointerEvent<HTMLButtonElement>) => void;
  onCollectionResizeStop: (event: PointerEvent<HTMLButtonElement>) => void;
}

export function AppWorkspace({
  espansoMatchDir,
  espansoConfigsCount,
  espansoPreviewTree,
  selectedEspansoConfigPath,
  selectedEspansoPreview,
  selectedDirectoryNode,
  activeDirectoryRelPath,
  activeEspansoAncestorPaths,
  collectionPaneWidth,
  isCollectionResizing,
  isScanningEspanso,
  isLoadingSelectedPreview,
  isSelectedPreviewLoaded,
  selectedPreviewError,
  espansoScanMessage,
  highlightedSnippetIndex,
  updatedSnippetIndex,
  deletingSnippetIndices,
  mainSplitRef,
  onOpenSearch,
  onRefresh,
  onOpenLogs,
  onOpenSettings,
  onSelectConfigPath,
  onOpenYamlFile,
  onCreateFile,
  onCreateFolder,
  onOpenSnippet,
  onAddSnippet,
  onOpenTriggerConflicts,
  triggerConflictCount,
  onOpenVisualEditor,
  onOpenImportAlfred,
  onOpenWarnings,
  onBatchDelete,
  onCollectionResizeStart,
  onCollectionResizeMove,
  onCollectionResizeStop,
}: AppWorkspaceProps) {
  const { t } = useI18n();

  return (
    <main className="flex h-full w-full overflow-hidden bg-[linear-gradient(180deg,hsl(var(--background))_0%,hsl(var(--secondary))_100%)] p-4">
      <div className="flex h-full w-full flex-col rounded-lg border bg-secondary/40 p-4 text-left shadow-sm">
        {espansoConfigsCount > 0 ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <AppHeader
              espansoMatchDir={espansoMatchDir}
              isScanningEspanso={isScanningEspanso}
              onOpenSearch={onOpenSearch}
              onRefresh={onRefresh}
              onOpenLogs={onOpenLogs}
              onOpenSettings={onOpenSettings}
            />

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
                      title={
                        activeDirectoryRelPath
                          ? t("filesystem.createFolderIn", { path: `/${activeDirectoryRelPath}` })
                          : t("filesystem.createFolder")
                      }
                      onClick={() => onCreateFolder()}
                    >
                      <FolderPlus className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      title={
                        activeDirectoryRelPath
                          ? t("filesystem.createFileIn", { path: `/${activeDirectoryRelPath}` })
                          : t("filesystem.createFile")
                      }
                      onClick={() => onCreateFile()}
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
                        onSelect={onSelectConfigPath}
                        onOpenFile={onOpenYamlFile}
                        onCreateFile={onCreateFile}
                        onCreateFolder={onCreateFolder}
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
                onPointerDown={onCollectionResizeStart}
                onPointerMove={onCollectionResizeMove}
                onPointerUp={onCollectionResizeStop}
                onPointerCancel={onCollectionResizeStop}
              />

              <section className="flex min-h-0 min-w-0 flex-col">
                {selectedEspansoPreview &&
                (isLoadingSelectedPreview || !isSelectedPreviewLoaded) ? (
                  <div className="flex h-full min-h-56 flex-col items-center justify-center p-6 text-center">
                    <Loader2 className="mb-3 h-7 w-7 animate-spin text-primary" />
                    <h3 className="text-sm font-semibold">
                      {selectedEspansoPreview.config.relativePath}
                    </h3>
                    <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                      {selectedPreviewError || t("status.loadingYamlPreview")}
                    </p>
                  </div>
                ) : selectedEspansoPreview ? (
                  <EspansoConfigDetail
                    preview={selectedEspansoPreview}
                    highlightedIndex={highlightedSnippetIndex}
                    updatedIndex={updatedSnippetIndex}
                    deletingIndices={deletingSnippetIndices}
                    onViewSnippet={(match, index) =>
                      onOpenSnippet({
                        preview: selectedEspansoPreview,
                        match,
                        displayIndex: index,
                      })
                    }
                    onAddSnippet={onAddSnippet}
                    onOpenTriggerConflicts={onOpenTriggerConflicts}
                    triggerConflictCount={triggerConflictCount}
                    onOpenVisualEditor={onOpenVisualEditor}
                    onOpenImportAlfred={onOpenImportAlfred}
                    onOpenWarnings={onOpenWarnings}
                    onBatchDelete={onBatchDelete}
                  />
                ) : selectedDirectoryNode ? (
                  <EspansoDirectoryDetail
                    node={selectedDirectoryNode}
                    onSelectFile={onSelectConfigPath}
                    onCreateFile={onCreateFile}
                    onCreateFolder={onCreateFolder}
                    onOpenImportAlfred={onOpenImportAlfred}
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
                <Button onClick={() => onCreateFolder("")}>
                  <FolderPlus className="h-4 w-4 mr-2" />
                  {t("filesystem.createFolder")}
                </Button>
                <Button variant="outline" onClick={() => onCreateFile("")}>
                  <FilePlus className="h-4 w-4 mr-2" />
                  {t("filesystem.createFile")}
                </Button>
                <Button variant="ghost" onClick={onRefresh}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  {t("actions.refresh")}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
