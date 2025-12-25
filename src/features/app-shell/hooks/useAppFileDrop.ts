import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { readFile } from "@tauri-apps/plugin-fs";
import { checkIsBinaryFilePath } from "../../../logic/fileCheck";
import { isImageFilePath } from "../../../logic/snippetUtils";
import type { AddSnippetKind } from "../../snippets/types";

interface DragDropPayload {
  paths: string[];
}

interface AppFileDropMessages {
  binaryFileNotAllowed: string;
  dropYamlFile: string;
  imageFileNotAllowed: string;
  invalidFile: string;
  invalidFileType: string;
  nonImageFileNotAllowed: string;
}

interface AppFileDropOptions {
  snippetEditorOpen: boolean;
  snippetKind: AddSnippetKind;
  messages: AppFileDropMessages;
  onDropIncludeFile: (path: string) => void;
  onDropImage: (path: string) => void;
  onDropYaml: (path: string) => void;
  setIsDragging: (isDragging: boolean) => void;
  showAlert: (description: string, title?: string) => void;
}

export function useAppFileDrop(options: AppFileDropOptions) {
  const optionsRef = useRef(options);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    let active = true;
    const unlisteners: (() => void)[] = [];

    async function addDroppedFile(path: string) {
      const {
        messages,
        onDropIncludeFile,
        onDropImage,
        onDropYaml,
        setIsDragging,
        showAlert,
        snippetEditorOpen,
        snippetKind,
      } = optionsRef.current;

      if (snippetEditorOpen) {
        if (snippetKind === "file") {
          if (isImageFilePath(path)) {
            showAlert(messages.imageFileNotAllowed, messages.invalidFileType);
            setIsDragging(false);
            return;
          }

          const isBinary = await checkIsBinaryFilePath(path, (filePath) => readFile(filePath));
          if (isBinary) {
            showAlert(messages.binaryFileNotAllowed, messages.invalidFileType);
            setIsDragging(false);
            return;
          }

          onDropIncludeFile(path);
          setIsDragging(false);
          return;
        }

        if (snippetKind === "image") {
          if (!isImageFilePath(path)) {
            showAlert(messages.nonImageFileNotAllowed, messages.invalidFileType);
            setIsDragging(false);
            return;
          }

          onDropImage(path);
          setIsDragging(false);
          return;
        }

        setIsDragging(false);
        return;
      }

      const lowerPath = path.toLowerCase();
      if (!lowerPath.endsWith(".yml") && !lowerPath.endsWith(".yaml")) {
        showAlert(messages.dropYamlFile, messages.invalidFile);
        return;
      }

      onDropYaml(path);
    }

    async function setupDragDrop() {
      try {
        const uEnter = await listen<DragDropPayload>("tauri://drag-enter", () => {
          const { setIsDragging, snippetEditorOpen, snippetKind } = optionsRef.current;
          if (snippetEditorOpen && (snippetKind === "text" || snippetKind === "form")) {
            return;
          }
          setIsDragging(true);
        });
        if (!active) {
          uEnter();
          return;
        }
        unlisteners.push(uEnter);

        const uDrop = await listen<DragDropPayload>("tauri://drag-drop", async (event) => {
          const { setIsDragging } = optionsRef.current;
          setIsDragging(false);
          const path = event.payload.paths[0];
          if (path) {
            await addDroppedFile(path);
          }
        });
        if (!active) {
          uDrop();
          return;
        }
        unlisteners.push(uDrop);

        const uCancel = await listen("tauri://drag-leave", () => {
          optionsRef.current.setIsDragging(false);
        });
        if (!active) {
          uCancel();
          return;
        }
        unlisteners.push(uCancel);
      } catch (error) {
        console.error("Failed to setup drag and drop:", error);
      }
    }

    void setupDragDrop();

    return () => {
      active = false;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, []);
}
