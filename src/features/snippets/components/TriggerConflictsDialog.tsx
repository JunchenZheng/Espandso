import { AlertTriangle, CheckCircle2, FileText, Pencil } from "lucide-react";
import { Button } from "../../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import { ScrollArea } from "../../../components/ui/scroll-area";
import { useI18n } from "../../../i18n/useI18n";
import type { TriggerConflictSource, TriggerPrefixConflict } from "../../../logic/triggerConflicts";

export interface TriggerConflictsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conflicts: TriggerPrefixConflict[];
  relativePath?: string;
  onOpenSource?: (source: TriggerConflictSource) => void;
}

export function TriggerConflictsDialog({
  open,
  onOpenChange,
  conflicts,
  relativePath,
  onOpenSource,
}: TriggerConflictsDialogProps) {
  const { t } = useI18n();
  const conflictCount = conflicts.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="trigger-conflicts-dialog" className="max-w-md sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-500/15 text-red-700">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                <span>{t("dialogs.triggerConflicts.title")}</span>
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
                  {conflictCount}
                </span>
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                {relativePath
                  ? t("dialogs.triggerConflicts.fileDescription", { file: relativePath })
                  : t("dialogs.triggerConflicts.description")}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {conflictCount === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <CheckCircle2 className="mb-2 h-10 w-10 text-emerald-500/80" />
            <p className="text-sm font-medium text-foreground">
              {t("dialogs.triggerConflicts.noConflicts")}
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-[60vh] pr-2">
            <div className="space-y-3">
              {conflicts.map((conflict, index) => (
                <div
                  key={`${conflict.blocking.configPath}-${conflict.blocking.snippetIndex}-${conflict.blocked.configPath}-${conflict.blocked.snippetIndex}-${index}`}
                  className="rounded-lg border border-red-200/80 bg-red-50/50 p-3 shadow-sm"
                >
                  <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
                    <div className="min-w-0">
                      <div className="mb-1 text-xs font-semibold uppercase text-red-700">
                        {t("dialogs.triggerConflicts.blockingTrigger")}
                      </div>
                      <div className="mono-field truncate text-sm font-semibold text-foreground">
                        {conflict.blocking.trigger}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <FileText className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{conflict.blocking.relativePath}</span>
                      </div>
                      {onOpenSource && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-2 h-7 px-2 text-xs"
                          onClick={() => onOpenSource(conflict.blocking)}
                          title={t("dialogs.triggerConflicts.editTriggerTitle", {
                            trigger: conflict.blocking.trigger,
                          })}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          {t("dialogs.triggerConflicts.editTrigger")}
                        </Button>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="mb-1 text-xs font-semibold uppercase text-red-700">
                        {t("dialogs.triggerConflicts.blockedTrigger")}
                      </div>
                      <div className="mono-field truncate text-sm font-semibold text-foreground">
                        {conflict.blocked.trigger}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <FileText className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{conflict.blocked.relativePath}</span>
                      </div>
                      {onOpenSource && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-2 h-7 px-2 text-xs"
                          onClick={() => onOpenSource(conflict.blocked)}
                          title={t("dialogs.triggerConflicts.editTriggerTitle", {
                            trigger: conflict.blocked.trigger,
                          })}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          {t("dialogs.triggerConflicts.editTrigger")}
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-red-900">
                    {t("dialogs.triggerConflicts.explanation", {
                      blocking: conflict.blocking.trigger,
                      blocked: conflict.blocked.trigger,
                    })}
                  </p>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
