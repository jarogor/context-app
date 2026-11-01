import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

/** Конфигурация тестов контракта интерфейса.
 *
 * Плагин Svelte нужен потому, что очистка деклараций берёт тексты из
 * `@context/i18n`, а активный язык там объявлен руной. Тестам компоненты не
 * требуются — только компиляция модуля состояния.
 */
export default defineConfig({
  plugins: [svelte()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.ts'],
  },
});
