import { render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import StorePage from './StorePage.svelte';
import { invokeCommand } from '../../shared/app-bridge';

vi.mock('../../shared/app-bridge', () => ({
  invokeCommand: vi.fn(),
  listenEvent: vi.fn(async () => () => {}),
  openDialog: vi.fn(async () => null),
}));

const invoke = vi.mocked(invokeCommand);

beforeEach(() => {
  invoke.mockReset();
});

describe('страница обновлений', () => {
  it('рисует каталог, загруженный на бутстрапе, без обращения к плагину', () => {
    const onPendingChange = vi.fn();

    render(StorePage, {
      initialPlugins: [
        {
          id: 'p1',
          name: 'books-source-calibre',
          kind: 'books',
          description: 'Плагин источника книг',
          enabled: true,
          removable: false,
        },
        {
          id: 'p2',
          name: 'installed-plugin',
          kind: 'extension',
          description: 'Установленный плагин',
          enabled: false,
          removable: true,
        },
      ],
      initialStores: [
        { id: 's1', kind: 'file', title: 'Локальный стор', location: '/stores/main' },
      ],
      initialPending: true,
      onPendingChange,
    });

    expect(screen.getByText('books-source-calibre')).toBeTruthy();
    expect(screen.getByText('installed-plugin')).toBeTruthy();
    expect(screen.getByText('/stores/main')).toBeTruthy();
    expect(onPendingChange).toHaveBeenCalledWith(true);
    // Каталог передан бутстрапом: обращения к плагину за ним нет.
    expect(
      invoke.mock.calls.some(([command]) => command === 'invoke_base_plugin_operation'),
    ).toBe(false);
  });

  it('показывает все плагины одним списком, без деления на виды', () => {
    render(StorePage, {
      initialPlugins: [
        {
          id: 'p1',
          name: 'books-source',
          kind: 'books',
          description: 'Источник книг',
          enabled: true,
          removable: false,
        },
        {
          id: 'p2',
          name: 'format-pdf',
          kind: 'format',
          description: 'Формат чтения',
          enabled: true,
          removable: false,
        },
        {
          id: 'p3',
          name: 'installed-plugin',
          kind: 'extension',
          description: 'Расширение',
          enabled: true,
          removable: true,
        },
      ],
      initialStores: [],
      initialPending: false,
    });

    // Один список плагинов: заголовков-групп по видам нет.
    const list = screen.getByTestId('store-plugins');
    expect(list.querySelectorAll('li')).toHaveLength(3);
    expect(screen.queryByTestId('store-group')).toBeNull();
    expect(screen.getByText('books-source')).toBeTruthy();
    expect(screen.getByText('format-pdf')).toBeTruthy();
    expect(screen.getByText('installed-plugin')).toBeTruthy();
  });

  it('показывает пустое состояние без плагинов и сторов', () => {
    render(StorePage, { initialPlugins: [], initialStores: [], initialPending: false });

    expect(screen.getByText('Нет плагинов')).toBeTruthy();
    // Пустого сообщения об отсутствии мест обновления нет: место по умолчанию
    // подставляется настройками обновлений.
    expect(screen.queryByText(/Пока не добавлено/)).toBeNull();
  });
});
