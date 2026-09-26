/** Мост оболочки к приложению.
 *
 * В обычном режиме вызывает Tauri, а в браузерных тестах
 * (`VITE_MOCK_BRIDGE=1`) подставляет мок из `@texture/testing`.
 */

const useMock = import.meta.env.VITE_MOCK_BRIDGE === '1';

let mockConfigured = false;

/** Ленивая загрузка и настройка мока. */
async function mock() {
  const testing = await import('@texture/testing');
  if (!mockConfigured) {
    testing.configureMockBridge(testing.defaultMockConfig());
    mockConfigured = true;
  }
  return testing;
}

/** Вызов команды приложения. */
export async function invokeCommand(command: string, payload: unknown): Promise<unknown> {
  if (useMock) {
    const testing = await mock();
    return testing.mockInvoke(command, payload);
  }
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke(command, payload as Record<string, unknown>);
}

/** Открытие файлового диалога. */
export async function openDialog(options: unknown): Promise<unknown> {
  if (useMock) {
    const testing = await mock();
    return testing.mockOpenDialog();
  }
  const { open } = await import('@tauri-apps/plugin-dialog');
  return open(options as never);
}

/** Подписка на прикладное событие. */
export async function listenEvent(
  event: string,
  handler: (value: unknown) => void,
): Promise<() => void> {
  if (useMock) {
    const testing = await mock();
    return testing.mockListen(event, handler);
  }
  const { listen } = await import('@tauri-apps/api/event');
  return listen(event, (message) => handler(message.payload));
}
