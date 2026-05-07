import { act, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { useSearchIndex } from "./useSearchIndex";

function SearchShortcutProbe() {
  const { isSearchOpen } = useSearchIndex();

  return <div>{isSearchOpen ? "open" : "closed"}</div>;
}

describe("useSearchIndex", () => {
  it("opens search with the platform search shortcut", () => {
    renderWithProviders(<SearchShortcutProbe />);

    expect(screen.getByText("closed")).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "f", metaKey: true }));
    });

    expect(screen.getByText("open")).toBeInTheDocument();
  });

  it("ignores the previous Command/Ctrl+K shortcut", () => {
    renderWithProviders(<SearchShortcutProbe />);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
    });

    expect(screen.getByText("closed")).toBeInTheDocument();
  });
});
