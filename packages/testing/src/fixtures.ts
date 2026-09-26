import type { MockBridgeConfig } from './mock-bridge';

/** Ответ базового плагина на opaque-операцию в браузерных тестах. */
function baseOperation(payload: unknown): unknown {
  const message = (payload ?? {}) as {
    plugin?: string;
    operation?: string;
  };
  if (message.plugin === 'settings' && message.operation === 'list') {
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
  if (message.plugin === 'settings' && message.operation === 'get') {
    return { values: {} };
  }
  if (message.plugin === 'plugin-store' && message.operation === 'list') {
    return { plugins: [] };
  }
  if (message.plugin === 'plugin-store' && message.operation === 'plugins') {
    return {
      plugins: [
        {
          name: 'calibre',
          kind: 'source',
          description: 'Плагин библиотеки Calibre',
          enabled: true,
          removable: false,
        },
      ],
    };
  }
  if (message.plugin === 'plugin-store' && message.operation === 'set_enabled') {
    return { enabled: true };
  }
  if (message.plugin === 'plugin-store' && message.operation === 'stores_list') {
    return { stores: [] };
  }
  if (message.plugin === 'notifications' && message.operation === 'list') {
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
      select_source_library: () => ({ provider: 'library' }),
      plugin_activation_pending: () => ({ pending: false }),
      library_history_list: () => ({
        entries: [{ path: '/demo-library', provider: 'library', available: true }],
      }),
      library_history_forget: () => ({ forgotten: true }),
    },
  };
}
