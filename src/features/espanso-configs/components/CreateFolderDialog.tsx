import { FolderPlus, Loader2, XCircle } from "lucide-react";
import { Button } from "../../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { RequiredMark } from "../../../components/shared/FormMarks";
import { useI18n } from "../../../i18n/useI18n";
import type { EspansoDirectoryInfo } from "../../../logic/espansoPaths";

interface CreateFolderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  createFolderName: string;
  setCreateFolderName: (name: string) => void;
  createFolderParentRelPath: string;
  setCreateFolderParentRelPath: (relPath: string) => void;
  createFolderError: string;
  setCreateFolderError: (err: string) => void;
  isCreatingFolder: boolean;
  espansoDirectories: EspansoDirectoryInfo[];
  onCreateFolder: () => void;
}

export function CreateFolderDialog({
  open,
  onOpenChange,
  createFolderName,
  setCreateFolderName,
  createFolderParentRelPath,
  setCreateFolderParentRelPath,
  createFolderError,
  setCreateFolderError,
  isCreatingFolder,
  espansoDirectories,
  onCreateFolder,
}: CreateFolderDialogProps) {
  const { t } = useI18n();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderPlus className="h-5 w-5 text-primary" />
            {t("filesystem.createFolder")}
          </DialogTitle>
          <DialogDescription>{t("filesystem.createFolderDescription")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {createFolderError && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <XCircle className="h-4 w-4 shrink-0" />
              <span>{createFolderError}</span>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="create-folder-name">
              {t("filesystem.folderName")} <RequiredMark />
            </Label>
            <Input
              id="create-folder-name"
              placeholder={t("filesystem.folderNamePlaceholder")}
              value={createFolderName}
              onChange={(e) => {
                setCreateFolderName(e.target.value);
                setCreateFolderError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isCreatingFolder) {
                  e.preventDefault();
                  onCreateFolder();
                }
              }}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="create-folder-parent">{t("filesystem.targetLocation")}</Label>
            <select
              id="create-folder-parent"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={createFolderParentRelPath}
              onChange={(e) => setCreateFolderParentRelPath(e.target.value)}
            >
              <option value="">{t("filesystem.rootMatchDirectory")}</option>
              {espansoDirectories.map((dir) => (
                <option key={dir.relativePath} value={dir.relativePath}>
                  /{dir.relativePath}
                </option>
              ))}
            </select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isCreatingFolder}>
            {t("actions.cancel")}
          </Button>
          <Button onClick={onCreateFolder} disabled={isCreatingFolder || !createFolderName.trim()}>
            {isCreatingFolder ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                {t("filesystem.creating")}
              </>
            ) : (
              t("filesystem.createFolderShort")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
