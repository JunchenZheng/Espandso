import { en } from "./locales/en";
import { zhCN } from "./locales/zh-CN";
import type { InterpolationParams, Locale, TranslationTree } from "./types";
import { DEFAULT_LOCALE } from "./types";

const locales: Record<Locale, TranslationTree> = {
  en,
  "zh-CN": zhCN,
};

export function getNestedValue(obj: TranslationTree, path: string): string | undefined {
  const parts = path.split(".");
  let current: unknown = obj;

  for (const part of parts) {
    if (current && typeof current === "object" && part in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return typeof current === "string" ? current : undefined;
}

export function interpolate(text: string, params?: InterpolationParams): string {
  if (!params) return text;
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = params[key];
    return value !== undefined && value !== null ? String(value) : `{{${key}}}`;
  });
}

export function translate(locale: Locale, key: string, params?: InterpolationParams): string {
  const targetDict = locales[locale] || locales[DEFAULT_LOCALE];
  let rawText = getNestedValue(targetDict, key);

  if (rawText === undefined && locale !== DEFAULT_LOCALE) {
    rawText = getNestedValue(locales[DEFAULT_LOCALE], key);
  }

  if (rawText === undefined) {
    return key;
  }

  return interpolate(rawText, params);
}
