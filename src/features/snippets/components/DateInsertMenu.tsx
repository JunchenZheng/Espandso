import { useEffect, useRef, useState } from "react";
import { Calendar, ChevronDown } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { useI18n } from "../../../i18n/useI18n";
import { DATE_FORMAT_OPTIONS, type DateFormatOption } from "../../../logic/dateFormats";

export interface DateInsertMenuProps {
  onSelect: (option: DateFormatOption) => void;
}

export function DateInsertMenu({ onSelect }: DateInsertMenuProps) {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 gap-1 px-2 text-xs font-normal border-dashed text-muted-foreground hover:text-foreground hover:bg-accent"
        onClick={() => setIsOpen(!isOpen)}
      >
        <Calendar className="h-3.5 w-3.5 text-primary" />
        <span>{t("dateFormats.addDate")}</span>
        <ChevronDown className="h-3 w-3 opacity-60" />
      </Button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-1 w-72 origin-top-right rounded-md bg-popover p-1.5 shadow-lg border border-border text-popover-foreground animate-in fade-in-80 zoom-in-95">
          <div className="mb-1 border-b border-border/50 px-2 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("dateFormats.addDate")}
          </div>
          <div className="max-h-64 overflow-y-auto space-y-0.5">
            {DATE_FORMAT_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-accent hover:text-accent-foreground transition-colors flex flex-col gap-0.5 group"
                onClick={() => {
                  onSelect(opt);
                  setIsOpen(false);
                }}
              >
                <div className="flex items-center justify-between font-medium">
                  <span>{t(opt.labelKey as any)}</span>
                </div>
                <div className="font-mono text-xs text-muted-foreground">
                  {opt.example}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
