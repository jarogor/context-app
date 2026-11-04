import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

/** Собранный модуль рисования внутри каталога плагина. */
const VIEWER_DIR = fileURLToPath(new URL('../viewer', import.meta.url));

/** Шаблон страницы модуля рисования. */
const ENTRY_TEMPLATE = fileURLToPath(new URL('./index.html', import.meta.url));

/** Исходник оформления области содержимого. */
const STYLE_SOURCE = fileURLToPath(new URL('./src/style.css', import.meta.url));

/** Метка, на место которой в сборке встаёт оформление. */
const STYLE_MARKER = '<!--context-viewer-style-->';

/** Кладка статической точки входа рядом с бандлом: стили до первых скриптов. */
function entryTemplate(): Plugin {
  const style = readFileSync(STYLE_SOURCE, 'utf8');
  const template = readFileSync(ENTRY_TEMPLATE, 'utf8');
  const source = template.replace(STYLE_MARKER, `<style>\n${style}\n    </style>`);
  return {
    name: 'format-epub-viewer-entry-template',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'index.html', source });
    },
  };
}

export default defineConfig({
  plugins: [entryTemplate()],
  build: {
    outDir: VIEWER_DIR,
    emptyOutDir: true,
    target: 'es2021',
    lib: {
      entry: fileURLToPath(new URL('./src/main.ts', import.meta.url)),
      formats: ['es'],
      fileName: () => 'viewer.js',
    },
    rollupOptions: {
      output: { codeSplitting: false },
    },
  },
});
