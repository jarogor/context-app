import { defineConfig, devices } from '@playwright/test';

/** Конфигурация браузерных тестов интерфейса. */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: {
    toHaveScreenshot: {
      // Строгий порог: смена палитры токенов заметно меняет кадр и не должна
      // маскироваться допуском. Оставляет запас лишь на сглаживание шрифтов.
      maxDiffPixelRatio: 0.002,
    },
  },
  use: {
    baseURL: 'http://localhost:1420',
    trace: 'on-first-retry',
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Визуальные эталоны снимаются на шрифтах конкретной машины. В CI другой
  // набор шрифтов, и сравнение падает на любом изменении отрисовки — снимки
  // проверяются локально, а в CI только сценарии.
  ignoreSnapshots: !!process.env.CI,
  // Медленный раннер не успевает отрисовать кадр за отведённое время: один
  // повтор отделяет тайминговый сбой от настоящей регрессии.
  retries: process.env.CI ? 1 : 0,
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
