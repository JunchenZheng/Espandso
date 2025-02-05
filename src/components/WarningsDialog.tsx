import { AlertTriangle, FileText, Filter, CheckCircle2, SquareArrowOutUpRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { ScrollArea } from "./ui/scroll-area";
import { Button } from "./ui/button";
import { EspansoConfigPreview } from "../App";

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
  const previewsWithWarnings = previews.filter(
    (p) => p.warnings && p.warnings.length > 0
  );

  const totalWarningsCount = previewsWithWarnings.reduce(
    (acc, p) => acc + p.warnings.length,
    0
  );

  const activeFilterPreview = filterPath
    ? previewsWithWarnings.find((p) => p.config.path === filterPath)
    : null;

  const displayPreviews = activeFilterPreview
    ? [activeFilterPreview]
    : previewsWithWarnings;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md sm:max-w-xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-700">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold flex items-center gap-2">
                <span>Espanso Import Warnings</span>
                <span className="rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-xs font-semibold">
                  {activeFilterPreview ? activeFilterPreview.warnings.length : totalWarningsCount}
                </span>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Warnings encountered during YAML match files parsing. Skipped or unsupported snippets are listed below.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {filterPath && activeFilterPreview && (
            <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50/70 p-2.5 text-xs">
              <div className="flex items-center gap-2 text-amber-900 min-w-0">
                <Filter className="h-3.5 w-3.5 shrink-0 text-amber-700" />
                <span className="truncate">
                  Filtering for: <strong>{activeFilterPreview.config.relativePath}</strong>
                </span>
              </div>
              {onClearFilter && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[11px] text-amber-800 hover:bg-amber-100 hover:text-amber-900"
                  onClick={onClearFilter}
                >
                  Show all files ({totalWarningsCount})
                </Button>
              )}
            </div>
          )}

          {displayPreviews.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-500/80 mb-2" />
              <p className="text-sm font-medium text-foreground">No warnings found</p>
              <p className="text-xs text-muted-foreground mt-1">
                All YAML match files parsed cleanly without any warnings or skipped matches.
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
                        <span className="font-semibold text-xs text-foreground truncate">
                          {preview.config.relativePath}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[11px] font-medium">
                          {preview.warnings.length} {preview.warnings.length === 1 ? "warning" : "warnings"}
                        </span>
                        {onSelectFile && preview.config.path !== filterPath && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-[10px]"
                            onClick={() => {
                              onSelectFile(preview.config.path);
                              onOpenChange(false);
                            }}
                          >
                            View In App
                          </Button>
                        )}
                        {onOpenFileExternal && (
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-6 px-2 text-[10px] gap-1"
                            onClick={() => onOpenFileExternal(preview.config.path)}
                            title="Open YAML file in default external application"
                          >
                            <span>View YAML</span>
                            <SquareArrowOutUpRight className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2 pt-1">
                      {preview.warnings.map((warn, idx) => (
                        <div
                          key={`warn-${preview.config.path}-${idx}`}
                          className="flex items-start gap-2.5 rounded-md border border-amber-200/80 bg-amber-50/50 p-2.5 text-xs text-amber-900 leading-relaxed font-mono"
                        >
                          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
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
