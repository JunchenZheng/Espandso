import type { ImportedMatch } from "../../logic/importYaml";
import type { EspansoConfigPreview } from "../espanso-configs/types";

export type AddSnippetKind = "text" | "file" | "image" | "form";
export type TextReplacementFormat = "plain" | "markdown" | "html";
export type FormFieldControl = "text" | "multiline" | "choice" | "list";
export type FormFieldCategory = "text" | "choice" | "list";
export type TextFieldMode = "single" | "multiline";

export interface FormSelectionState {
  start: number;
  end: number;
  text: string;
}

export interface FormFieldConfig {
  id: string;
  control: FormFieldControl;
  defaultValue: string;
  valuesText: string;
}

export interface SnippetEditTarget {
  preview: EspansoConfigPreview;
  match: ImportedMatch;
  displayIndex: number;
}
