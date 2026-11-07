import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import LibraryPage from './LibraryPage.svelte';
import { LIBRARY_PAGE_SIZE } from './library';
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

/** Каталог из заданного числа книг; названия дополнены нулями, чтобы порядок был очевиден. */
function catalogOf(count: number) {
  return {
    catalog: {
      books: Array.from({ length: count }, (_, index) => {
        const title = `Книга ${String(index + 1).padStart(3, '0')}`;
        return {
          id: `book-${index + 1}`,
          title,
          authors: [],
          series: [],
          tags: [],
          files: [{ kind: 'book', path: `book-${index + 1}.epub`, format: 'epub' }],
        };
      }),
    },
  };
}

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
  it('не запрашивает форматы чтения, пока область скрыта без библиотеки', async () => {
    render(LibraryPage, {
      props: { initialActiveLibrary: null, visible: false, onOpenInWorkplace: vi.fn() },
    });

    await waitFor(() => expect(catalogChanged).toBeTruthy());
    // Форматы требуют плагинов чтения: без показа библиотеки запрос не идёт.
    expect(invoke.mock.calls.some(([command]) => command === 'reader_formats')).toBe(false);
  });

  it('запрашивает форматы чтения при показе области библиотеки', async () => {
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
    await catalogChanged?.({ path: '/demo-library', provider_name: 'books-source' });
    await screen.findByText('Демо-книга');

    await fireEvent.click(screen.getByRole('button', { name: /Демо-книга/ }));
    await fireEvent.click(screen.getByTestId('book-read-epub'));

    // Путь книги — абсолютный: корень из события, а не пустой из монтирования.
    expect(onOpenInWorkplace).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/demo-library/demo-1.epub' }),
    );
  });

  it('называет рабочее место в действии чтения', async () => {
    render(LibraryPage, {
      props: {
        initialActiveLibrary: null,
        targetWorkspaceName: 'Исследование',
        onOpenInWorkplace: vi.fn(),
      },
    });

    await waitFor(() => expect(catalogChanged).toBeTruthy());
    await catalogChanged?.({ path: '/demo-library', provider_name: 'books-source' });
    await screen.findByText('Демо-книга');
    await fireEvent.click(screen.getByRole('button', { name: /Демо-книга/ }));

    expect(screen.getByTestId('book-read-epub')).toBeTruthy();
  });

  it('даёт отдельную кнопку на каждый читаемый формат книги', async () => {
    const onOpenInWorkplace = vi.fn();
    invoke.mockImplementation(async (command) => {
      if (command === 'reader_formats') {
        // Форматы объявляют плагины формата: без плагина формат не читается.
        return ['fb2', 'pdf'];
      }
      if (command === 'active_library') {
        return { path: '/demo-library', provider_name: 'books-source' };
      }
      if (command === 'invoke_plugin_operation') {
        return {
          catalog: {
            books: [
              {
                id: 'two-formats',
                title: 'Демо-книга',
                authors: [],
                series: [],
                tags: [],
                files: [
                  { kind: 'book', path: 'two-formats.fb2', format: 'fb2' },
                  { kind: 'book', path: 'two-formats.pdf', format: 'pdf' },
                ],
              },
            ],
          },
        };
      }
      return null;
    });

    render(LibraryPage, {
      props: {
        initialActiveLibrary: null,
        targetWorkspaceName: 'Исследование',
        onOpenInWorkplace,
      },
    });

    await waitFor(() => expect(catalogChanged).toBeTruthy());
    await catalogChanged?.({ path: '/demo-library', provider_name: 'books-source' });
    await screen.findByText('Демо-книга');
    await fireEvent.click(screen.getByRole('button', { name: /Демо-книга/ }));

    // Отдельное действие чтения на каждый формат: FB2 и PDF.
    expect(screen.getByTestId('book-read-fb2')).toBeTruthy();
    expect(screen.getByTestId('book-read-pdf')).toBeTruthy();

    await fireEvent.click(screen.getByTestId('book-read-fb2'));
    expect(onOpenInWorkplace).toHaveBeenCalledWith({
      path: '/demo-library/two-formats.fb2',
      title: 'Демо-книга',
      format: 'fb2',
    });
  });

  it('отправляет серверный поиск с задержкой, а не на каждый символ', async () => {
    render(LibraryPage, {
      props: { initialActiveLibrary: null, onOpenInWorkplace: vi.fn() },
    });

    await waitFor(() => expect(catalogChanged).toBeTruthy());
    await catalogChanged?.({ path: '/demo-library', provider_name: 'books-source' });
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

  it('листает книги страницами и начинает список с начала при новом поиске', async () => {
    const total = LIBRARY_PAGE_SIZE + 1;
    invoke.mockImplementation(async (command) => {
      if (command === 'reader_formats') {
        return ['epub'];
      }
      if (command === 'active_library') {
        return null;
      }
      if (command === 'invoke_plugin_operation') {
        return catalogOf(total);
      }
      return null;
    });

    render(LibraryPage, {
      props: { initialActiveLibrary: null, onOpenInWorkplace: vi.fn() },
    });

    await waitFor(() => expect(catalogChanged).toBeTruthy());
    await catalogChanged?.({ path: '/demo-library', provider_name: 'books-source' });
    await screen.findByText('Книга 001');

    // Каталог длиннее страницы: показывается её начало, а не весь список.
    const lastTitle = `Книга ${String(total).padStart(3, '0')}`;
    expect(screen.getByText('Страница 1 из 2')).toBeTruthy();
    expect(screen.queryByText(lastTitle)).toBeNull();
    expect(screen.getByRole('button', { name: 'Страница 1' }).getAttribute('aria-current')).toBe(
      'page',
    );

    await fireEvent.click(screen.getByRole('button', { name: 'Следующая страница' }));
    await screen.findByText(lastTitle);

    // Вторая страница — остаток каталога: первой книги на ней нет.
    expect(screen.getByText('Страница 2 из 2')).toBeTruthy();
    expect(screen.queryByText('Книга 001')).toBeNull();

    // Новый запрос перечитывает каталог и показывает его с первой страницы.
    await fireEvent.input(screen.getByPlaceholderText('Название или автор'), {
      target: { value: 'Книга' },
    });
    await waitFor(() => expect(screen.getByText('Страница 1 из 2')).toBeTruthy());
    expect(screen.getByText('Книга 001')).toBeTruthy();
  });
});

/** Каталог из двух книг разных форматов и без других свойств. */
const FORMAT_CATALOG = {
  catalog: {
    books: [
      {
        id: 'epub-1',
        title: 'Книга EPUB',
        authors: [],
        series: [],
        tags: [],
        files: [{ kind: 'book', path: 'epub-1.epub', format: 'epub' }],
      },
      {
        id: 'fb2-1',
        title: 'Книга FB2',
        authors: [],
        series: [],
        tags: [],
        files: [{ kind: 'book', path: 'fb2-1.fb2', format: 'fb2' }],
      },
    ],
  },
};

describe('сортировка и фильтры библиотеки', () => {
  beforeEach(() => {
    invoke.mockImplementation(async (command) => {
      if (command === 'reader_formats') {
        return ['epub', 'fb2'];
      }
      if (command === 'active_library') {
        return null;
      }
      if (command === 'invoke_plugin_operation') {
        return FORMAT_CATALOG;
      }
      return null;
    });
  });

  /** Открытие библиотеки с каталогом двух форматов. */
  async function openLibrary() {
    render(LibraryPage, {
      props: { initialActiveLibrary: null, onOpenInWorkplace: vi.fn() },
    });
    await waitFor(() => expect(catalogChanged).toBeTruthy());
    await catalogChanged?.({ path: '/demo-library', provider_name: 'books-source' });
    await screen.findByText('Книга EPUB');
  }

  it('фильтрует книги по формату из панели фильтров', async () => {
    await openLibrary();

    await fireEvent.click(screen.getByTestId('library-filters-open'));
    const panel = await screen.findByTestId('library-filters');
    const checkboxes = within(panel).getAllByRole('checkbox');
    // У книг этого каталога есть только формат: первым идёт он (EPUB, затем FB2).
    await fireEvent.click(checkboxes[1]);

    await waitFor(() => expect(screen.queryByText('Книга EPUB')).toBeNull());
    expect(screen.getByText('Книга FB2')).toBeTruthy();
    expect(screen.getByTestId('library-filters-count').textContent).toContain('1');

    await fireEvent.click(screen.getByRole('button', { name: 'Сбросить' }));

    await waitFor(() => expect(screen.getByText('Книга EPUB')).toBeTruthy());
    expect(screen.queryByTestId('library-filters-count')).toBeNull();
  });

  it('переключает направление сортировки', async () => {
    await openLibrary();

    const button = screen.getByTestId('library-sort-direction');
    // При сортировке по возрастанию кнопка предлагает обратный порядок.
    expect(button.getAttribute('aria-label')).toBe('По убыванию');

    await fireEvent.click(button);

    await waitFor(() => expect(button.getAttribute('aria-label')).toBe('По возрастанию'));
  });
});
