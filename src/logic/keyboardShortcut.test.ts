import { describe, expect, it } from "vitest";
import { getSearchShortcutLabel } from "./keyboardShortcut";

describe("keyboard shortcut labels", () => {
  it("uses the Command symbol on macOS", () => {
    expect(getSearchShortcutLabel("MacIntel")).toBe("⌘F");
  });

  it("uses Ctrl on Windows and Linux platforms", () => {
    expect(getSearchShortcutLabel("Win32")).toBe("Ctrl+F");
    expect(getSearchShortcutLabel("Linux x86_64")).toBe("Ctrl+F");
  });
});
