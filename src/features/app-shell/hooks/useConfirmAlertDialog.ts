import { useCallback, useState } from "react";
import { useI18n } from "../../../i18n/useI18n";
import type { AlertDialogState } from "../../../components/shared/ConfirmAlertDialog";

export function useConfirmAlertDialog() {
  const { t } = useI18n();
  const [alertDialog, setAlertDialog] = useState<AlertDialogState>({
    isOpen: false,
    title: "",
    description: "",
    confirmText: t("actions.ok"),
  });

  const showAlert = useCallback((description: string, title = t("app.name")) => {
    setAlertDialog({
      isOpen: true,
      title,
      description,
      confirmText: t("actions.ok"),
    });
  }, [t]);

  const showConfirm = useCallback(
    (
      description: string,
      onConfirm: () => void | Promise<void>,
      title = t("app.name"),
      confirmText = t("actions.ok"),
      cancelText = t("actions.cancel"),
    ) => {
      setAlertDialog({
        isOpen: true,
        title,
        description,
        confirmText,
        cancelText,
        onConfirm,
      });
    },
    [t],
  );

  const closeAlertDialog = useCallback(() => {
    setAlertDialog((prev) => ({ ...prev, isOpen: false }));
  }, []);

  return {
    alertDialog,
    showAlert,
    showConfirm,
    closeAlertDialog,
  };
}
