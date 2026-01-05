import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { I18nContext } from "../i18n/useI18n";
import { translate } from "../i18n/translate";
import type { Locale } from "../i18n/types";

interface TestProvidersProps {
  children: ReactNode;
  locale?: Locale;
}

export function TestProviders({ children, locale = "en" }: TestProvidersProps) {
  return (
    <I18nContext.Provider
      value={{
        locale,
        setLocale: async () => {},
        t: (key, params) => translate(locale, key, params),
      }}
    >
      {children}
    </I18nContext.Provider>
  );
}

interface RenderWithProvidersOptions extends Omit<RenderOptions, "wrapper"> {
  locale?: Locale;
}

export function renderWithProviders(
  ui: ReactElement,
  { locale = "en", ...options }: RenderWithProvidersOptions = {},
) {
  return render(ui, {
    wrapper: ({ children }) => <TestProviders locale={locale}>{children}</TestProviders>,
    ...options,
  });
}
