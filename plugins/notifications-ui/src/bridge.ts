import type { LayoutState } from './types';

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

/** Размеры окна приложения, переданные оболочкой. */
export interface Viewport {
  width: number;
  height: number;
}

let sequence = 0;
const pending = new Map<
  string,
  { resolve: (value: unknown) => void; reject: (error: Error) => void }
>();
const listeners = new Map<string, Set<(value: unknown) => void>>();
const viewportListeners = new Set<(value: Viewport) => void>();

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
  if (message.type === 'viewport') {
    viewportListeners.forEach((listener) => listener(message.value as Viewport));
  }
});

function request<T>(type: string, payload: Omit<Message, 'channel' | 'type'>): Promise<T> {
  const id = `plugin-${++sequence}`;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
    window.parent.postMessage({ channel: 'booklib-plugin', type, id, ...payload }, '*');
  });
}

/** Вызов opaque-операции базового плагина уведомлений. */
export function operation<T = unknown>(action: string, payload: unknown = {}): Promise<T> {
  return request<T>('invoke', {
    command: 'invoke_base_plugin_operation',
    payload: { plugin: 'notifications', operation: action, payload },
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

/** Подписка на изменения размеров окна приложения. */
export function onViewport(listener: (value: Viewport) => void): () => void {
  viewportListeners.add(listener);
  return () => viewportListeners.delete(listener);
}

/** Запрос текущих размеров окна приложения. */
export function viewport(): Promise<Viewport> {
  return request<Viewport>('viewport', {});
}

/** Сообщение оболочке о требуемом состоянии региона уведомлений. */
export function setLayout(state: LayoutState) {
  window.parent.postMessage(
    { channel: 'booklib-plugin', type: 'layout', value: { region: 'notifications', state } },
    '*',
  );
}
