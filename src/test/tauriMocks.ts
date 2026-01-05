import { vi } from "vitest";

export const mockInvoke = vi.fn();
export const mockReadTextFile = vi.fn();
export const mockWriteTextFile = vi.fn();
export const mockOpen = vi.fn();
export const mockSave = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  readTextFile: mockReadTextFile,
  writeTextFile: mockWriteTextFile,
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: mockOpen,
  save: mockSave,
}));
