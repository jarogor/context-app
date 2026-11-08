import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import LibrariesPage from './LibrariesPage.svelte';
import { invokeCommand, listenEvent } from '../../shared/app-bridge';

vi.mock('../../shared/app-bridge', () => ({
  invokeCommand: vi.fn(),
  listenEvent: vi.fn(async () => () => {}),
  // Диалог выбора папки: путь задаётся моком, чтобы проверить открытие.
  openDialog: vi.fn(async () => '/demo-library'),
}));

const invoke = vi.mocked(invokeCommand);
const listen = vi.mocked(listenEvent);

beforeEach(() => {
  invoke.mockReset();
  listen.mockResolvedValue(() => {});
  invoke.mockImplementation(async (command: string) => {
    if (command === 'library_history_list') {
      return {
        entries: [
          {
            path: '/demo-library',
            provider: 'p1',
            provider_name: 'books-source',
            added_at_millis: 1_700_000_000_000,
            available: true,
          },
        ],
      };
    }
    if (command === 'active_library') {
      return { path: '/demo-library', provider_name: 'books-source' };
    }
    return null;
  });
});

describe('список библиотек', () => {
  it('кнопка добавления библиотеки называет действие своим именем', async () => {
    render(LibrariesPage);

    await waitFor(() => expect(screen.getByTestId('library-item')).toBeTruthy());
    // Кнопка полосы добавляет новую библиотеку, а не открывает выбранную:
    // открытие выбранной — отдельная кнопка карточки.
    expect(screen.getByRole('button', { name: /Добавить/ })).toBeTruthy();
  });

  it('показывает открытую библиотеку карточкой, а список — без неё', async () => {
    invoke.mockImplementation(async (command: string) => {
      if (command === 'library_history_list') {
        return {
          entries: [
            {
              path: '/demo-library',
              provider: 'p1',
              provider_name: 'books-source',
              added_at_millis: 1_700_000_000_000,
              available: true,
            },
            {
              path: '/other-library',
              provider: 'p1',
              provider_name: 'books-source',
              added_at_millis: 1_700_000_001_000,
              available: true,
            },
          ],
        };
      }
      if (command === 'active_library') {
        return { path: '/demo-library', provider_name: 'books-source' };
      }
      return null;
    });
    render(LibrariesPage);

    await waitFor(() => expect(screen.getByTestId('library-card')).toBeTruthy());
    const card = screen.getByTestId('library-card');
    expect(card.textContent).toContain('demo-library');
    expect(card.textContent).toContain('/demo-library');
    // Список показывает все библиотеки: открытая в нём остаётся и подсвечена.
    const rows = screen
      .getAllByTestId('library-name')
      .map((element) => element.textContent?.trim());
    expect(rows).toEqual(['other-library', 'demo-library']);
  });

  it('выбор строки загружает библиотеку, но книги не открывает', async () => {
    invoke.mockImplementation(async (command: string) => {
      if (command === 'library_history_list') {
        return {
          entries: [
            {
              path: '/demo-library',
              provider: 'p1',
              provider_name: 'books-source',
              added_at_millis: 1,
              available: true,
            },
            {
              path: '/other-library',
              provider: 'p1',
              provider_name: 'books-source',
              added_at_millis: 2,
              available: true,
            },
          ],
        };
      }
      if (command === 'active_library') {
        return null;
      }
      return null;
    });
    const onOpened = vi.fn();
    render(LibrariesPage, { props: { onOpened } });

    await waitFor(() => expect(screen.getByTestId('libraries-page')).toBeTruthy());
    const row = screen
      .getAllByTestId('library-item')
      .find((element) => element.textContent?.includes('other-library')) as HTMLElement;
    await fireEvent.click(row.querySelector('[data-testid="library-item"] button') as HTMLElement);

    // Библиотека загружена, сведения показаны панелью.
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        'select_source_library',
        expect.objectContaining({ path: '/other-library' }),
      ),
    );
    expect(screen.getByTestId('library-card').textContent).toContain('other-library');
    // Книги не открываются: переход — только действием панели.
    expect(onOpened).not.toHaveBeenCalled();

    await fireEvent.click(screen.getByTestId('library-card-open'));
    expect(onOpened).toHaveBeenCalledTimes(1);
  });

  it('пункт меню открывает директорию библиотеки, а не саму библиотеку', async () => {
    invoke.mockImplementation(async (command: string) => {
      if (command === 'library_history_list') {
        return {
          entries: [
            {
              path: '/demo-library',
              provider: 'p1',
              provider_name: 'books-source',
              added_at_millis: 1_700_000_000_000,
              available: true,
            },
            {
              path: '/other-library',
              provider: 'p1',
              provider_name: 'books-source',
              added_at_millis: 1_700_000_001_000,
              available: true,
            },
          ],
        };
      }
      if (command === 'active_library') {
        return { path: '/demo-library', provider_name: 'books-source' };
      }
      return null;
    });
    render(LibrariesPage);

    await waitFor(() => expect(screen.getAllByTestId('library-item')).toHaveLength(2));
    const row = screen
      .getAllByTestId('library-item')
      .find((element) => element.textContent?.includes('other-library')) as HTMLElement;
    await fireEvent.click(
      row.querySelector('[aria-label="Действия с библиотекой"]') as HTMLElement,
    );
    await fireEvent.click(await screen.findByRole('menuitem', { name: 'Открыть папку' }));

    // Клик по строке открывает библиотеку; пункт меню делает то, чего клик не
    // умеет, — показывает её директорию в файловом менеджере.
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('open_folder', { path: '/other-library' }),
    );
    expect(invoke).not.toHaveBeenCalledWith('select_source_library', expect.anything());
  });
});

describe('счётчик найденных библиотек', () => {
  it('показывает, сколько найдено из всего', async () => {
    // Тот же счётчик, что в списке рабочих мест: без него поиск не говорит,
    // сколько записей он отсеял.
    invoke.mockResolvedValue({
      entries: [
        {
          path: '/lib/a',
          provider: 'p1',
          provider_name: 'books-source',
          added_at_millis: 1,
          available: true,
        },
        {
          path: '/lib/b',
          provider: 'p1',
          provider_name: 'books-source',
          added_at_millis: 2,
          available: true,
        },
      ],
    });

    render(LibrariesPage);

    await waitFor(() => expect(screen.getByTestId('libraries-filter-counter')).toBeTruthy());
    expect(screen.getByTestId('libraries-filter-counter').textContent).toContain('2 из 2');

    // Поиск отсеивает записи, и счётчик это показывает.
    await fireEvent.input(screen.getByPlaceholderText('Поиск библиотеки'), {
      target: { value: 'a' },
    });
    await waitFor(() =>
      expect(screen.getByTestId('libraries-filter-counter').textContent).toContain('1 из 2'),
    );
  });
});

describe('порядок списка библиотек', () => {
  /** История из трёх библиотек с разным временем открытия. */
  function history() {
    invoke.mockImplementation(async (command: string) => {
      if (command === 'library_history_list') {
        return {
          entries: [
            {
              path: '/lib/alpha',
              provider: 'p1',
              provider_name: 'books-source',
              added_at_millis: 1_000,
              available: true,
            },
            {
              path: '/lib/zeta',
              provider: 'p1',
              provider_name: 'books-source',
              added_at_millis: 3_000,
              available: true,
            },
            {
              path: '/lib/beta',
              provider: 'p1',
              provider_name: 'books-source',
              added_at_millis: 2_000,
              available: true,
            },
          ],
        };
      }
      if (command === 'active_library') {
        // Открытая библиотека показана карточкой, поэтому в списке её нет.
        return null;
      }
      return null;
    });
  }

  /** Названия строк списка в порядке показа. */
  function names(): string[] {
    return screen
      .getAllByTestId('library-name')
      .map((element) => element.textContent?.trim() ?? '');
  }

  it('свежие библиотеки идут первыми', async () => {
    history();
    render(LibrariesPage);

    await waitFor(() => expect(screen.getAllByTestId('library-item')).toHaveLength(3));
    // По умолчанию — по времени открытия, свежие сверху.
    expect(names()).toEqual(['zeta', 'beta', 'alpha']);
  });

  it('сортировка по алфавиту ставит библиотеки по имени', async () => {
    history();
    render(LibrariesPage);

    await waitFor(() => expect(screen.getAllByTestId('library-item')).toHaveLength(3));
    // Триггер списка подписан доступным именем, значение — выбранный порядок.
    await fireEvent.pointerDown(screen.getByRole('button', { name: 'Порядок библиотек' }), {
      button: 0,
    });
    await fireEvent.pointerUp(screen.getByRole('option', { name: 'По алфавиту' }));

    await waitFor(() => expect(names()).toEqual(['alpha', 'beta', 'zeta']));
  });
});

describe('провайдер и отсутствующая библиотека', () => {
  /** История с двумя провайдерами и отсутствующей библиотекой. */
  function history() {
    invoke.mockImplementation(async (command: string) => {
      if (command === 'library_history_list') {
        return {
          entries: [
            {
              path: '/lib/context',
              provider: 'books-source',
              provider_name: 'books-source',
              added_at_millis: 3_000,
              available: true,
            },
            {
              path: '/lib/calibre',
              provider: 'books-source-calibre',
              provider_name: 'books-source-calibre',
              added_at_millis: 2_000,
              available: true,
            },
            {
              path: '/lib/gone',
              provider: 'books-source',
              provider_name: 'books-source',
              added_at_millis: 1_000,
              available: false,
            },
          ],
        };
      }
      if (command === 'active_library') {
        return null;
      }
      return null;
    });
  }

  it('называет провайдеров короткими именами', async () => {
    history();
    render(LibrariesPage);

    await waitFor(() => expect(screen.getAllByTestId('library-item')).toHaveLength(3));
    // Служебные идентификаторы плагинов пользователю не показываются.
    const text = screen.getByTestId('libraries-page').textContent ?? '';
    expect(text).toContain('calibre');
    expect(text).not.toContain('books-source-calibre');
    expect(text).not.toContain('books-source');
  });

  it('показывает путь и отсутствие только в карточке выбранной библиотеки', async () => {
    history();
    render(LibrariesPage);

    await waitFor(() => expect(screen.getAllByTestId('library-item')).toHaveLength(3));

    // В элементах списка пути нет: только название, тип и дата.
    for (const meta of screen.queryAllByTestId('library-meta')) {
      expect(meta.textContent).not.toContain('/lib/');
    }

    // Выбор отсутствующей записи не обращается к диску, а показывает сведения.
    const item = screen
      .getAllByTestId('library-item')
      .find((element) => element.textContent?.includes('gone')) as HTMLElement;
    await fireEvent.click(item.querySelector('button') as HTMLElement);

    const card = screen.getByTestId('library-card');
    expect(card.textContent).toContain('/lib/gone');
    expect(card.textContent).toContain('отсутствует');
    expect(invoke).not.toHaveBeenCalledWith('select_source_library', expect.anything());
  });

  it('у отсутствующей библиотеки нет пункта открытия папки', async () => {
    history();
    render(LibrariesPage);

    await waitFor(() => expect(screen.getAllByTestId('library-item')).toHaveLength(3));
    const item = screen
      .getAllByTestId('library-item')
      .find((element) => element.textContent?.includes('gone')) as HTMLElement;

    await fireEvent.click(
      item.querySelector('[aria-label="Действия с библиотекой"]') as HTMLElement,
    );
    // Открывать нечего: в меню остаётся только удаление записи.
    expect(await screen.findByRole('menuitem', { name: 'Убрать из списка' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: 'Открыть папку' })).toBeNull();
  });
});

describe('карточка без открытой библиотеки', () => {
  it('объясняет, что библиотека не выбрана, и не исчезает', async () => {
    invoke.mockImplementation(async (command: string) => {
      if (command === 'library_history_list') {
        return {
          entries: [
            {
              path: '/lib/a',
              provider: 'books-source',
              provider_name: 'books-source',
              added_at_millis: 1,
              available: true,
            },
          ],
        };
      }
      if (command === 'active_library') {
        return null;
      }
      return null;
    });
    render(LibrariesPage);

    await waitFor(() => expect(screen.getByTestId('library-card-empty')).toBeTruthy());
    // Место карточки сохраняется: список не сдвигается при выборе библиотеки.
    expect(screen.getByTestId('library-card').textContent).toContain('Библиотека не выбрана');
    // Выбор остаётся в списке: без открытой библиотеки он не сокращается.
    expect(screen.getAllByTestId('library-item')).toHaveLength(1);
  });
});

describe('режим показа библиотек', () => {
  it('переключается между списком и плиткой', async () => {
    // Открытая библиотека показана карточкой, поэтому в списке нужна вторая.
    invoke.mockImplementation(async (command: string) => {
      if (command === 'library_history_list') {
        return {
          entries: [
            {
              path: '/demo-library',
              provider: 'books-source',
              provider_name: 'books-source',
              added_at_millis: 1,
              available: true,
            },
            {
              path: '/other-library',
              provider: 'books-source',
              provider_name: 'books-source',
              added_at_millis: 2,
              available: true,
            },
          ],
        };
      }
      if (command === 'active_library') {
        return { path: '/demo-library', provider_name: 'books-source' };
      }
      return null;
    });
    render(LibrariesPage);

    await waitFor(() => expect(screen.getAllByTestId('library-item').length).toBeGreaterThan(0));
    // По умолчанию — список.
    expect(screen.queryByTestId('libraries-grid')).toBeNull();

    await fireEvent.click(screen.getByRole('button', { name: 'Плитка' }));
    await waitFor(() => expect(screen.getByTestId('libraries-grid')).toBeTruthy());

    await fireEvent.click(screen.getByRole('button', { name: 'Список' }));
    await waitFor(() => expect(screen.queryByTestId('libraries-grid')).toBeNull());
  });
});

describe('открытие новой библиотеки', () => {
  it('добавляет новую библиотеку в список сразу после открытия', async () => {
    // В истории уже есть одна библиотека: запись новой появляется после
    // открытия, и полагаться на ответ истории нельзя — он может прийти раньше.
    const history = [
      {
        path: '/other',
        provider: 'books-source',
        provider_name: 'books-source',
        added_at_millis: 1,
        available: true,
      },
    ];
    invoke.mockImplementation(async (command: string) => {
      if (command === 'library_history_list') {
        return { entries: history };
      }
      if (command === 'active_library') {
        return null;
      }
      if (command === 'select_source_library') {
        return { provider: 'books-source', provider_name: 'books-source' };
      }
      return null;
    });

    render(LibrariesPage);
    await waitFor(() => expect(screen.getByTestId('libraries-page')).toBeTruthy());

    // Открытие папки — как из диалога выбора директории.
    await fireEvent.click(screen.getAllByRole('button', { name: /Добавить библиотеку/ })[0]);

    await waitFor(() => expect(screen.getAllByTestId('library-item')).toHaveLength(2));
    expect(screen.getByTestId('library-card').textContent).toContain('demo-library');
  });

  it('показывает прогресс индексации внутри карточки', async () => {
    /** Обработчик события прогресса, перехваченный страницей. */
    let onProgress: ((value: unknown) => void) | undefined;
    listen.mockImplementation(async (event, handler) => {
      if (event === 'library-index-progress') {
        onProgress = handler as (value: unknown) => void;
      }
      return () => {};
    });
    invoke.mockImplementation(async (command: string) => {
      if (command === 'library_history_list') {
        return {
          entries: [
            {
              path: '/other',
              provider: 'books-source',
              provider_name: 'books-source',
              added_at_millis: 1,
              available: true,
            },
          ],
        };
      }
      if (command === 'active_library') {
        return null;
      }
      // Открытие не завершается: карточка должна показать прогресс.
      if (command === 'select_source_library') {
        return new Promise(() => {});
      }
      return null;
    });

    render(LibrariesPage);
    await waitFor(() => expect(onProgress).toBeTruthy());

    await fireEvent.click(screen.getAllByRole('button', { name: /Добавить библиотеку/ })[0]);
    await onProgress?.({ done: 3, total: 10, percent: 30 });

    await waitFor(() => expect(screen.getByTestId('library-card-progress')).toBeTruthy());
    const card = screen.getByTestId('library-card');
    expect(card.textContent).toContain('Индексация библиотеки');
    expect(card.textContent).toContain('Обработано 3 из 10');
  });
});
