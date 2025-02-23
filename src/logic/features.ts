export const IS_EXPERIMENTAL_BUILD =
  import.meta.env.VITE_ENABLE_EXPERIMENTAL === "true" ||
  import.meta.env.VITE_ENABLE_EXPERIMENTAL === "1";

export const EXPANSO_EXPERIMENTAL_YAML_WARNINGS_KEY =
  "expandso_enable_experimental_yaml_warnings";

export function getExperimentalYamlWarningsEnabled(): boolean {
  if (typeof window === "undefined" || !window.localStorage) {
    return false;
  }
  try {
    const value = window.localStorage.getItem(EXPANSO_EXPERIMENTAL_YAML_WARNINGS_KEY);
    return value === "true";
  } catch {
    return false;
  }
}

export function setExperimentalYamlWarningsEnabled(enabled: boolean): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  try {
    window.localStorage.setItem(
      EXPANSO_EXPERIMENTAL_YAML_WARNINGS_KEY,
      enabled ? "true" : "false",
    );
  } catch {
    // Ignore storage write errors
  }
}

export function isYamlWarningsActive(experimentalEnabled: boolean): boolean {
  return IS_EXPERIMENTAL_BUILD && experimentalEnabled;
}
