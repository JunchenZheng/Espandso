import { useI18n } from "../../i18n/useI18n";

export function RequiredMark() {
  return (
    <span className="ml-1 inline-flex items-center justify-center text-destructive font-semibold align-middle leading-none translate-y-[2px]">
      *
    </span>
  );
}

export function OptionalMark() {
  const { t } = useI18n();
  return (
    <span className="ml-1 inline-flex items-center text-xs font-normal text-muted-foreground align-middle leading-none">
      {t("common.optional")}
    </span>
  );
}
