import { describe, expect, it } from "vitest";
import {
  getInitialYamlTemplate,
  normalizeYamlFileName,
  resolveTargetPath,
  validateFileName,
  validateFolderName,
} from "./createFileSystem";

describe("createFileSystem logic", () => {
  describe("normalizeYamlFileName", () => {
    it("appends .yml if missing", () => {
      expect(normalizeYamlFileName("custom")).toBe("custom.yml");
      expect(normalizeYamlFileName("email_snippets")).toBe("email_snippets.yml");
    });

    it("keeps existing .yml or .yaml extensions", () => {
      expect(normalizeYamlFileName("base.yml")).toBe("base.yml");
      expect(normalizeYamlFileName("config.yaml")).toBe("config.yaml");
      expect(normalizeYamlFileName("test.YML")).toBe("test.YML");
    });

    it("returns empty string for empty input", () => {
      expect(normalizeYamlFileName("  ")).toBe("");
    });
  });

  describe("validateFileName", () => {
    it("returns error for empty filename", () => {
      expect(validateFileName("   ")).toBe("File name cannot be empty.");
    });

    it("returns error for invalid characters", () => {
      expect(validateFileName("file*name.yml")).toContain("invalid characters");
      expect(validateFileName("file?name")).toContain("invalid characters");
    });

    it("returns error for duplicate file names (case-insensitive)", () => {
      const existing = ["base.yml", "work.yaml"];
      expect(validateFileName("base", existing)).toBe('File "base.yml" already exists in the selected directory.');
      expect(validateFileName("WORK.YAML", existing)).toBe('File "WORK.YAML" already exists in the selected directory.');
    });

    it("returns null for valid new file name", () => {
      expect(validateFileName("new_snippets", ["base.yml"])).toBeNull();
    });
  });

  describe("validateFolderName", () => {
    it("returns error for empty folder name", () => {
      expect(validateFolderName("   ")).toBe("Folder name cannot be empty.");
    });

    it("returns error for invalid characters", () => {
      expect(validateFolderName("folder:1")).toContain("invalid characters");
    });

    it("returns error for reserved protected folder names like packages", () => {
      expect(validateFolderName("packages")).toContain("reserved Espanso directory name");
      expect(validateFolderName("PACKAGES")).toContain("reserved Espanso directory name");
    });

    it("returns error for duplicate folder names", () => {
      expect(validateFolderName("work", ["work", "personal"])).toBe('Folder "work" already exists in the selected directory.');
    });

    it("returns null for valid new folder name", () => {
      expect(validateFolderName("projects", ["work"])).toBeNull();
    });
  });

  describe("getInitialYamlTemplate", () => {
    it("generates valid initial Espanso YAML content with filename", () => {
      const template = getInitialYamlTemplate("emails.yml");
      expect(template).toContain("Espanso match file: emails");
      expect(template).toContain("matches:");
    });
  });

  describe("resolveTargetPath", () => {
    it("resolves paths correctly without double slashes", () => {
      expect(resolveTargetPath("/path/to/match/", "work")).toBe("/path/to/match/work");
      expect(resolveTargetPath("/path/to/match", "/work/email.yml")).toBe("/path/to/match/work/email.yml");
    });
  });
});
