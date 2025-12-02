import { FilePlus, Loader2, XCircle } from "lucide-react";
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

interface CreateFileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  createFileName: string;
  setCreateFileName: (name: string) => void;
  createFileParentRelPath: string;
  setCreateFileParentRelPath: (relPath: string) => void;
  createFileError: string;
  setCreateFileError: (err: string) => void;
  isCreatingFile: boolean;
  espansoDirectories: EspansoDirectoryInfo[];
  onCreateFile: () => void;
}

export function CreateFileDialog({
  open,
  onOpenChange,
  createFileName,
  setCreateFileName,
  createFileParentRelPath,
  setCreateFileParentRelPath,
  createFileError,
  setCreateFileError,
  isCreatingFile,
  espansoDirectories,
  onCreateFile,
}: CreateFileDialogProps) {
  const { t } = useI18n();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FilePlus className="h-5 w-5 text-primary" />
            {t("filesystem.createFile")}
          </DialogTitle>
          <DialogDescription>
            {t("filesystem.createFileDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {createFileError && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <XCircle className="h-4 w-4 shrink-0" />
              <span>{createFileError}</span>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="create-file-name">
              {t("filesystem.fileName")} <RequiredMark />
            </Label>
            <Input
              id="create-file-name"
              placeholder={t("filesystem.fileNamePlaceholder")}
              value={createFileName}
              onChange={(e) => {
                setCreateFileName(e.target.value);
                setCreateFileError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isCreatingFile) {
                  e.preventDefault();
                  onCreateFile();
                }
              }}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              {t("filesystem.fileExtensionHint")}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="create-file-parent">{t("filesystem.targetLocation")}</Label>
            <select
              id="create-file-parent"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={createFileParentRelPath}
              onChange={(e) => setCreateFileParentRelPath(e.target.value)}
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
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isCreatingFile}>
            {t("actions.cancel")}
          </Button>
          <Button onClick={onCreateFile} disabled={isCreatingFile || !createFileName.trim()}>
            {isCreatingFile ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                {t("filesystem.creating")}
              </>
            ) : (
              t("filesystem.createFileShort")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
