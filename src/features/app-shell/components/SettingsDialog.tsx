import { FileSearch, FlaskConical, Globe, Info, Loader2, ShieldAlert } from "lucide-react";
import { Button } from "../../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import { Label } from "../../../components/ui/label";
import { Switch } from "../../../components/ui/switch";
import { useI18n } from "../../../i18n/useI18n";
import { cn } from "../../../lib/utils";
import { IS_EXPERIMENTAL_BUILD } from "../../../logic/features";
import type { EspansoPathSource } from "../../../logic/espansoPaths";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  espansoMatchDir: string | null;
  espansoPathSource: EspansoPathSource | "";
  isScanningEspanso: boolean;
  onRefreshScan: () => void;
  enableExperimentalYamlWarnings: boolean;
  onToggleExperimentalYamlWarnings: (checked: boolean) => void;
  enableExperimentalRichText: boolean;
  onToggleExperimentalRichText: (checked: boolean) => void;
  enablePreSaveConflictCheck: boolean;
  onTogglePreSaveConflictCheck: (checked: boolean) => void;
  onOpenAbout: () => void;
}

export function SettingsDialog({
  open,
  onOpenChange,
  espansoMatchDir,
  espansoPathSource,
  isScanningEspanso,
  onRefreshScan,
  enableExperimentalYamlWarnings,
  onToggleExperimentalYamlWarnings,
  enableExperimentalRichText,
  onToggleExperimentalRichText,
  enablePreSaveConflictCheck,
  onTogglePreSaveConflictCheck,
  onOpenAbout,
}: SettingsDialogProps) {
  const { t, locale, setLocale } = useI18n();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="settings-dialog">
        <DialogHeader>
          <DialogTitle>{t("settings.title")}</DialogTitle>
          <DialogDescription>{t("settings.description")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* Language Setting Block */}
          <div className="rounded-lg border bg-secondary/40 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-background text-primary">
                <Globe className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-sm font-semibold">{t("settings.language")}</Label>
                  <div className="flex items-center rounded-lg border bg-background p-0.5 shadow-sm">
                    <button
                      type="button"
                      onClick={() => setLocale("en")}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                        locale === "en"
                          ? "bg-primary text-primary-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {t("settings.english")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setLocale("zh-CN")}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                        locale === "zh-CN"
                          ? "bg-primary text-primary-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {t("settings.chinese")}
                    </button>
                  </div>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("settings.languageDescription")}
                </p>
              </div>
            </div>
          </div>

          {/* Espanso config scan */}
          <div className="rounded-lg border bg-secondary/40 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-background text-primary">
                {isScanningEspanso ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <FileSearch className="h-5 w-5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-sm font-semibold">{t("settings.espansoConfigScan")}</Label>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={onRefreshScan}
                    disabled={isScanningEspanso}
                  >
                    {isScanningEspanso ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    {t("actions.refresh")}
                  </Button>
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {espansoMatchDir || t("settings.notDetected")}
                </p>
                {espansoPathSource && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {espansoPathSource === "cli"
                      ? t("settings.resolvedWithCli")
                      : t("settings.usingPlatformDefault")}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Save Protection Block */}
          <div className="rounded-lg border bg-secondary/40 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-background text-primary">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <Label
                    htmlFor="pre-save-conflict-check"
                    className="text-sm font-semibold cursor-pointer"
                  >
                    {t("settings.enablePreSaveConflictCheck")}
                  </Label>
                  <Switch
                    id="pre-save-conflict-check"
                    checked={enablePreSaveConflictCheck}
                    onCheckedChange={onTogglePreSaveConflictCheck}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("settings.enablePreSaveConflictCheckDescription")}
                </p>
              </div>
            </div>
          </div>

          {/* Experimental Features Block */}
          <div className="rounded-lg border bg-secondary/40 p-4 space-y-4">
            {IS_EXPERIMENTAL_BUILD && (
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-background text-primary">
                  <FlaskConical className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <Label
                      htmlFor="experimental-yaml-warnings"
                      className="text-sm font-semibold cursor-pointer"
                    >
                      {t("settings.enableYamlWarnings")}
                    </Label>
                    <Switch
                      id="experimental-yaml-warnings"
                      checked={enableExperimentalYamlWarnings}
                      onCheckedChange={onToggleExperimentalYamlWarnings}
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("settings.enableYamlWarningsDescription")}
                  </p>
                </div>
              </div>
            )}
            <div className={cn("flex items-start gap-3", IS_EXPERIMENTAL_BUILD && "border-t pt-4")}>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-background text-primary">
                <FlaskConical className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <Label
                    htmlFor="experimental-rich-text"
                    className="text-sm font-semibold cursor-pointer"
                  >
                    {t("settings.enableRichText")}
                  </Label>
                  <Switch
                    id="experimental-rich-text"
                    checked={enableExperimentalRichText}
                    onCheckedChange={onToggleExperimentalRichText}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("settings.enableRichTextDescription")}
                </p>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter className="sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => {
              onOpenChange(false);
              onOpenAbout();
            }}
          >
            <Info className="mr-1 h-3.5 w-3.5" />
            {t("dialogs.about.title")}
          </Button>
          <Button onClick={() => onOpenChange(false)}>{t("actions.done")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
