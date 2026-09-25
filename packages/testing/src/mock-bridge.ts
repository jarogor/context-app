/** Мок моста приложения для тестов без запущенного Tauri. */

/** Обработчик команды invoke. */
export type MockHandler = (payload: unknown) => unknown;

/** Настройка мока моста. */
export interface MockBridgeConfig {
  /** Обработчики команд `invoke`: имя команды -> обработчик. */
  handlers?: Record<string, MockHandler>;
  /** Результат файлового диалога. */
  dialogResult?: unknown;
}

let config: MockBridgeConfig = {};

/** Задание конфигурации мока. */
export function configureMockBridge(next: MockBridgeConfig): void {
  config = next;
}

/** Мок команды `invoke`. */
export function mockInvoke(command: string, payload: unknown): unknown {
  const handler = config.handlers?.[command];
  if (handler) {
    return handler(payload);
  }
  return { mock: true, command, payload };
}

/** Мок файлового диалога. */
export function mockOpenDialog(): unknown {
  return config.dialogResult ?? null;
}

/** Хранилище подписок мока. */
const listeners = new Map<string, Set<(value: unknown) => void>>();

/** Мок подписки на событие. */
export function mockListen(event: string, handler: (value: unknown) => void): () => void {
  const set = listeners.get(event) ?? new Set();
  set.add(handler);
  listeners.set(event, set);
  return () => set.delete(handler);
}

/** Эмуляция события для тестов. */
export function emitMockEvent(event: string, value: unknown): void {
  listeners.get(event)?.forEach((handler) => handler(value));
}
