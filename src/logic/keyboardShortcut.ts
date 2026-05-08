export const SEARCH_SHORTCUT_KEY = "f";

export function getPlatformShortcutModifierLabel(platform = navigator.platform): string {
  return platform.toLowerCase().includes("mac") ? "⌘" : "Ctrl";
}

export function getSearchShortcutLabel(platform = navigator.platform): string {
  const modifierLabel = getPlatformShortcutModifierLabel(platform);
  const keyLabel = SEARCH_SHORTCUT_KEY.toUpperCase();

  return modifierLabel === "⌘" ? `${modifierLabel}${keyLabel}` : `${modifierLabel}+${keyLabel}`;
}
