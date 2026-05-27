import { RefreshCw, Search, Settings, Terminal } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { useI18n } from "../../../i18n/useI18n";
import { getSearchShortcutLabel } from "../../../logic/keyboardShortcut";
import { cn } from "../../../lib/utils";

interface AppHeaderProps {
  espansoMatchDir: string | null;
  isScanningEspanso: boolean;
  onOpenSearch: () => void;
  onRefresh: () => void;
  onOpenLogs: () => void;
  onOpenSettings: () => void;
}

export function AppHeader({
  espansoMatchDir,
  isScanningEspanso,
  onOpenSearch,
  onRefresh,
  onOpenLogs,
  onOpenSettings,
}: AppHeaderProps) {
  const { t } = useI18n();
  const searchShortcutLabel = getSearchShortcutLabel();
  const openSearchLabel = t("search.openSearch", { shortcut: searchShortcutLabel });

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-background p-3">
      <div className="min-w-0 text-base">
        <span className="font-semibold">{t("navigation.collection")}</span>
        {espansoMatchDir && (
          <span className="ml-3 text-sm text-muted-foreground">{espansoMatchDir}</span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          data-testid="open-search-btn"
          onClick={onOpenSearch}
          aria-label={openSearchLabel}
          title={openSearchLabel}
          className="gap-1.5"
        >
          <Search className="h-4 w-4 text-primary" />
          <span>{t("actions.search")}</span>
          <kbd className="pointer-events-none ml-1 hidden h-5 select-none items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-xs font-medium text-muted-foreground opacity-100 sm:flex">
            {searchShortcutLabel}
          </kbd>
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onRefresh}
          disabled={isScanningEspanso}
          aria-label={t("actions.refresh")}
          title={t("actions.refresh")}
        >
          <RefreshCw className={cn("h-4 w-4", isScanningEspanso && "animate-spin")} />
          {t("actions.refresh")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          data-testid="open-logs-btn"
          onClick={onOpenLogs}
          aria-label={t("actions.viewLogs")}
          title={t("actions.viewLogs")}
        >
          <Terminal className="h-4 w-4" />
          {t("actions.viewLogs")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          data-testid="open-settings-btn"
          onClick={onOpenSettings}
          aria-label={t("actions.settings")}
          title={t("actions.settings")}
        >
          <Settings className="h-4 w-4" />
          {t("actions.settings")}
        </Button>
      </div>
    </div>
  );
}
