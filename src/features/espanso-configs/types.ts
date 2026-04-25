import type { EspansoConfigFile } from "../../logic/espansoPaths";
import type { ImportedMatch } from "../../logic/importYaml";
import type { Snippet } from "../../logic/types";

export interface EspansoConfigPreview {
  config: EspansoConfigFile;
  snippetCount: number;
  inlineCount: number;
  resourceCount: number;
  imageCount: number;
  formCount: number;
  warningCount: number;
  warnings: string[];
  snippets: Snippet[];
  importedMatches: ImportedMatch[];
}

export interface EspansoConfigPreviewTreeNode {
  name: string;
  path: string;
  relativePath: string;
  isDir: boolean;
  snippetCount: number;
  fileCount: number;
  isCollectionRoot?: boolean;
  preview?: EspansoConfigPreview;
  children?: EspansoConfigPreviewTreeNode[];
}
