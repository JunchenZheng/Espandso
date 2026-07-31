export const IS_EXPERIMENTAL_BUILD =
  import.meta.env.VITE_ENABLE_EXPERIMENTAL === "true" ||
  import.meta.env.VITE_ENABLE_EXPERIMENTAL === "1";

export const EXPANSO_EXPERIMENTAL_YAML_WARNINGS_KEY = "expandso_enable_experimental_yaml_warnings";
export const EXPANSO_PRE_SAVE_CONFLICT_CHECK_KEY = "expandso_enable_pre_save_conflict_check";
export const EXPANSO_EXPERIMENTAL_RICH_TEXT_KEY = "expandso_enable_experimental_rich_text";
export const EXPANSO_THEME_PREFERENCE_KEY = "expandso_theme_preference";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

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
    window.localStorage.setItem(EXPANSO_EXPERIMENTAL_YAML_WARNINGS_KEY, enabled ? "true" : "false");
  } catch {
    // Ignore storage write errors
  }
}

export function isYamlWarningsActive(experimentalEnabled: boolean): boolean {
  return IS_EXPERIMENTAL_BUILD && experimentalEnabled;
}

export function getPreSaveConflictCheckEnabled(): boolean {
  if (typeof window === "undefined" || !window.localStorage) {
    return false;
  }
  try {
    return window.localStorage.getItem(EXPANSO_PRE_SAVE_CONFLICT_CHECK_KEY) === "true";
  } catch {
    return false;
  }
}

export function setPreSaveConflictCheckEnabled(enabled: boolean): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  try {
    window.localStorage.setItem(EXPANSO_PRE_SAVE_CONFLICT_CHECK_KEY, enabled ? "true" : "false");
  } catch {
    // Ignore storage write errors
  }
}

export function getExperimentalRichTextEnabled(): boolean {
  if (typeof window === "undefined" || !window.localStorage) {
    return false;
  }
  try {
    return window.localStorage.getItem(EXPANSO_EXPERIMENTAL_RICH_TEXT_KEY) === "true";
  } catch {
    return false;
  }
}

export function setExperimentalRichTextEnabled(enabled: boolean): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  try {
    window.localStorage.setItem(EXPANSO_EXPERIMENTAL_RICH_TEXT_KEY, enabled ? "true" : "false");
  } catch {
    // Ignore storage write errors
  }
}

export function getThemePreference(): ThemePreference {
  if (typeof window === "undefined" || !window.localStorage) {
    return "system";
  }
  try {
    const value = window.localStorage.getItem(EXPANSO_THEME_PREFERENCE_KEY);
    return isThemePreference(value) ? value : "system";
  } catch {
    return "system";
  }
}

export function setThemePreference(preference: ThemePreference): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  try {
    window.localStorage.setItem(EXPANSO_THEME_PREFERENCE_KEY, preference);
  } catch {
    // Ignore storage write errors
  }
}

export function resolveThemePreference(preference: ThemePreference): ResolvedTheme {
  if (preference !== "system") {
    return preference;
  }

  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "light";
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyThemePreference(
  preference: ThemePreference,
  root: Pick<HTMLElement, "classList" | "style">,
): ResolvedTheme {
  const resolvedTheme = resolveThemePreference(preference);
  root.classList.toggle("dark", resolvedTheme === "dark");
  root.style.colorScheme = resolvedTheme;
  return resolvedTheme;
}
