/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ENABLE_EXPERIMENTAL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
