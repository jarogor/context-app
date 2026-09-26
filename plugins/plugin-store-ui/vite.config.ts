import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), svelte()],
  base: './',
  optimizeDeps: {
    exclude: ['@texture/ui'],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
