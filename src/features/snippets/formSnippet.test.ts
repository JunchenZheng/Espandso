import { describe, expect, it } from "vitest";
import {
  areFormFieldConfigsEqual,
  buildUniqueFormFieldId,
  configsToFormFields,
  createDefaultFormFieldConfig,
  extractFormFieldNames,
  formFieldsToConfigs,
  getSelectedFormFieldId,
} from "./formSnippet";

describe("formSnippet helpers", () => {
  it("extracts form field names correctly", () => {
    const template = "Hello [[name]], your order [[order_id]] is ready. [[name]]";
    const names = extractFormFieldNames(template);
    expect(names).toEqual(["name", "order_id"]);
  });

  it("handles selected form field ID cleanup", () => {
    expect(getSelectedFormFieldId("[[ user_name ]]")).toBe("user_name");
    expect(getSelectedFormFieldId("  some field  ")).toBe("some_field");
  });

  it("builds unique form field IDs", () => {
    expect(buildUniqueFormFieldId("field", ["field", "field_2"])).toBe("field_3");
    expect(buildUniqueFormFieldId("name", ["other"])).toBe("name");
  });

  it("converts form fields object to configs and back", () => {
    const raw = {
      choice_field: { type: "choice", values: ["A", "B"], default: "A" },
      multiline_field: { multiline: true, default: "line1" },
    };

    const configs = formFieldsToConfigs(raw);
    expect(configs).toHaveLength(2);
    expect(configs[0]).toEqual({
      id: "choice_field",
      control: "choice",
      defaultValue: "A",
      valuesText: "A\nB",
    });

    const back = configsToFormFields(configs);
    expect(back).toEqual(raw);
  });

  it("checks config equality accurately", () => {
    const a = [createDefaultFormFieldConfig("f1")];
    const b = [createDefaultFormFieldConfig("f1")];
    expect(areFormFieldConfigsEqual(a, b)).toBe(true);

    const c = [{ ...a[0], defaultValue: "changed" }];
    expect(areFormFieldConfigsEqual(a, c)).toBe(false);
  });
});
