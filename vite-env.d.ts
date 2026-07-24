/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_APP_NAME: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * Sello de la compilación que está corriendo en la pestaña. Lo inyecta Vite
 * (`define` en vite.config.ts) y se compara contra /version.json para detectar
 * un despliegue nuevo. En `vite dev` vale 'dev'.
 */
declare const __BUILD_ID__: string;
