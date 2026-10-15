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

describe('страница плагинов и сторов', () => {
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
    expect(screen.getByText('Локальный стор')).toBeTruthy();
    expect(onPendingChange).toHaveBeenCalledWith(true);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('группирует плагины по назначению', () => {
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

    const groups = screen.getAllByTestId('store-group');
    expect(groups.map((group) => group.getAttribute('data-kind'))).toEqual([
      'books',
      'format',
      'extension',
    ]);
    expect(screen.getByText('Источники книг')).toBeTruthy();
    expect(screen.getByText('Форматы чтения')).toBeTruthy();
    expect(screen.getByText('Расширения')).toBeTruthy();
  });

  it('показывает пустое состояние без плагинов и сторов', () => {
    render(StorePage, { initialPlugins: [], initialStores: [], initialPending: false });

    expect(screen.getByText('Нет плагинов')).toBeTruthy();
    expect(screen.getByText('Сторы не подключены')).toBeTruthy();
  });
});
