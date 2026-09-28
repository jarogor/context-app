import { defineConfig } from 'vitest/config';

/** Конфигурация модульных тестов приложения. */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
