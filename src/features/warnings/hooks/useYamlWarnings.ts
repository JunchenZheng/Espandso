import { useMemo, useState } from "react";
import {
  getExperimentalYamlWarningsEnabled,
  isYamlWarningsActive,
  setExperimentalYamlWarningsEnabled,
} from "../../../logic/features";

export function useYamlWarnings() {
  const [enableExperimentalYamlWarnings, setEnableExperimentalYamlWarnings] = useState<boolean>(() =>
    getExperimentalYamlWarningsEnabled()
  );

  const isYamlWarningsEnabled = useMemo(
    () => isYamlWarningsActive(enableExperimentalYamlWarnings),
    [enableExperimentalYamlWarnings]
  );

  const [isWarningsDialogOpen, setIsWarningsDialogOpen] = useState<boolean>(false);
  const [warningsFilterPath, setWarningsFilterPath] = useState<string | null>(null);

  const handleToggleExperimentalYamlWarnings = (checked: boolean) => {
    setEnableExperimentalYamlWarnings(checked);
    setExperimentalYamlWarningsEnabled(checked);
  };

  const openWarningsDialog = (filterPath?: string) => {
    setWarningsFilterPath(filterPath ?? null);
    setIsWarningsDialogOpen(true);
  };

  const closeWarningsDialog = () => {
    setIsWarningsDialogOpen(false);
  };

  const clearWarningsFilter = () => {
    setWarningsFilterPath(null);
  };

  return {
    enableExperimentalYamlWarnings,
    isYamlWarningsEnabled,
    isWarningsDialogOpen,
    setIsWarningsDialogOpen,
    warningsFilterPath,
    setWarningsFilterPath,
    handleToggleExperimentalYamlWarnings,
    openWarningsDialog,
    closeWarningsDialog,
    clearWarningsFilter,
  };
}
