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
let pluginStorageRoot: string | undefined;
const pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
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

export function invoke<T = unknown>(command: string, payload?: unknown): Promise<T> {
  return request<T>('invoke', { command, payload });
}

export function operation<T = unknown>(
  action: string,
  payload: unknown = {},
  options: { root?: string; writable?: boolean; storageRoot?: string } = {},
): Promise<T> {
  const requestPayload: Record<string, unknown> = { operation: action, payload };
  if (options.root) {
    requestPayload.plugin = 'library';
    requestPayload.root = options.root;
    requestPayload.writable = options.writable;
  }
  const storageRoot = options.storageRoot ?? pluginStorageRoot;
  if (!storageRoot) {
    return Promise.reject(new Error('Конфигурация plugin storage не загружена'));
  }
  requestPayload.storage_root = storageRoot;
  return invoke<T>('invoke_plugin_operation', {
    ...requestPayload,
  });
}

export function setPluginStorageRoot(path: string): void {
  pluginStorageRoot = path;
}

export function pluginOperation<T = unknown>(
  action: string,
  payload: unknown = {},
  options: { root?: string; writable?: boolean; storageRoot?: string } = {},
): Promise<T> {
  return operation<T>(action, payload, {
    root: options.root ?? '.',
    writable: options.writable ?? false,
    storageRoot: options.storageRoot ?? pluginStorageRoot,
  });
}

export function openDialog(options: unknown): Promise<string | string[] | null> {
  return request('dialog.open', { payload: options });
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
