export type Locale = "en" | "zh-CN";

export const DEFAULT_LOCALE: Locale = "en";

export type TranslationValue = string | { [key: string]: TranslationValue };

export interface TranslationTree {
  [key: string]: TranslationValue;
}

export type InterpolationParams = Record<string, string | number | undefined | null>;
