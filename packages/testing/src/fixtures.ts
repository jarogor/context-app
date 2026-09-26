import type { MockBridgeConfig } from './mock-bridge';

/** Идентификатор тестового generic-провайдера. */
const LIBRARY_ID = 'a692624f-1fa0-49a2-9015-9cb7361f9d47';
/** Идентификатор тестового Calibre-провайдера. */
const CALIBRE_ID = 'f7c8b139-887f-4a2f-84e8-fdcc89635a79';

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
          ],
          values: { 'startup.welcome_notification': true },
        },
      ],
    };
  }
  if (message.capability === 'settings.store@1' && message.operation === 'get') {
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
      ],
    };
  }
  if (message.capability === 'plugin-store@1' && message.operation === 'set_enabled') {
    return { enabled: true };
  }
  if (message.capability === 'plugin-store@1' && message.operation === 'stores_list') {
    return { stores: [] };
  }
  if (message.capability === 'notifications.journal@1' && message.operation === 'list') {
    return { entries: [] };
  }
  return { sections: [], entries: [], plugins: [], stores: [] };
}

/** Ответ session-плагина на opaque-операцию в браузерных тестах. */
function pluginOperation(payload: unknown): unknown {
  const message = (payload ?? {}) as { operation?: string };
  if (message.operation === 'list' || message.operation === 'search') {
    return {
      catalog: {
        books: [
          {
            id: 'demo-1',
            title: 'Демо-книга',
            authors: ['Тестовый автор'],
            files: [],
          },
        ],
      },
    };
  }
  if (message.operation === 'recent_list') {
    return { paths: [] };
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
      plugin_activation_pending: () => ({ pending: false }),
      library_history_list: () => ({
        entries: [
          {
            path: '/demo-library',
            provider: LIBRARY_ID,
            provider_name: 'library',
            available: true,
          },
        ],
      }),
      library_history_forget: () => ({ forgotten: true }),
    },
  };
}
