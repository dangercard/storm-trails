interface ImportMetaEnv {
  /** The site's name, from .env */
  readonly VITE_APP_NAME: string;
  /** The languages offered in the picker, by code, comma-separated (others open only with ?lang=); default en */
  readonly VITE_LANGUAGES?: string;
}
