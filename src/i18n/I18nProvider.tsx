import React, { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getSetting, setSetting } from "../tauri/fileStore";
import { translate } from "./translate";
import type { InterpolationParams, Locale } from "./types";
import { DEFAULT_LOCALE } from "./types";
import { I18nContext } from "./useI18n";

async function syncDesktopMenu(locale: Locale) {
  try {
    await invoke("set_app_language", { locale });
  } catch (err) {
    console.error("Failed to sync desktop menu language:", err);
  }
}

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const savedLocale = await getSetting<Locale>("language", DEFAULT_LOCALE);
      const validLocale: Locale = savedLocale === "zh-CN" ? "zh-CN" : "en";
      if (mounted) {
        setLocaleState(validLocale);
        syncDesktopMenu(validLocale);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const setLocale = useCallback(async (newLocale: Locale) => {
    setLocaleState(newLocale);
    await setSetting("language", newLocale);
    await syncDesktopMenu(newLocale);
  }, []);

  const t = useCallback(
    (key: string, params?: InterpolationParams) => {
      return translate(locale, key, params);
    },
    [locale],
  );

  return <I18nContext.Provider value={{ locale, setLocale, t }}>{children}</I18nContext.Provider>;
};
