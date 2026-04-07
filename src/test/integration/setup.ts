import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import "./tauriHarness";

afterEach(() => {
  cleanup();
});

const integrationStorage = new Map<string, string>();

Object.defineProperty(window, "localStorage", {
  writable: true,
  configurable: true,
  value: {
    getItem: vi.fn((key: string) => integrationStorage.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      integrationStorage.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      integrationStorage.delete(key);
    }),
    clear: vi.fn(() => {
      integrationStorage.clear();
    }),
  },
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

Object.defineProperty(window, "ResizeObserver", {
  writable: true,
  value: class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
});

Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
  writable: true,
  value: vi.fn(),
});

Object.defineProperty(window.HTMLElement.prototype, "hasPointerCapture", {
  writable: true,
  value: vi.fn().mockReturnValue(false),
});

Object.defineProperty(window.HTMLElement.prototype, "releasePointerCapture", {
  writable: true,
  value: vi.fn(),
});

Object.defineProperty(navigator, "clipboard", {
  writable: true,
  configurable: true,
  value: {
    writeText: vi.fn(async () => undefined),
  },
});
