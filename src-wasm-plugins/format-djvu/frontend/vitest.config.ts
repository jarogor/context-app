import { defineConfig } from 'vitest/config';

/** Конфигурация юнит-тестов фронтенд-проекта плагина. */
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.ts'],
  },
});
