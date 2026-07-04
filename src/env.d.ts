interface ImportMetaEnv {
  readonly VITE_DB_URL?: string;
  readonly VITE_DB_PUBLIC_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
