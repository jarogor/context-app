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
  it('не запрашивает форматы чтения, пока поверхность скрыта без библиотеки', async () => {
    render(LibraryPage, {
      props: { initialActiveLibrary: null, visible: false, onOpenInWorkplace: vi.fn() },
    });

    await waitFor(() => expect(catalogChanged).toBeTruthy());
    // Форматы требуют плагинов чтения: без показа библиотеки запрос не идёт.
    expect(invoke.mock.calls.some(([command]) => command === 'reader_formats')).toBe(false);
  });

  it('запрашивает форматы чтения при показе поверхности библиотеки', async () => {
    render(LibraryPage, {
      props: { initialActiveLibrary: null, visible: true, onOpenInWorkplace: vi.fn() },
    });

    await waitFor(() =>
      expect(invoke.mock.calls.some(([command]) => command === 'reader_formats')).toBe(true),
    );
  });

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

  it('отправляет серверный поиск с задержкой, а не на каждый символ', async () => {
    render(LibraryPage, {
      props: { initialActiveLibrary: null, onOpenInWorkplace: vi.fn() },
    });

    await waitFor(() => expect(catalogChanged).toBeTruthy());
    await catalogChanged?.({ path: '/demo-library', provider_name: 'library' });
    await screen.findByText('Демо-книга');

    const search = screen.getByPlaceholderText('Название или автор');
    await fireEvent.input(search, { target: { value: 'Де' } });
    await fireEvent.input(search, { target: { value: 'Демо' } });

    await waitFor(() =>
      expect(
        invoke.mock.calls.some(
          ([command, args]) =>
            command === 'invoke_plugin_operation' &&
            (args as { operation?: string }).operation === 'search',
        ),
      ).toBe(true),
    );
    // Задержка схлопывает ввод в один вызов: поиск отработал по последнему значению.
    await waitFor(() =>
      expect(
        invoke.mock.calls.filter(
          ([command, args]) =>
            command === 'invoke_plugin_operation' &&
            (args as { operation?: string; payload?: { query?: string } }).operation === 'search',
        ),
      ).toHaveLength(1),
    );
  });
});
