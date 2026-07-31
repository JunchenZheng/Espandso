import { AlertTriangle, FileText, Filter, CheckCircle2, SquareArrowOutUpRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import { ScrollArea } from "../../../components/ui/scroll-area";
import { Button } from "../../../components/ui/button";
import { EspansoConfigPreview } from "../../espanso-configs/types";
import { useI18n } from "../../../i18n/useI18n";

export interface WarningsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  previews: EspansoConfigPreview[];
  filterPath?: string | null;
  onClearFilter?: () => void;
  onSelectFile?: (path: string) => void;
  onOpenFileExternal?: (path: string) => void;
}

export function WarningsDialog({
  open,
  onOpenChange,
  previews,
  filterPath,
  onClearFilter,
  onSelectFile,
  onOpenFileExternal,
}: WarningsDialogProps) {
  const { t } = useI18n();
  const previewsWithWarnings = previews.filter((p) => p.warnings && p.warnings.length > 0);

  const totalWarningsCount = previewsWithWarnings.reduce((acc, p) => acc + p.warnings.length, 0);

  const activeFilterPreview = filterPath
    ? previewsWithWarnings.find((p) => p.config.path === filterPath)
    : null;

  const displayPreviews = activeFilterPreview ? [activeFilterPreview] : previewsWithWarnings;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md sm:max-w-xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                <span>{t("dialogs.warnings.title")}</span>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">
                  {activeFilterPreview ? activeFilterPreview.warnings.length : totalWarningsCount}
                </span>
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                {t("dialogs.warnings.description")}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {filterPath && activeFilterPreview && (
            <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50/70 p-2.5 text-xs dark:border-amber-500/30 dark:bg-amber-500/10">
              <div className="flex items-center gap-2 text-amber-900 min-w-0 dark:text-amber-100">
                <Filter className="h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-300" />
                <span className="truncate">
                  {t("dialogs.warnings.filteringFor")}:{" "}
                  <strong>{activeFilterPreview.config.relativePath}</strong>
                </span>
              </div>
              {onClearFilter && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs text-amber-800 hover:bg-amber-100 hover:text-amber-900 dark:text-amber-200 dark:hover:bg-amber-500/20 dark:hover:text-amber-100"
                  onClick={onClearFilter}
                >
                  {t("dialogs.warnings.showAllFiles", { count: totalWarningsCount })}
                </Button>
              )}
            </div>
          )}

          {displayPreviews.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-500/80 mb-2" />
              <p className="text-sm font-medium text-foreground">
                {t("dialogs.warnings.noWarnings")}
              </p>
            </div>
          ) : (
            <ScrollArea className="max-h-[60vh] pr-2">
              <div className="space-y-4">
                {displayPreviews.map((preview) => (
                  <div
                    key={preview.config.path}
                    className="rounded-lg border bg-card p-3 shadow-sm space-y-2"
                  >
                    <div className="flex items-center justify-between border-b pb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="font-semibold text-sm text-foreground truncate">
                          {preview.config.relativePath}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">
                          {preview.warnings.length}{" "}
                          {t(preview.warnings.length === 1 ? "counts.warning" : "counts.warnings")}
                        </span>
                        {onSelectFile && preview.config.path !== filterPath && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            onClick={() => {
                              onSelectFile(preview.config.path);
                              onOpenChange(false);
                            }}
                          >
                            {t("dialogs.warnings.viewInApp")}
                          </Button>
                        )}
                        {onOpenFileExternal && (
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-7 gap-1 px-2 text-xs"
                            onClick={() => onOpenFileExternal(preview.config.path)}
                            title={t("dialogs.warnings.openYamlExternalTitle")}
                          >
                            <span>{t("dialogs.warnings.viewYaml")}</span>
                            <SquareArrowOutUpRight className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2 pt-1">
                      {preview.warnings.map((warn: string, idx: number) => (
                        <div
                          key={`warn-${preview.config.path}-${idx}`}
                          className="flex items-start gap-2.5 rounded-md border border-amber-200/80 bg-amber-50/50 p-2.5 text-xs text-amber-900 leading-relaxed font-mono dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100"
                        >
                          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5 dark:text-amber-300" />
                          <span className="break-all">{warn}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
