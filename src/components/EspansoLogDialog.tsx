import { useState, useEffect, useRef, useCallback } from "react";
import {
  Terminal,
  RefreshCw,
  Copy,
  Check,
  Trash2,
  ArrowDownCircle,
  PauseCircle,
  PlayCircle,
  AlertCircle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { getEspansoLog } from "../tauri/espansoRuntime";
import { useI18n } from "../i18n/useI18n";

interface EspansoLogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EspansoLogDialog({ open, onOpenChange }: EspansoLogDialogProps) {
  const { t } = useI18n();
  const [logContent, setLogContent] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const logContainerRef = useRef<HTMLDivElement | null>(null);

  const fetchLog = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await getEspansoLog();
      if (res.success) {
        setLogContent(res.log || "");
      } else {
        if (res.log) {
          setLogContent(res.log);
        }
        setErrorMsg(res.message || "Failed to retrieve Espanso logs.");
      }
      setLastUpdated(new Date());
    } catch (err: any) {
      setErrorMsg(`Error fetching logs: ${err.message || err}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Poll for logs when open & autoRefresh enabled
  useEffect(() => {
    if (!open) return;

    fetchLog();

    let intervalId: NodeJS.Timeout | null = null;
    if (autoRefresh) {
      intervalId = setInterval(() => {
        fetchLog();
      }, 3000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [open, autoRefresh, fetchLog]);

  // Handle auto-scroll to bottom when content changes
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logContent, autoScroll]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(logContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy logs:", err);
    }
  };

  const handleClear = () => {
    setLogContent("");
  };

  const renderFormattedLine = (line: string, index: number) => {
    if (!line.trim()) {
      return <div key={index} className="h-4" />;
    }

    let levelStyle = "text-zinc-300";
    if (line.includes("[ERROR]") || line.includes("ERR") || line.includes("FATAL")) {
      levelStyle = "text-rose-400 font-semibold";
    } else if (line.includes("[WARN]") || line.includes("WARNING")) {
      levelStyle = "text-amber-400 font-medium";
    } else if (line.includes("[INFO]")) {
      levelStyle = "text-emerald-400";
    } else if (line.includes("[DEBUG]")) {
      levelStyle = "text-sky-400";
    }

    return (
      <div key={index} className={`whitespace-pre-wrap break-all ${levelStyle}`}>
        {line}
      </div>
    );
  };

  const lines = logContent ? logContent.split(/\r?\n/) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[92vw] max-h-[90vh] flex flex-col p-4 sm:p-6 gap-3 bg-card border-border">
        {/* Header */}
        <DialogHeader className="flex flex-row items-center justify-between space-y-0 pb-1 border-b">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Terminal className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <DialogTitle className="text-base font-bold">{t("dialogs.logs.title")}</DialogTitle>
                {autoRefresh && (
                  <span className="flex h-2 w-2 relative" title="Realtime Polling Active">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                )}
              </div>
              <DialogDescription className="text-xs text-muted-foreground">
                {t("dialogs.logs.description")}
              </DialogDescription>
            </div>
          </div>

          {/* Header Actions */}
          <div className="flex items-center gap-1.5 mr-6 sm:mr-0">
            <Button
              size="sm"
              variant={autoRefresh ? "secondary" : "outline"}
              className="h-8 text-xs gap-1.5 px-2.5"
              onClick={() => setAutoRefresh(!autoRefresh)}
            >
              {autoRefresh ? (
                <>
                  <PauseCircle className="h-3.5 w-3.5 text-amber-500" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <PlayCircle className="h-3.5 w-3.5 text-emerald-500" />
                  <span>Auto Refresh</span>
                </>
              )}
            </Button>

            <Button
              size="sm"
              variant={autoScroll ? "secondary" : "outline"}
              className="h-8 text-xs gap-1.5 px-2.5"
              onClick={() => setAutoScroll(!autoScroll)}
            >
              <ArrowDownCircle className={`h-3.5 w-3.5 ${autoScroll ? "text-primary" : "text-muted-foreground"}`} />
              <span>Scroll</span>
            </Button>

            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1.5 px-2.5"
              onClick={fetchLog}
              disabled={isLoading}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
              <span>{t("actions.refresh")}</span>
            </Button>

            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1.5 px-2.5"
              onClick={handleCopy}
              disabled={!logContent}
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                  <span>{t("dialogs.logs.copied")}</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>{t("actions.copy")}</span>
                </>
              )}
            </Button>

            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs gap-1.5 px-2 text-muted-foreground hover:text-destructive"
              onClick={handleClear}
              disabled={!logContent}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </DialogHeader>

        {/* Error Alert */}
        {errorMsg && (
          <div className="flex items-center gap-2 rounded-md bg-destructive/15 p-2.5 text-xs text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="flex-1">{errorMsg}</span>
          </div>
        )}

        {/* Terminal Log Output Window */}
        <div
          ref={logContainerRef}
          className="flex-1 min-h-[320px] max-h-[55vh] overflow-y-auto rounded-lg bg-zinc-950 dark:bg-black border border-zinc-800 p-3.5 font-mono text-[12px] leading-relaxed shadow-inner"
        >
          {lines.length > 0 ? (
            lines.map((line, idx) => renderFormattedLine(line, idx))
          ) : (
            <div className="flex h-full min-h-[280px] items-center justify-center text-zinc-500 italic text-xs">
              {isLoading ? t("dialogs.logs.refreshing") : t("dialogs.logs.noLogs")}
            </div>
          )}
        </div>

        {/* Footer Statistics */}
        <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t">
          <div className="flex items-center gap-3">
            <span>Total Lines: <strong className="text-foreground">{lines.length}</strong></span>
            {lastUpdated && (
              <span>Last Updated: {lastUpdated.toLocaleTimeString()}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground/70 font-mono">espanso log</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
