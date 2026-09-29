import type { MockBridgeConfig } from './mock-bridge';

/** Идентификатор тестового generic-провайдера. */
const LIBRARY_ID = 'a692624f-1fa0-49a2-9015-9cb7361f9d47';
/** Идентификатор тестового Calibre-провайдера. */
const CALIBRE_ID = 'f7c8b139-887f-4a2f-84e8-fdcc89635a79';
/** Идентификатор тестового extension-плагина. */
const DEMO_ID = 'e6ddd2e8-a62c-4350-b431-2bb4f2cb8d5c';
/** Крошечное PNG-изображение в base64 (1×1). */
const TINY_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/** Ответ базового плагина на opaque-операцию в браузерных тестах. */
function baseOperation(payload: unknown): unknown {
  const message = (payload ?? {}) as {
    capability?: string;
    operation?: string;
  };
  if (message.capability === 'settings.store@1' && message.operation === 'list') {
    return {
      sections: [
        {
          id: 'app.general',
          owner: 'app',
          kind: 'app',
          title: 'Общие',
          description: 'Общие параметры приложения',
          fields: [
            {
              key: 'startup.welcome_notification',
              title: 'Приветственное уведомление',
              type: 'boolean',
              default: true,
            },
            {
              key: 'diagnostics.log_level',
              title: 'Порог технических логов',
              type: 'select',
              default: 'info',
              options: [
                { value: 'info', title: 'Информация' },
                { value: 'trace', title: 'Всё' },
              ],
            },
          ],
          values: { 'startup.welcome_notification': true, 'diagnostics.log_level': 'info' },
        },
      ],
    };
  }
  if (message.capability === 'settings.store@1' && message.operation === 'get') {
    return { values: {} };
  }
  if (message.capability === 'settings.store@1' && message.operation === 'set') {
    return { values: {} };
  }
  if (message.capability === 'plugin-store@1' && message.operation === 'list') {
    return { plugins: [] };
  }
  if (message.capability === 'plugin-store@1' && message.operation === 'plugins') {
    return {
      plugins: [
        {
          id: CALIBRE_ID,
          name: 'calibre',
          kind: 'source',
          description: 'Плагин библиотеки Calibre',
          enabled: true,
          removable: false,
        },
        {
          id: DEMO_ID,
          name: 'demo',
          kind: 'extension',
          description: 'Демонстрационный плагин',
          enabled: false,
          removable: true,
        },
      ],
    };
  }
  if (message.capability === 'plugin-store@1' && message.operation === 'set_enabled') {
    return { enabled: true };
  }
  if (message.capability === 'plugin-store@1' && message.operation === 'stores_list') {
    return { stores: [] };
  }
  if (message.capability === 'plugin-store@1' && message.operation === 'stores_add') {
    return { stores: [] };
  }
  if (message.capability === 'notifications.journal@1' && message.operation === 'list') {
    return {
      entries: [
        {
          id: 1,
          timestamp: 1_700_000_000_000,
          level: 'User',
          severity: 'info',
          message: 'Библиотека открыта',
          source: 'app',
          details: {},
          read: true,
        },
        {
          id: 2,
          timestamp: 1_700_000_001_000,
          level: 'Technical',
          severity: 'warn',
          message: 'Плагин пропущен',
          source: 'core',
          details: {},
          read: false,
        },
        {
          id: 3,
          timestamp: 1_700_000_002_000,
          level: 'Technical',
          severity: 'error',
          message: 'Ошибка вызова плагина',
          source: 'core',
          details: {},
          read: true,
        },
      ],
    };
  }
  if (message.capability === 'notifications.journal@1' && message.operation === 'mark_all_read') {
    return { ok: true };
  }
  if (message.capability === 'notifications.journal@1' && message.operation === 'clear') {
    return { ok: true };
  }
  return { sections: [], entries: [], plugins: [], stores: [] };
}

/** Ответ session-плагина на opaque-операцию в браузерных тестах. */
function pluginOperation(payload: unknown): unknown {
  const message = (payload ?? {}) as { operation?: string; payload?: { query?: string; book_id?: string } };
  const books = [
    {
      id: 'demo-1',
      title: 'Демо-книга',
      authors: ['Тестовый автор'],
      files: [{ kind: 'book', path: 'demo-1.epub', format: 'epub' }],
    },
    {
      id: 'demo-2',
      title: 'Вторая книга',
      authors: [],
      files: [{ kind: 'book', path: 'demo-2.fb2', format: 'fb2' }],
    },
    {
      id: 'demo-3',
      title: 'Третья книга',
      authors: ['Ещё автор'],
      files: [{ kind: 'book', path: 'demo-3.epub', format: 'epub' }],
    },
  ];
  if (message.operation === 'list' || message.operation === 'search') {
    const query = message.payload?.query?.toLowerCase() ?? '';
    const filtered = query
      ? books.filter(
          (book) =>
            book.title.toLowerCase().includes(query) ||
            book.authors.some((author) => author.toLowerCase().includes(query)),
        )
      : books;
    return { catalog: { books: filtered } };
  }
  if (message.operation === 'cover') {
    return message.payload?.book_id === 'demo-1'
      ? { data: TINY_PNG, format: 'png' }
      : { data: null };
  }
  if (message.operation === 'content') {
    const paragraphs = Array.from(
      { length: 60 },
      (_, index) => `<p>Абзац ${index + 1}. Текст для проверки прокрутки книги.</p>`,
    ).join('');
    return {
      title: 'Демо-книга',
      authors: ['Тестовый автор'],
      chapters: [
        { title: 'Глава 1', html: `<h1>Глава 1</h1><p>Первый абзац книги.</p>${paragraphs}` },
        { title: 'Глава 2', html: '<h2>Глава 2</h2><p>Второй абзац книги.</p>' },
      ],
    };
  }
  return {};
}

/** Конфигурация мока по умолчанию для браузерных тестов. */
export function defaultMockConfig(): MockBridgeConfig {
  return {
    dialogResult: null,
    handlers: {
      invoke_base_plugin_operation: baseOperation,
      invoke_plugin_operation: pluginOperation,
      select_source_library: () => ({ provider: LIBRARY_ID, provider_name: 'library' }),
      active_library: () => null,
      plugin_activation_pending: () => ({ pending: false }),
      get_workspace: () => ({ tabs: [], activeTabId: null }),
      save_workspace: () => ({ ok: true }),
      library_history_list: () => ({
        entries: [
          {
            path: '/demo-library',
            provider: LIBRARY_ID,
            provider_name: 'library',
            added_at_millis: 1_700_000_000_000,
            available: true,
          },
        ],
      }),
      library_history_forget: () => ({ forgotten: true }),
    },
  };
}
