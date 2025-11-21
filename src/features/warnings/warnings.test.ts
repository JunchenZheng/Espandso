import { describe, expect, it } from "vitest";
import {
  clearYamlWarningsFilterState,
  closeYamlWarningsDialogState,
  openYamlWarningsDialogState,
  type YamlWarningsDialogState,
} from "./hooks/useYamlWarnings";

describe("YAML Warnings Feature", () => {
  it("opens the warnings dialog with an optional file filter", () => {
    const state: YamlWarningsDialogState = {
      isOpen: false,
      filterPath: null,
    };

    expect(openYamlWarningsDialogState(state, "/match/base.yml")).toEqual({
      isOpen: true,
      filterPath: "/match/base.yml",
    });
  });

  it("clears stale filters when opening the global warnings dialog", () => {
    const state: YamlWarningsDialogState = {
      isOpen: false,
      filterPath: "/match/base.yml",
    };

    expect(openYamlWarningsDialogState(state)).toEqual({
      isOpen: true,
      filterPath: null,
    });
  });

  it("closes the dialog without losing the current filter", () => {
    const state: YamlWarningsDialogState = {
      isOpen: true,
      filterPath: "/match/base.yml",
    };

    expect(closeYamlWarningsDialogState(state)).toEqual({
      isOpen: false,
      filterPath: "/match/base.yml",
    });
  });

  it("clears the active warnings filter", () => {
    const state: YamlWarningsDialogState = {
      isOpen: true,
      filterPath: "/match/base.yml",
    };

    expect(clearYamlWarningsFilterState(state)).toEqual({
      isOpen: true,
      filterPath: null,
    });
  });
});
