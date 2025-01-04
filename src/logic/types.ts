export interface Snippet {
  trigger?: string;
  triggers?: string[];
  replace?: string;
  include_file?: string;
  form?: string;
  form_fields?: Record<string, any>;
  description?: string;
}

export interface ValidationError {
  message: string;
}
