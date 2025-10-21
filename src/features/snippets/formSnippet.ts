import type {
  AddSnippetKind,
  FormFieldCategory,
  FormFieldConfig,
  FormFieldControl,
  TextFieldMode,
} from "./types";

export type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

export function snippetKindLabel(kind: AddSnippetKind, t: TranslateFn): string {
  if (kind === "file") return t("snippets.typeFileShort");
  if (kind === "image") return t("snippets.typeImageShort");
  if (kind === "form") return t("snippets.typeFormShort");
  return t("snippets.typeTextShort");
}

export function createDefaultFormFieldConfig(id: string): FormFieldConfig {
  return {
    id,
    control: "text",
    defaultValue: "",
    valuesText: "",
  };
}

export function extractFormFieldNames(form: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  const fieldPattern = /\[\[([^\][\n]+)\]\]/g;
  let match: RegExpExecArray | null;

  while ((match = fieldPattern.exec(form)) !== null) {
    const name = match[1].trim();
    if (name && !seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }

  return names;
}

export function getSelectedFormFieldId(selection: string): string {
  const trimmed = selection.trim();
  const placeholderMatch = trimmed.match(/^\[\[([^\][\n]+)\]\]$/);
  const rawName = placeholderMatch ? placeholderMatch[1] : trimmed;
  return rawName
    .trim()
    .replace(/^\[\[|\]\]$/g, "")
    .replace(/\s+/g, "_")
    .replace(/[\[\]{}]/g, "")
    .trim();
}

export function buildUniqueFormFieldId(baseId: string, fieldNames: string[]): string {
  const fallback = baseId || "field";
  if (!fieldNames.includes(fallback)) return fallback;

  let suffix = 2;
  while (fieldNames.includes(`${fallback}_${suffix}`)) {
    suffix += 1;
  }
  return `${fallback}_${suffix}`;
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeFormFieldConfigs(fieldNames: string[], current: FormFieldConfig[]): FormFieldConfig[] {
  return fieldNames.map((name) => current.find((field) => field.id === name) || createDefaultFormFieldConfig(name));
}

export function areFormFieldConfigsEqual(a: FormFieldConfig[], b: FormFieldConfig[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((field, index) => {
    const other = b[index];
    return (
      field.id === other.id &&
      field.control === other.control &&
      field.defaultValue === other.defaultValue &&
      field.valuesText === other.valuesText
    );
  });
}

export function getFormFieldCategory(field: FormFieldConfig): FormFieldCategory {
  if (field.control === "choice" || field.control === "list") return field.control;
  return "text";
}

export function getTextFieldMode(field: FormFieldConfig): TextFieldMode {
  return field.control === "multiline" ? "multiline" : "single";
}

export function formFieldsToConfigs(formFields: Record<string, any> | undefined): FormFieldConfig[] {
  if (!formFields) return [];

  return Object.entries(formFields).map(([id, value]) => {
    const field = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const rawType = field.type === "choice" || field.type === "list" ? field.type : "";
    const control: FormFieldControl = field.multiline === true ? "multiline" : rawType || "text";
    const values = field.values;

    return {
      id,
      control,
      defaultValue: field.default !== undefined && field.default !== null ? String(field.default) : "",
      valuesText: Array.isArray(values) ? values.map((item) => String(item)).join("\n") : values ? String(values) : "",
    };
  });
}

export function configsToFormFields(configs: FormFieldConfig[]): Record<string, any> | undefined {
  const formFields: Record<string, any> = {};

  for (const config of configs) {
    const field: Record<string, any> = {};
    if (config.control === "multiline") {
      field.multiline = true;
    } else if (config.control === "choice" || config.control === "list") {
      field.type = config.control;
      const values = config.valuesText
        .split("\n")
        .map((value) => value.trim())
        .filter(Boolean);
      if (values.length > 0) {
        field.values = values;
      }
    }

    if (config.defaultValue.trim()) {
      field.default = config.defaultValue.trim();
    }

    if (Object.keys(field).length > 0) {
      formFields[config.id] = field;
    }
  }

  return Object.keys(formFields).length > 0 ? formFields : undefined;
}
