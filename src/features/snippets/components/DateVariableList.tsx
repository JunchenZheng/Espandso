import { Calendar, X } from "lucide-react";
import { useI18n } from "../../../i18n/useI18n";
import type { SnippetVar } from "../../../logic/types";

export interface DateVariableListProps {
  vars: SnippetVar[];
  onRemove: (varName: string) => void;
}

export function DateVariableList({ vars, onRemove }: DateVariableListProps) {
  const { t } = useI18n();
  if (vars.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-1">
      <span className="text-xs font-medium text-muted-foreground shrink-0 inline-flex items-center gap-1">
        <Calendar className="h-3 w-3 text-primary" />
        {t("dateFormats.associatedDateVars")}
      </span>
      {vars.map((v) => (
        <span
          key={v.name}
          className="inline-flex items-center gap-1 rounded bg-muted/80 px-2 py-0.5 text-xs font-mono text-foreground border border-border/50"
        >
          <span className="text-primary font-medium">{`{{${v.name}}}`}</span>
          <button
            type="button"
            onClick={() => onRemove(v.name)}
            className="ml-0.5 text-muted-foreground hover:text-destructive rounded p-0.5 transition-colors"
            title={t("dateFormats.removeVariable")}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
    </div>
  );
}
