import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import LibraryPage from './LibraryPage.svelte';
import { invokeCommand, listenEvent } from '../../shared/app-bridge';

vi.mock('../../shared/app-bridge', () => ({
  invokeCommand: vi.fn(),
  listenEvent: vi.fn(),
  openDialog: vi.fn(async () => null),
}));

const invoke = vi.mocked(invokeCommand);
const listen = vi.mocked(listenEvent);

/** Каталог с одной книгой-вложением. */
const CATALOG = {
  catalog: {
    books: [
      {
        id: 'demo-1',
        title: 'Демо-книга',
        authors: ['Тестовый автор'],
        series: [],
        tags: [],
        files: [{ kind: 'book', path: 'demo-1.epub', format: 'epub' }],
      },
    ],
  },
};

/** Обработчик события смены активной библиотеки. */
let catalogChanged: ((value: unknown) => void) | undefined;

beforeEach(() => {
  catalogChanged = undefined;
  invoke.mockReset();
  listen.mockReset();
  listen.mockImplementation(async (event, handler) => {
    if (event === 'source-catalog-changed') {
      catalogChanged = handler;
    }
    return () => {};
  });
  invoke.mockImplementation(async (command) => {
    if (command === 'reader_formats') {
      return ['epub'];
    }
    if (command === 'active_library') {
      return null;
    }
    if (command === 'invoke_plugin_operation') {
      return CATALOG;
    }
    return null;
  });
});

describe('страница библиотеки', () => {
  it('собирает абсолютный путь книги, когда библиотека открыта после первого кадра', async () => {
    const onOpenInWorkplace = vi.fn();

    render(LibraryPage, {
      props: { initialActiveLibrary: null, onOpenInWorkplace },
    });

    // При монтировании библиотека ещё не открыта — корень пуст.
    await waitFor(() => expect(catalogChanged).toBeTruthy());
    await waitFor(() =>
      expect(invoke.mock.calls.some(([command]) => command === 'active_library')).toBe(true),
    );

    // Библиотека открывается позже: событие несёт путь корня.
    await catalogChanged?.({ path: '/demo-library', provider_name: 'library' });
    await screen.findByText('Демо-книга');

    await fireEvent.click(screen.getByRole('button', { name: /Демо-книга/ }));
    await fireEvent.click(screen.getByRole('button', { name: /Добавить в/ }));

    // Путь книги — абсолютный: корень из события, а не пустой из монтирования.
    expect(onOpenInWorkplace).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/demo-library/demo-1.epub' }),
    );
  });

  it('подписывает кнопку добавления именем рабочего места', async () => {
    render(LibraryPage, {
      props: { initialActiveLibrary: null, targetWorkspaceName: 'Исследование', onOpenInWorkplace: vi.fn() },
    });

    await waitFor(() => expect(catalogChanged).toBeTruthy());
    await catalogChanged?.({ path: '/demo-library', provider_name: 'library' });
    await screen.findByText('Демо-книга');
    await fireEvent.click(screen.getByRole('button', { name: /Демо-книга/ }));

    expect(screen.getByRole('button', { name: 'Добавить в «Исследование»' })).toBeTruthy();
  });
});
