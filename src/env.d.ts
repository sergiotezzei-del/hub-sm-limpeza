interface ImportMetaEnv {
  readonly VITE_DB_URL?: string;
  readonly VITE_DB_PUBLIC_KEY?: string;
  readonly VITE_ADMIN_AUTH_EMAIL?: string;
  readonly VITE_ADMIN_USER_ID?: string;
  readonly VITE_GUARD_CARLOS_AUTH_EMAIL?: string;
  readonly VITE_GUARD_SALOMAO_AUTH_EMAIL?: string;
  readonly VITE_GUARD_CARLOS_USER_ID?: string;
  readonly VITE_GUARD_SALOMAO_USER_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "tesseract.js/dist/tesseract.esm.min.js" {
  import Tesseract = require("tesseract.js");
  const tesseract: typeof Tesseract;
  export default tesseract;
}
