type Message = {
  channel: 'booklib-plugin';
  type: string;
  id?: string;
  command?: string;
  payload?: unknown;
  event?: string;
  value?: unknown;
  error?: string;
};

let sequence = 0;
const pending = new Map<
  string,
  { resolve: (value: unknown) => void; reject: (error: Error) => void }
>();
const listeners = new Map<string, Set<(value: unknown) => void>>();

window.addEventListener('message', (event: MessageEvent<Message>) => {
  const message = event.data;
  if (!message || message.channel !== 'booklib-plugin') return;
  if (message.type === 'response' && message.id) {
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error));
    else request.resolve(message.value);
  }
  if (message.type === 'event' && message.event) {
    listeners.get(message.event)?.forEach((listener) => listener(message.value));
  }
});

function request<T>(type: string, payload: Omit<Message, 'channel' | 'type'>): Promise<T> {
  const id = `plugin-${++sequence}`;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
    window.parent.postMessage({ channel: 'booklib-plugin', type, id, ...payload }, '*');
  });
}

/** Вызов opaque-операции базового плагина стора. */
export function operation<T = unknown>(action: string, payload: unknown = {}): Promise<T> {
  return request<T>('invoke', {
    command: 'invoke_base_plugin_operation',
    payload: { plugin: 'plugin-store', operation: action, payload },
  });
}

/** Выбор zip-пакета плагина через системный диалог. */
export function pickPackage(): Promise<string | null> {
  return request<string | null>('dialog.open', {
    payload: {
      multiple: false,
      directory: false,
      filters: [{ name: 'Пакет плагина', extensions: ['zip'] }],
    },
  });
}

/** Признак неприменённых изменений активности плагинов. */
export function pendingChanges(): Promise<{ pending: boolean }> {
  return request<{ pending: boolean }>('invoke', {
    command: 'plugin_activation_pending',
    payload: {},
  });
}

/** Подписка на прикладное событие, транслируемое оболочкой. */
export async function listen<T = unknown>(
  event: string,
  listener: (value: T) => void,
): Promise<() => void> {
  let eventListeners = listeners.get(event);
  if (!eventListeners) {
    eventListeners = new Set();
    listeners.set(event, eventListeners);
  }
  eventListeners.add(listener as (value: unknown) => void);
  await request('listen', { event });
  return () => eventListeners?.delete(listener as (value: unknown) => void);
}
