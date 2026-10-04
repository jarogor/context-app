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
          name: 'calibre',
          kind: 'source',
          description: 'Плагин библиотеки',
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

    expect(screen.getByText('calibre')).toBeTruthy();
    expect(screen.getByText('installed-plugin')).toBeTruthy();
    expect(screen.getByText('Локальный стор')).toBeTruthy();
    expect(onPendingChange).toHaveBeenCalledWith(true);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('показывает пустое состояние без плагинов и сторов', () => {
    render(StorePage, { initialPlugins: [], initialStores: [], initialPending: false });

    expect(screen.getByText('Нет плагинов')).toBeTruthy();
    expect(screen.getByText('Сторы не подключены')).toBeTruthy();
  });
});
