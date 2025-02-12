import { describe, expect, it } from "vitest";
import { en } from "../i18n/locales/en";
import { zhCN } from "../i18n/locales/zh-CN";
import { getNestedValue, interpolate, translate } from "../i18n/translate";
import type { TranslationTree } from "../i18n/types";

describe("i18n translation tests", () => {
  it("should return correct English string for simple and nested keys", () => {
    expect(getNestedValue(en as any, "app.name")).toBe("Expandso");
    expect(translate("en", "app.name")).toBe("Expandso");
    expect(translate("en", "actions.refresh")).toBe("Refresh");
    expect(translate("en", "settings.language")).toBe("Language");
  });


  it("should return correct Chinese string for simple and nested keys", () => {
    expect(translate("zh-CN", "actions.refresh")).toBe("刷新");
    expect(translate("zh-CN", "settings.language")).toBe("界面语言");
  });

  it("should fallback to English if key is missing in target locale or unknown locale", () => {
    expect(translate("unknown" as any, "actions.refresh")).toBe("Refresh");
  });

  it("should return key itself if key is missing in all locales", () => {
    expect(translate("en", "nonexistent.key.name")).toBe("nonexistent.key.name");
  });

  it("should correctly interpolate parameters into templates", () => {
    expect(interpolate("Hello {{name}}!", { name: "World" })).toBe("Hello World!");
    expect(
      translate("en", "errors.failedToSaveSnippet", { message: "Disk full" })
    ).toBe("Failed to save snippet: Disk full");
    expect(
      translate("zh-CN", "errors.failedToSaveSnippet", { message: "磁盘已满" })
    ).toBe("保存片段失败：磁盘已满");
  });

  it("should have matching key structure between en and zh-CN", () => {
    function getAllKeys(obj: TranslationTree, prefix = ""): string[] {
      let keys: string[] = [];
      for (const key of Object.keys(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        const val = obj[key];
        if (typeof val === "object" && val !== null) {
          keys = keys.concat(getAllKeys(val as TranslationTree, fullKey));
        } else {
          keys.push(fullKey);
        }
      }
      return keys.sort();
    }

    const enKeys = getAllKeys(en);
    const zhKeys = getAllKeys(zhCN);

    expect(zhKeys).toEqual(enKeys);
  });
});
