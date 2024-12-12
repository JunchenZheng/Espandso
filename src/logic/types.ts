export interface Snippet {
  trigger?: string;
  triggers?: string[];
  replace?: string;
  include_file?: string;
  description?: string;
}

export interface ValidationError {
  message: string;
}
