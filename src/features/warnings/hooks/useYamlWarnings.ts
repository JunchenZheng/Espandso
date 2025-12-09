import { useMemo, useState } from "react";
import {
  getExperimentalYamlWarningsEnabled,
  isYamlWarningsActive,
  setExperimentalYamlWarningsEnabled,
} from "../../../logic/features";

export interface YamlWarningsDialogState {
  isOpen: boolean;
  filterPath: string | null;
}

const initialDialogState: YamlWarningsDialogState = {
  isOpen: false,
  filterPath: null,
};

export function openYamlWarningsDialogState(
  state: YamlWarningsDialogState,
  filterPath?: string | null,
): YamlWarningsDialogState {
  return {
    ...state,
    isOpen: true,
    filterPath: filterPath ?? null,
  };
}

export function closeYamlWarningsDialogState(state: YamlWarningsDialogState): YamlWarningsDialogState {
  return {
    ...state,
    isOpen: false,
  };
}

export function clearYamlWarningsFilterState(state: YamlWarningsDialogState): YamlWarningsDialogState {
  return {
    ...state,
    filterPath: null,
  };
}

export function useYamlWarnings() {
  const [enableExperimentalYamlWarnings, setEnableExperimentalYamlWarnings] = useState<boolean>(() =>
    getExperimentalYamlWarningsEnabled()
  );

  const isYamlWarningsEnabled = useMemo(
    () => isYamlWarningsActive(enableExperimentalYamlWarnings),
    [enableExperimentalYamlWarnings]
  );

  const [dialogState, setDialogState] = useState<YamlWarningsDialogState>(initialDialogState);

  const handleToggleExperimentalYamlWarnings = (checked: boolean) => {
    setEnableExperimentalYamlWarnings(checked);
    setExperimentalYamlWarningsEnabled(checked);
  };

  const openWarningsDialog = (filterPath?: string) => {
    setDialogState((state) => openYamlWarningsDialogState(state, filterPath));
  };

  const closeWarningsDialog = () => {
    setDialogState(closeYamlWarningsDialogState);
  };

  const clearWarningsFilter = () => {
    setDialogState(clearYamlWarningsFilterState);
  };

  return {
    enableExperimentalYamlWarnings,
    isYamlWarningsEnabled,
    isWarningsDialogOpen: dialogState.isOpen,
    setIsWarningsDialogOpen: (isOpen: boolean) => setDialogState((state) => ({ ...state, isOpen })),
    warningsFilterPath: dialogState.filterPath,
    setWarningsFilterPath: (filterPath: string | null) => setDialogState((state) => ({ ...state, filterPath })),
    handleToggleExperimentalYamlWarnings,
    openWarningsDialog,
    closeWarningsDialog,
    clearWarningsFilter,
  };
}
