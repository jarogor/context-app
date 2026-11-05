import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), svelte()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // Каталоги сборки Rust и артефакты не должны наблюдаться: их много,
      // и на них исчерпывается системный лимит файловых наблюдателей.
      // `dev_data` — служебные данные приложения (состояние и кэш webview):
      // движок webview постоянно переписывает свой кэш, и без игнора Vite
      // бесконечно перезагружал бы страницу.
      ignored: ['**/target/**', '**/dev_data', '**/dev_data/**'],
    },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  optimizeDeps: {
    exclude: ['@context/ui', '@context/ui-schema', '@context/testing'],
  },
  build: {
    target: 'es2021',
  },
});
