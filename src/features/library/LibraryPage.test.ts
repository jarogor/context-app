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

  it('показывает заглушку форматов, пока плагины чтения грузятся', async () => {
    /** Отложенный ответ списка форматов: до него страница книги не знает их. */
    let releaseFormats: (value: string[]) => void = () => {};
    invoke.mockImplementation(async (command) => {
      if (command === 'reader_formats') {
        return new Promise<string[]>((resolve) => {
          releaseFormats = resolve;
        });
      }
      if (command === 'active_library') {
        return null;
      }
      if (command === 'invoke_plugin_operation') {
        return CATALOG;
      }
      return null;
    });

    render(LibraryPage, {
      props: { initialActiveLibrary: null, visible: true, onOpenInWorkplace: vi.fn() },
    });

    await waitFor(() => expect(catalogChanged).toBeTruthy());
    // Каталог приходит раньше форматов: страница книги уже открыта.
    await catalogChanged?.({ path: '/demo-library', provider_name: 'books-source' });
    await screen.findByText('Демо-книга');
    await fireEvent.click(screen.getByRole('button', { name: /Демо-книга/ }));

    expect(screen.getByTestId('book-formats-loading')).toBeTruthy();
    // Незавершённая загрузка не объявляет формат неподдерживаемым.
    expect(screen.queryByTestId('book-unsupported')).toBeNull();

    releaseFormats(['epub']);
    await waitFor(() => expect(screen.getByTestId('book-read-epub')).toBeTruthy());
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
        tags: [],
        files: [{ kind: 'book', path: 'epub-1.epub', format: 'epub' }],
      },
      {
        id: 'fb2-1',
        title: 'Книга FB2',
        authors: [],
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

  it('фильтрует книги по формату из боковой панели', async () => {
    await openLibrary();

    await fireEvent.click(screen.getByTestId('library-filters-open'));
    const formats = await screen.findByTestId('library-facet-formats');
    const checkboxes = within(formats).getAllByRole('checkbox');
    // Значения фасета идут по алфавиту: EPUB, затем FB2.
    await fireEvent.click(checkboxes[1]);

    await waitFor(() => expect(screen.queryByText('Книга EPUB')).toBeNull());
    expect(screen.getByText('Книга FB2')).toBeTruthy();
    expect(screen.getByTestId('library-filters-count').textContent).toContain('1');

    await fireEvent.click(screen.getByRole('button', { name: 'Сбросить' }));

    await waitFor(() => expect(screen.getByText('Книга EPUB')).toBeTruthy());
    expect(screen.queryByTestId('library-filters-count')).toBeNull();
  });

  it('сортировка стоит в полосе управления, а не в панели фильтров', async () => {
    await openLibrary();

    const controls = screen.getByTestId('library-controls');
    // Поле порядка и переключатель направления — один контрол в полосе.
    const sort = within(controls).getByTestId('library-sort');
    expect(within(sort).getByRole('button', { name: 'Сортировка' })).toBeTruthy();
    const direction = within(sort).getByTestId('library-sort-direction');
    expect(direction.getAttribute('aria-label')).toBe('По убыванию');

    await fireEvent.click(direction);
    await waitFor(() => expect(direction.getAttribute('aria-label')).toBe('По возрастанию'));

    await fireEvent.click(screen.getByTestId('library-filters-open'));
    const panel = await screen.findByTestId('library-filters');
    expect(within(panel).queryByRole('button', { name: 'Сортировка' })).toBeNull();
  });

  it('переход по формату открывает панель фильтров и раздел с выбранным значением', async () => {
    await openLibrary();

    await fireEvent.click(screen.getByRole('button', { name: /Книга EPUB/ }));
    // Страница книги: переход по метке формата ведёт к отфильтрованному списку.
    await fireEvent.click(screen.getByTestId('book-format-link-epub'));

    // Панель открыта сама: иначе фильтр незаметен и список выглядит случайным.
    const panel = await screen.findByTestId('library-filters');
    expect(panel).toBeTruthy();

    // Раздел форматов раскрыт, и на нём виден счётчик выбранного.
    const formats = within(panel).getByTestId('library-facet-formats');
    expect(formats).toBeTruthy();
    expect(screen.getByTestId('library-facet-count-formats').textContent).toContain('1');
    // Выбран именно EPUB: в списке отмечен один флажок.
    const checked = within(formats)
      .getAllByRole('checkbox')
      .filter((element) => element.getAttribute('aria-checked') === 'true');
    expect(checked).toHaveLength(1);

    // И список уже отфильтрован: книги другого формата в нём нет.
    await waitFor(() => expect(screen.queryByText('Книга FB2')).toBeNull());
  });

  it('счётчик на разделе показывает число выбранных значений при сворачивании', async () => {
    await openLibrary();

    await fireEvent.click(screen.getByTestId('library-filters-open'));
    const panel = await screen.findByTestId('library-filters');
    const formats = within(panel).getByTestId('library-facet-formats');
    await fireEvent.click(within(formats).getAllByRole('checkbox')[1]);

    await waitFor(() =>
      expect(screen.getByTestId('library-facet-count-formats').textContent).toContain('1'),
    );

    // Сворачивание раздела: список скрывается, а счётчик остаётся видимым.
    await fireEvent.click(screen.getByTestId('library-facet-toggle-formats'));
    await waitFor(() => expect(within(panel).queryByTestId('library-facet-formats')).toBeNull());
    expect(screen.getByTestId('library-facet-count-formats').textContent).toContain('1');
  });

  it('раздел фильтра сворачивается и разворачивается заголовком', async () => {
    await openLibrary();

    await fireEvent.click(screen.getByTestId('library-filters-open'));
    const panel = await screen.findByTestId('library-filters');
    const toggle = screen.getByTestId('library-facet-toggle-formats');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    await fireEvent.click(toggle);
    await waitFor(() => expect(toggle.getAttribute('aria-expanded')).toBe('false'));
    expect(within(panel).queryByTestId('library-facet-formats')).toBeNull();

    await fireEvent.click(toggle);
    await waitFor(() => expect(within(panel).getByTestId('library-facet-formats')).toBeTruthy());
  });

  it('флажок «без обложки» считается среди фильтров', async () => {
    await openLibrary();

    await fireEvent.click(screen.getByTestId('library-filters-open'));
    const panel = await screen.findByTestId('library-filters');
    await fireEvent.click(within(panel).getByRole('checkbox', { name: 'Без обложки' }));

    await waitFor(() =>
      expect(screen.getByTestId('library-filters-count').textContent).toContain('1'),
    );
  });
});

describe('выгрузка библиотеки', () => {
  it('сбрасывает каталог, когда активной библиотеки не осталось', async () => {
    // Удаление активной библиотеки выгружает её: ядро присылает событие без
    // пути, и список книг обязан закрыться — показывать книги выгруженной
    // библиотеки нельзя.
    render(LibraryPage, {
      props: { initialActiveLibrary: null, onOpenInWorkplace: vi.fn() },
    });

    await waitFor(() => expect(catalogChanged).toBeTruthy());
    await catalogChanged?.({ path: '/demo-library', provider_name: 'books-source' });
    await screen.findByText('Демо-книга');

    // Выгрузка: активного корня больше нет.
    await catalogChanged?.(null);

    await waitFor(() => expect(screen.queryByText('Демо-книга')).toBeNull());
    expect(screen.getByTestId('library-not-selected')).toBeTruthy();
  });
});
