export interface SnippetVar {
  name: string;
  type: string;
  params?: Record<string, any>;
}

export interface Snippet {
  trigger?: string;
  triggers?: string[];
  replace?: string;
  markdown?: string;
  html?: string;
  include_file?: string;
  image_path?: string;
  form?: string;
  form_fields?: Record<string, any>;
  vars?: SnippetVar[];
  description?: string;
}

export interface ValidationError {
  message: string;
}
