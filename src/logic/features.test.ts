import { describe, expect, it, beforeEach } from "vitest";
import {
  EXPANSO_EXPERIMENTAL_YAML_WARNINGS_KEY,
  getExperimentalYamlWarningsEnabled,
  setExperimentalYamlWarningsEnabled,
  isYamlWarningsActive,
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

  it("should determine if yaml warnings active correctly", () => {
    expect(isYamlWarningsActive(true)).toBe(false);
    expect(isYamlWarningsActive(false)).toBe(false);
  });
});
