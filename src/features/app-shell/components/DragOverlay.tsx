import { Upload } from "lucide-react";
import { useI18n } from "../../../i18n/useI18n";
import type { AddSnippetKind } from "../../snippets/types";

interface DragOverlayProps {
  isDragging: boolean;
  isAddSnippetOpen: boolean;
  addSnippetKind: AddSnippetKind;
}

export function DragOverlay({ isDragging, isAddSnippetOpen, addSnippetKind }: DragOverlayProps) {
  const { t } = useI18n();

  if (
    !isDragging ||
    (isAddSnippetOpen && addSnippetKind !== "file" && addSnippetKind !== "image")
  ) {
    return null;
  }

  return (
    <div className="drag-overlay">
      <div className="drag-zone">
        <Upload className="mb-5 h-12 w-12" />
        <div className="text-2xl font-semibold">
          {isAddSnippetOpen && addSnippetKind === "file"
            ? t("drag.dropFileHere")
            : isAddSnippetOpen && addSnippetKind === "image"
              ? t("drag.dropImageFileHere")
              : t("drag.dropYamlFileHere")}
        </div>
        <div className="mt-2 text-base text-muted-foreground">
          {isAddSnippetOpen && addSnippetKind === "file"
            ? t("drag.fileSourceDescription")
            : isAddSnippetOpen && addSnippetKind === "image"
              ? t("drag.imageSourceDescription")
              : t("drag.yamlSourceDescription")}
        </div>
      </div>
    </div>
  );
}
