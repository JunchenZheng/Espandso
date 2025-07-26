import { SnippetVar } from "./types";

export interface DateFormatOption {
  id: string;
  category: "iso" | "slash" | "dot" | "text" | "cjk";
  format: string;
  labelKey: string;
  example: string;
  defaultVarName: string;
}

export const DATE_FORMAT_OPTIONS: DateFormatOption[] = [
  {
    id: "iso_8601",
    category: "iso",
    format: "%Y-%m-%d",
    labelKey: "dateFormats.iso8601",
    example: "2025-06-18",
    defaultVarName: "mydate",
  },
  {
    id: "slash_us",
    category: "slash",
    format: "%m/%d/%Y",
    labelKey: "dateFormats.slashUs",
    example: "06/18/2025",
    defaultVarName: "us_date",
  },
  {
    id: "slash_uk",
    category: "slash",
    format: "%d/%m/%Y",
    labelKey: "dateFormats.slashUk",
    example: "18/06/2025",
    defaultVarName: "uk_date",
  },
  {
    id: "dot_eu",
    category: "dot",
    format: "%d.%m.%Y",
    labelKey: "dateFormats.dotEu",
    example: "18.06.2025",
    defaultVarName: "mydate",
  },
  {
    id: "text_us",
    category: "text",
    format: "%b %d, %Y",
    labelKey: "dateFormats.textUs",
    example: "Jun 18, 2025",
    defaultVarName: "mydate",
  },
  {
    id: "text_uk",
    category: "text",
    format: "%d %b %Y",
    labelKey: "dateFormats.textUk",
    example: "18 Jun 2025",
    defaultVarName: "mydate",
  },
  {
    id: "cjk_local",
    category: "cjk",
    format: "%Y年%m月%d日",
    labelKey: "dateFormats.cjkLocal",
    example: "2025年06月18日",
    defaultVarName: "mydate",
  },
];

/**
 * Generates a unique variable name for a new date variable to avoid collisions.
 */
export function generateUniqueVarName(existingVars: SnippetVar[], baseName: string = "mydate"): string {
  const existingNames = new Set(existingVars.map((v) => v.name));
  if (!existingNames.has(baseName)) {
    return baseName;
  }
  let counter = 2;
  while (existingNames.has(`${baseName}_${counter}`)) {
    counter++;
  }
  return `${baseName}_${counter}`;
}

/**
 * Filter snippet vars so only those referenced in replace text are kept, or clean up unused date vars.
 */
export function getReferencedVars(replaceText: string, vars?: SnippetVar[]): SnippetVar[] {
  if (!vars || vars.length === 0) return [];
  const referenced = new Set<string>();
  const regex = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
  let match;
  while ((match = regex.exec(replaceText)) !== null) {
    referenced.add(match[1]);
  }
  return vars.filter((v) => referenced.has(v.name));
}
