import { createContext, useContext } from "react";
import type { InterpolationParams, Locale } from "./types";
import { DEFAULT_LOCALE } from "./types";

export interface I18nContextType {
  locale: Locale;
  setLocale: (newLocale: Locale) => Promise<void>;
  t: (key: string, params?: InterpolationParams) => string;
}

export const I18nContext = createContext<I18nContextType>({
  locale: DEFAULT_LOCALE,
  setLocale: async () => {},
  t: (key: string) => key,
});

export function useI18n(): I18nContextType {
  return useContext(I18nContext);
}
