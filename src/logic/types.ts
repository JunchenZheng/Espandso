export interface Snippet {
  trigger: string;
  replace?: string;
  include_file?: string;
  description?: string;
}

export interface SnippetFile {
  version: number;
  snippets: Snippet[];
}

export interface ValidationError {
  message: string;
}

export interface AppConfig {
  repoPath: string;
  autoInstall: boolean;
}

export interface FileTreeItem {
  name: string;
  path: string;
  isDir: boolean;
  children?: FileTreeItem[];
}
