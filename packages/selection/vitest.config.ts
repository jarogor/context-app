import { defineConfig } from 'vitest/config';

/** Конфигурация юнит-тестов общего слоя выделения. */
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});
