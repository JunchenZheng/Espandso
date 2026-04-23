import { memo, useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FilePlus,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  SquareArrowOutUpRight,
} from "lucide-react";
import { useI18n } from "../../../i18n/useI18n";
import { cn } from "../../../lib/utils";
import type { EspansoConfigPreviewTreeNode } from "../types";

export interface EspansoConfigTreeNodeProps {
  node: EspansoConfigPreviewTreeNode;
  activePath: string;
  activeAncestorPaths: Set<string>;
  onSelect: (path: string) => void;
  onOpenFile: (path: string) => void;
  onCreateFile?: (parentRelPath: string) => void;
  onCreateFolder?: (parentRelPath: string) => void;
}

export const EspansoConfigTreeNode = memo(function EspansoConfigTreeNode({
  node,
  activePath,
  activeAncestorPaths,
  onSelect,
  onOpenFile,
  onCreateFile,
  onCreateFolder,
}: EspansoConfigTreeNodeProps) {
  const { t } = useI18n();
  const containsActive = activeAncestorPaths.has(node.relativePath || node.path);
  const [isOpen, setIsOpen] = useState<boolean>(containsActive);

  useEffect(() => {
    if (containsActive) {
      setIsOpen(true);
    }
  }, [containsActive]);

  if (node.isDir) {
    const isActive = node.relativePath === activePath || node.path === activePath;

    return (
      <div className="mb-0.5">
        <div
          className={cn(
            "group flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors",
            isActive
              ? "bg-primary text-primary-foreground font-semibold"
              : containsActive
                ? "text-foreground font-semibold hover:bg-accent/70"
                : "text-foreground/80 font-medium hover:bg-accent/70",
          )}
        >
          <button
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
            onClick={() => {
              onSelect(node.relativePath || node.path);
              setIsOpen(!isOpen);
            }}
          >
            {isOpen ? (
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 transition-transform",
                  isActive ? "text-primary-foreground/80" : "text-muted-foreground/70",
                )}
              />
            ) : (
              <ChevronRight
                className={cn(
                  "h-4 w-4 shrink-0 transition-transform",
                  isActive ? "text-primary-foreground/80" : "text-muted-foreground/70",
                )}
              />
            )}
            <div
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                isActive
                  ? "bg-primary-foreground/20 text-primary-foreground"
                  : "bg-amber-500/15 text-amber-600 dark:text-amber-400",
              )}
            >
              {isOpen ? <FolderOpen className="h-4 w-4" /> : <Folder className="h-4 w-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold tracking-tight">{node.name}</div>
            </div>
          </button>
          <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded hover:bg-accent-foreground/10",
                isActive
                  ? "text-primary-foreground/80 hover:text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              title={t("filesystem.createFolderIn", { path: node.name })}
              onClick={(e) => {
                e.stopPropagation();
                onCreateFolder?.(node.relativePath);
              }}
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </button>
            <button
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded hover:bg-accent-foreground/10",
                isActive
                  ? "text-primary-foreground/80 hover:text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              title={t("filesystem.createFileIn", { path: node.name })}
              onClick={(e) => {
                e.stopPropagation();
                onCreateFile?.(node.relativePath);
              }}
            >
              <FilePlus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        {isOpen && node.children && (
          <div className="ml-3.5 mt-0.5 space-y-0.5 border-l border-border/50 pl-2">
            {node.children.map((child) => (
              <EspansoConfigTreeNode
                key={child.path}
                node={child}
                activePath={activePath}
                activeAncestorPaths={activeAncestorPaths}
                onSelect={onSelect}
                onOpenFile={onOpenFile}
                onCreateFile={onCreateFile}
                onCreateFolder={onCreateFolder}
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
        "group flex w-full items-center rounded-md transition-colors",
        isActive
          ? "bg-primary text-primary-foreground font-medium"
          : "text-foreground/80 hover:bg-accent hover:text-foreground",
      )}
    >
      <button
        data-testid="espanso-config-file"
        data-config-path={node.preview?.config.path || ""}
        data-config-relative-path={node.preview?.config.relativePath || node.name}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-l-md px-2 py-1.5 text-left"
        onClick={() => node.preview && onSelect(node.preview.config.path)}
      >
        <FileText
          className={cn(
            "h-4 w-4 shrink-0",
            isActive ? "text-primary-foreground" : "text-muted-foreground",
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium">{node.name.replace(/\.ya?ml$/i, "")}</div>
        </div>
      </button>
      {node.preview && (
        <button
          className={cn(
            "mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded opacity-70 transition hover:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            isActive
              ? "hover:bg-primary-foreground/20 text-primary-foreground"
              : "hover:bg-accent-foreground/10 text-muted-foreground",
          )}
          title={t("filesystem.openFileInDefaultApp", { file: node.name })}
          onClick={() => onOpenFile(node.preview!.config.path)}
        >
          <SquareArrowOutUpRight className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
});
