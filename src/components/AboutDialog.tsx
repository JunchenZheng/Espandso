import { Info, ExternalLink, Heart } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { ScrollArea } from "./ui/scroll-area";
import { Button } from "./ui/button";
import { OPEN_SOURCE_LIBRARIES, OpenSourceLibrary } from "../logic/openSourceLibraries";
import { useI18n } from "../i18n/useI18n";

interface AboutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AboutDialog({ open, onOpenChange }: AboutDialogProps) {
  const { t } = useI18n();

  const handleOpenLink = async (url: string) => {
    try {
      await openUrl(url);
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Info className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold">{t("dialogs.about.title")}</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                {t("dialogs.about.description")}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* App Info Card */}
          <div className="rounded-lg border bg-card p-3.5 text-card-foreground shadow-sm">
            <div className="flex items-center justify-between border-b pb-2">
              <span className="font-semibold text-base">Expandso</span>
              <span className="rounded-full bg-secondary px-2.5 py-0.5 text-sm font-medium">
                v0.1.0
              </span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              {t("dialogs.about.builtWith")}
            </p>
          </div>

          {/* Open Source Acknowledgments Header */}
          <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Heart className="h-3.5 w-3.5 text-rose-500 fill-rose-500" />
            <span>{t("dialogs.about.openSourceLicenses")}</span>
          </div>

          {/* Open Source Libraries List */}
          <ScrollArea className="max-h-64 pr-2">
            <div className="space-y-3">
              {OPEN_SOURCE_LIBRARIES.map((lib: OpenSourceLibrary) => (
                <div
                  key={lib.name}
                  className="group rounded-lg border bg-muted/40 p-3 transition-colors hover:border-primary/40 hover:bg-muted/70"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-base text-foreground">{lib.name}</span>
                      <span className="rounded border bg-background px-1.5 py-0.2 text-[11px] font-mono text-muted-foreground">
                        {lib.license}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-muted-foreground group-hover:text-primary"
                      onClick={() => handleOpenLink(lib.url)}
                      title={t("dialogs.about.openRepository", { name: lib.name })}
                    >
                      <span className="mr-1">GitHub</span>
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  </div>
                  <p className="mt-1.5 text-sm text-muted-foreground leading-normal">
                    {lib.description}
                  </p>
                  {lib.usageNotice && (
                    <p className="mt-1 text-[11px] text-muted-foreground/80 font-mono italic">
                      {lib.usageNotice}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
