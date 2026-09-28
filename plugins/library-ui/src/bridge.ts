import libraryConfig from './library-config.json';

type Message = {
  channel: 'texture-plugin';
  type: string;
  id?: string;
  command?: string;
  payload?: unknown;
  event?: string;
  value?: unknown;
  error?: string;
};

let sequence = 0;
const pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
const listeners = new Map<string, Set<(value: unknown) => void>>();

window.addEventListener('message', (event: MessageEvent<Message>) => {
  const message = event.data;
  if (!message || message.channel !== 'texture-plugin') return;
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
    window.parent.postMessage({ channel: 'texture-plugin', type, id, ...payload }, '*');
  });
}

/** Вызов произвольной команды приложения. */
export function invoke<T = unknown>(command: string, payload?: unknown): Promise<T> {
  return request<T>('invoke', { command, payload });
}

/** Opaque-операция активного source-плагина сессии. */
export function operation<T = unknown>(action: string, payload: unknown = {}): Promise<T> {
  return invoke<T>('invoke_plugin_operation', {
    operation: action,
    payload,
    storageRoot: libraryConfig.state_dir,
  });
}

/** Просьба оболочке открыть рабочее место чтения книги. */
export function openReader(value: { bookId: string; title: string; format: string }): void {
  window.parent.postMessage(
    { channel: 'texture-plugin', type: 'reader:open', value },
    '*',
  );
}

export async function listen<T = unknown>(event: string, listener: (value: T) => void): Promise<() => void> {
  let eventListeners = listeners.get(event);
  if (!eventListeners) {
    eventListeners = new Set();
    listeners.set(event, eventListeners);
  }
  eventListeners.add(listener as (value: unknown) => void);
  await request('listen', { event });
  return () => eventListeners?.delete(listener as (value: unknown) => void);
}
