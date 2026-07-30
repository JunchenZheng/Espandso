import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  EXPANSO_EXPERIMENTAL_YAML_WARNINGS_KEY,
  EXPANSO_EXPERIMENTAL_RICH_TEXT_KEY,
  EXPANSO_THEME_PREFERENCE_KEY,
  applyThemePreference,
  getExperimentalYamlWarningsEnabled,
  getExperimentalRichTextEnabled,
  getThemePreference,
  setExperimentalYamlWarningsEnabled,
  setExperimentalRichTextEnabled,
  setThemePreference,
  isYamlWarningsActive,
  resolveThemePreference,
} from "./features";

describe("features logic", () => {
  const store: Record<string, string> = {};

  const storageMock: Storage = {
    length: 0,
    clear: () => {
      for (const k in store) {
        delete store[k];
      }
    },
    getItem: (key: string) => store[key] || null,
    key: (index: number) => Object.keys(store)[index] || null,
    removeItem: (key: string) => {
      delete store[key];
    },
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
  };

  beforeEach(() => {
    storageMock.clear();
    Object.defineProperty(globalThis, "window", {
      value: {
        localStorage: storageMock,
        matchMedia: () => ({ matches: false }),
      },
      writable: true,
      configurable: true,
    });
  });

  it("should default to false when localStorage is empty", () => {
    expect(getExperimentalYamlWarningsEnabled()).toBe(false);
  });

  it("should store and retrieve experimental yaml warnings setting", () => {
    setExperimentalYamlWarningsEnabled(true);
    expect(storageMock.getItem(EXPANSO_EXPERIMENTAL_YAML_WARNINGS_KEY)).toBe("true");
    expect(getExperimentalYamlWarningsEnabled()).toBe(true);

    setExperimentalYamlWarningsEnabled(false);
    expect(storageMock.getItem(EXPANSO_EXPERIMENTAL_YAML_WARNINGS_KEY)).toBe("false");
    expect(getExperimentalYamlWarningsEnabled()).toBe(false);
  });

  it("should store and retrieve experimental rich text setting", () => {
    expect(getExperimentalRichTextEnabled()).toBe(false);

    setExperimentalRichTextEnabled(true);
    expect(storageMock.getItem(EXPANSO_EXPERIMENTAL_RICH_TEXT_KEY)).toBe("true");
    expect(getExperimentalRichTextEnabled()).toBe(true);

    setExperimentalRichTextEnabled(false);
    expect(storageMock.getItem(EXPANSO_EXPERIMENTAL_RICH_TEXT_KEY)).toBe("false");
    expect(getExperimentalRichTextEnabled()).toBe(false);
  });

  it("should determine if yaml warnings active correctly", () => {
    expect(isYamlWarningsActive(true)).toBe(false);
    expect(isYamlWarningsActive(false)).toBe(false);
  });

  it("should store and retrieve theme preference", () => {
    expect(getThemePreference()).toBe("system");

    setThemePreference("dark");
    expect(storageMock.getItem(EXPANSO_THEME_PREFERENCE_KEY)).toBe("dark");
    expect(getThemePreference()).toBe("dark");

    setThemePreference("light");
    expect(storageMock.getItem(EXPANSO_THEME_PREFERENCE_KEY)).toBe("light");
    expect(getThemePreference()).toBe("light");
  });

  it("should fall back to system for invalid theme preference values", () => {
    storageMock.setItem(EXPANSO_THEME_PREFERENCE_KEY, "midnight");

    expect(getThemePreference()).toBe("system");
  });

  it("should resolve system theme preference from media query", () => {
    Object.defineProperty(globalThis, "window", {
      value: {
        localStorage: storageMock,
        matchMedia: () => ({ matches: true }),
      },
      writable: true,
      configurable: true,
    });

    expect(resolveThemePreference("system")).toBe("dark");
    expect(resolveThemePreference("light")).toBe("light");
  });

  it("should apply resolved theme to the root element", () => {
    const root = {
      classList: {
        toggle: vi.fn(),
      },
      style: {},
    } as unknown as Pick<HTMLElement, "classList" | "style">;

    expect(applyThemePreference("dark", root)).toBe("dark");

    expect(root.classList.toggle).toHaveBeenCalledWith("dark", true);
    expect(root.style.colorScheme).toBe("dark");
  });
});
