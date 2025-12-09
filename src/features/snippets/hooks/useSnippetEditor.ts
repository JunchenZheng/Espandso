import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type DateFormatOption, generateUniqueVarName, getReferencedVars } from "../../../logic/dateFormats";
import type { Snippet, SnippetVar, ValidationError } from "../../../logic/types";
import { buildTriggerInput, normalizeTriggerLines } from "../../../logic/snippetUtils";
import {
  areFormFieldConfigsEqual,
  buildUniqueFormFieldId,
  createDefaultFormFieldConfig,
  escapeRegExp,
  configsToFormFields,
  extractFormFieldNames,
  formFieldsToConfigs,
  getSelectedFormFieldId,
  normalizeFormFieldConfigs,
} from "../formSnippet";
import type {
  AddSnippetKind,
  FormFieldConfig,
  FormFieldControl,
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

  const detectedFormFieldNames = useMemo(() => extractFormFieldNames(form), [form]);
  const detectedFormFieldKey = detectedFormFieldNames.join("\n");

  useEffect(() => {
    setFormFieldConfigs((current) => {
      const normalized = normalizeFormFieldConfigs(detectedFormFieldNames, current);
      return areFormFieldConfigsEqual(current, normalized) ? current : normalized;
    });
  }, [detectedFormFieldKey]);

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

  const updateFormFieldConfig = useCallback((id: string, patch: Partial<FormFieldConfig>) => {
    setFormFieldConfigs((current) => current.map((field) => (
      field.id === id ? { ...field, ...patch } : field
    )));
  }, []);

  const undoFormField = useCallback((fieldId: string) => {
    const placeholderPattern = new RegExp(`\\[\\[\\s*${escapeRegExp(fieldId)}\\s*\\]\\]`, "g");
    const nextForm = form.replace(placeholderPattern, fieldId);

    setForm(nextForm);
    setFormFieldConfigs((current) => current.filter((field) => field.id !== fieldId));
    setFormSelection(null);

    requestAnimationFrame(() => {
      formTextareaRef.current?.focus();
    });
  }, [form]);

  const captureFormSelection = useCallback((textarea: HTMLTextAreaElement) => {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.slice(start, end);

    if (!selectedText.trim()) {
      setFormSelection(null);
      return false;
    }

    setFormSelection({
      start,
      end,
      text: selectedText,
    });
    return true;
  }, []);

  const configureSelectedFormField = useCallback((control: FormFieldControl) => {
    if (!formSelection) return;

    const selectedText = formSelection.text;
    const selectedFieldId = getSelectedFormFieldId(selectedText);
    const isExistingPlaceholder = /^\s*\[\[[^\][\n]+\]\]\s*$/.test(selectedText);
    const existingFieldNames = extractFormFieldNames(form);
    const fieldId = isExistingPlaceholder
      ? selectedFieldId
      : buildUniqueFormFieldId(selectedFieldId, existingFieldNames);
    const placeholder = `[[${fieldId}]]`;
    const nextForm = isExistingPlaceholder
      ? form
      : `${form.slice(0, formSelection.start)}${placeholder}${form.slice(formSelection.end)}`;

    setForm(nextForm);
    setFormFieldConfigs((current) => {
      const next = normalizeFormFieldConfigs(extractFormFieldNames(nextForm), current);
      const existing = next.find((field) => field.id === fieldId);
      if (existing) {
        return next.map((field) => (field.id === fieldId ? { ...field, control } : field));
      }
      return [...next, { ...createDefaultFormFieldConfig(fieldId), control }];
    });
    setFormSelection(null);

    requestAnimationFrame(() => {
      const textarea = formTextareaRef.current;
      if (!textarea) return;
      const cursor = isExistingPlaceholder ? formSelection.end : formSelection.start + placeholder.length;
      textarea.focus();
      textarea.setSelectionRange(cursor, cursor);
    });
  }, [form, formSelection]);

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
    updateFormFieldConfig,
    undoFormField,
    captureFormSelection,
    configureSelectedFormField,
    buildSnippetObject,
  };
}
