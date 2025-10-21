import { useCallback, useRef, useState } from "react";
import { type DateFormatOption, generateUniqueVarName, getReferencedVars } from "../../../logic/dateFormats";
import type { Snippet, SnippetVar, ValidationError } from "../../../logic/types";
import { buildTriggerInput, normalizeTriggerLines } from "../../../logic/snippetUtils";
import {
  configsToFormFields,
  formFieldsToConfigs,
} from "../formSnippet";
import type {
  AddSnippetKind,
  FormFieldConfig,
  FormSelectionState,
  SnippetEditTarget,
} from "../types";

export function useSnippetEditor() {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [editTarget, setEditTarget] = useState<SnippetEditTarget | null>(null);
  const [kind, setKind] = useState<AddSnippetKind>("text");
  const [triggersText, setTriggersText] = useState<string>("");
  const [replace, setReplace] = useState<string>("");
  const [vars, setVars] = useState<SnippetVar[]>([]);
  const [includeFile, setIncludeFile] = useState<string>("");
  const [imagePath, setImagePath] = useState<string>("");
  const [form, setForm] = useState<string>("");
  const [formFieldConfigs, setFormFieldConfigs] = useState<FormFieldConfig[]>([]);
  const [formSelection, setFormSelection] = useState<FormSelectionState | null>(null);
  const [description, setDescription] = useState<string>("");
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const replaceTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const visualEditorReplaceTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const formTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const resetForm = useCallback(() => {
    setKind("text");
    setTriggersText("");
    setReplace("");
    setVars([]);
    setIncludeFile("");
    setImagePath("");
    setForm("");
    setFormFieldConfigs([]);
    setFormSelection(null);
    setDescription("");
    setErrors([]);
    setWarnings([]);
    setIsSaving(false);
  }, []);

  const openAdd = useCallback(() => {
    setEditTarget(null);
    resetForm();
    setIsOpen(true);
  }, [resetForm]);

  const openEdit = useCallback((target: SnippetEditTarget) => {
    const editableSnippet = target.match.originalSnippet || target.match.snippet;
    const triggerInput = buildTriggerInput(editableSnippet);
    setEditTarget(target);
    setKind(
      editableSnippet.include_file
        ? "file"
        : editableSnippet.image_path !== undefined
          ? "image"
          : editableSnippet.form !== undefined
            ? "form"
            : "text",
    );
    setTriggersText(triggerInput.multiline);
    setReplace(editableSnippet.replace || "");
    setVars(editableSnippet.vars ? [...editableSnippet.vars] : []);
    setIncludeFile(target.match.resourcePath || editableSnippet.include_file || "");
    setImagePath(editableSnippet.image_path || "");
    setForm(editableSnippet.form || "");
    setFormFieldConfigs(formFieldsToConfigs(editableSnippet.form_fields));
    setFormSelection(null);
    setDescription(editableSnippet.description || "");
    setErrors([]);
    setWarnings([]);
    setIsOpen(true);
  }, []);

  const closeDialog = useCallback(() => {
    setIsOpen(false);
  }, []);

  const insertDateOption = useCallback(
    (option: DateFormatOption, mode: "replace" | "visualReplace" | "form") => {
      const uniqueName = generateUniqueVarName(vars, option.defaultVarName || option.id);
      const newVar: SnippetVar = {
        name: uniqueName,
        type: "date",
        params: { format: option.format },
      };
      const placeholder = `{{${uniqueName}}}`;

      if (mode !== "form") {
        const textarea = mode === "visualReplace"
          ? visualEditorReplaceTextareaRef.current
          : replaceTextareaRef.current;
        if (!textarea) {
          setReplace((prev) => (prev ? `${prev} ${placeholder}` : placeholder));
          setVars((prev) => [...prev, newVar]);
          return;
        }

        const start = textarea.selectionStart ?? replace.length;
        const end = textarea.selectionEnd ?? replace.length;
        const updatedText = replace.substring(0, start) + placeholder + replace.substring(end);
        setReplace(updatedText);
        setVars((prev) => [...prev, newVar]);

        setTimeout(() => {
          textarea.focus();
          const newCursor = start + placeholder.length;
          textarea.setSelectionRange(newCursor, newCursor);
        }, 0);
      } else {
        const textarea = formTextareaRef.current;
        if (!textarea) {
          setForm((prev) => (prev ? `${prev} ${placeholder}` : placeholder));
          setVars((prev) => [...prev, newVar]);
          return;
        }

        const start = textarea.selectionStart ?? form.length;
        const end = textarea.selectionEnd ?? form.length;
        const updatedText = form.substring(0, start) + placeholder + form.substring(end);
        setForm(updatedText);
        setVars((prev) => [...prev, newVar]);

        setTimeout(() => {
          textarea.focus();
          const newCursor = start + placeholder.length;
          textarea.setSelectionRange(newCursor, newCursor);
        }, 0);
      }
    },
    [form, replace, vars],
  );

  const removeVar = useCallback((varName: string) => {
    setVars((prev) => prev.filter((v) => v.name !== varName));
  }, []);

  const buildSnippetObject = useCallback((): Snippet => {
    const normalizedTriggers = normalizeTriggerLines(triggersText);
    const triggerFields =
      normalizedTriggers.length > 1
        ? { triggers: normalizedTriggers }
        : { trigger: normalizedTriggers[0] || "" };

    const snippet: Snippet = {
      ...triggerFields,
    };

    if (kind === "file") {
      snippet.include_file = includeFile.trim();
    } else if (kind === "image") {
      snippet.image_path = imagePath.trim();
    } else if (kind === "form") {
      snippet.form = form;
      const formFields = configsToFormFields(formFieldConfigs);
      if (formFields) {
        snippet.form_fields = formFields;
      }
      const referencedVars = getReferencedVars(form, vars);
      if (referencedVars.length > 0) {
        snippet.vars = referencedVars;
      }
    } else {
      snippet.replace = replace;
      const referencedVars = getReferencedVars(replace, vars);
      if (referencedVars.length > 0) {
        snippet.vars = referencedVars;
      }
    }

    if (description.trim()) {
      snippet.description = description.trim();
    }

    return snippet;
  }, [description, form, formFieldConfigs, imagePath, includeFile, kind, replace, triggersText, vars]);

  return {
    isOpen,
    setIsOpen,
    editTarget,
    setEditTarget,
    kind,
    setKind,
    triggersText,
    setTriggersText,
    replace,
    setReplace,
    vars,
    setVars,
    includeFile,
    setIncludeFile,
    imagePath,
    setImagePath,
    form,
    setForm,
    formFieldConfigs,
    setFormFieldConfigs,
    formSelection,
    setFormSelection,
    description,
    setDescription,
    errors,
    setErrors,
    warnings,
    setWarnings,
    isSaving,
    setIsSaving,
    replaceTextareaRef,
    visualEditorReplaceTextareaRef,
    formTextareaRef,
    resetForm,
    openAdd,
    openEdit,
    closeDialog,
    insertDateOption,
    removeVar,
    buildSnippetObject,
  };
}
