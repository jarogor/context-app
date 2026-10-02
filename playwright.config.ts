import { defineConfig, devices } from '@playwright/test';

/** Конфигурация браузерных тестов интерфейса. */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02,
    },
  },
  use: {
    baseURL: 'http://localhost:1420',
    trace: 'on-first-retry',
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Браузерные сценарии выполняются последовательно: приложение тяжёлое
  // (WASM-плагины, вложенные iframe), и параллельные воркеры давали редкие
  // гонки в таймингах (по аналогии с последовательными тестами Rust-ядра).
  workers: 1,
  webServer: {
    command: 'npm run dev:test',
    url: 'http://localhost:1420',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
