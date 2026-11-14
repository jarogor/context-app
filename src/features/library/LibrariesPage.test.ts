import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
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
  it('объясняет, что библиотека не загружена, и не исчезает', async () => {
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
    expect(screen.getByTestId('library-card').textContent).toContain('Библиотека не загружена');
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

describe('удаление активной библиотеки', () => {
  it('сбрасывает выбранную запись, когда ядро выгрузило библиотеку', async () => {
    // Удаление активной библиотеки выгружает её: сведения о ней больше не
    // показываются, и панель возвращается к пустому состоянию.
    let entries = [
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
        added_at_millis: 2_000,
        available: true,
      },
    ];
    let active: { path: string; provider_name: string } | null = {
      path: '/lib/alpha',
      provider_name: 'books-source',
    };

    invoke.mockImplementation(async (command: string) => {
      if (command === 'library_history_list') {
        return { entries };
      }
      if (command === 'active_library') {
        return active;
      }
      if (command === 'library_history_forget') {
        // Активная библиотека удаляется: ядро выгружает её.
        active = null;
        entries = entries.filter((entry) => entry.path !== '/lib/alpha');
        return { forgotten: '/lib/alpha', released: true };
      }
      return null;
    });

    render(LibrariesPage);
    await waitFor(() => expect(screen.getAllByTestId('library-item')).toHaveLength(2));
    // До удаления панель показывает открытую библиотеку.
    expect(screen.getByTestId('library-card').textContent).toContain('/lib/alpha');

    const item = screen
      .getAllByTestId('library-item')
      .find((element) => element.textContent?.includes('alpha')) as HTMLElement;
    await fireEvent.click(
      item.querySelector('[aria-label="Действия с библиотекой"]') as HTMLElement,
    );
    await fireEvent.click(await screen.findByRole('menuitem', { name: 'Убрать из списка' }));

    // Библиотеки нет ни в списке, ни в карточке: выбор сброшен.
    await waitFor(() => expect(screen.getAllByTestId('library-item')).toHaveLength(1));
    expect(screen.getByTestId('library-card').textContent).not.toContain('/lib/alpha');
    expect(screen.getByTestId('library-card-empty')).toBeTruthy();
  });
});

describe('порядок библиотек: направление', () => {
  it('переключает сторону порядка кнопкой рядом с полем', async () => {
    // Соседние проверки пишут порядок в браузерное хранилище: без сброса эта
    // проверка зависела бы от их порядка выполнения.
    localStorage.clear();
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
          ],
        };
      }
      if (command === 'active_library') {
        return null;
      }
      return null;
    });

    render(LibrariesPage);
    await waitFor(() => expect(screen.getAllByTestId('library-item')).toHaveLength(2));

    const names = () =>
      screen.getAllByTestId('library-name').map((element) => element.textContent?.trim() ?? '');
    // По умолчанию — свежие сверху.
    expect(names()).toEqual(['zeta', 'alpha']);

    // Кнопка направления стоит в том же контроле, что и поле порядка.
    const sort = screen.getByTestId('libraries-sort');
    await fireEvent.click(within(sort).getByTestId('libraries-sort-direction'));

    await waitFor(() => expect(names()).toEqual(['alpha', 'zeta']));
  });
});

describe('загрузка выбранной библиотеки', () => {
  /** История с одной библиотекой и незавершённым выбором. */
  function pendingSelection() {
    let finish: (() => void) | undefined;
    let calls = 0;
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
              added_at_millis: 2_000,
              available: true,
            },
          ],
        };
      }
      if (command === 'active_library') {
        return null;
      }
      if (command === 'select_source_library') {
        calls += 1;
        // Первый выбор не завершается, пока тест не отпустит его сам.
        if (calls === 1) {
          return new Promise((resolve) => {
            finish = () => resolve({ provider: 'p1', provider_name: 'books-source' });
          });
        }
        return { provider: 'p1', provider_name: 'books-source' };
      }
      return null;
    });
    return () => finish?.();
  }

  it('показывает прогресс вместо сведений, пока библиотека не загружена', async () => {
    localStorage.clear();
    const finish = pendingSelection();
    render(LibrariesPage);
    await waitFor(() => expect(screen.getAllByTestId('library-item')).toHaveLength(2));

    const item = screen
      .getAllByTestId('library-item')
      .find((element) => element.textContent?.includes('alpha')) as HTMLElement;
    await fireEvent.click(item.querySelector('[data-testid="library-item"] button') as HTMLElement);

    // Сведения о библиотеке ещё не подтверждены: карточка показывает прогресс.
    await waitFor(() => expect(screen.getByTestId('library-card-progress')).toBeTruthy());
    expect(screen.queryByTestId('library-card-open')).toBeNull();
    expect(screen.queryByText('Загружена')).toBeNull();
    // Карточка называет библиотеку, которую грузит.
    expect(screen.getByTestId('library-card-progress').textContent).toContain('alpha');

    finish();
    // Загрузка закончилась: сведения и переход к книгам появляются.
    await waitFor(() => expect(screen.getByTestId('library-card-open')).toBeTruthy());
    expect(screen.queryByTestId('library-card-progress')).toBeNull();
  });

  it('не блокирует список, пока одна библиотека грузится', async () => {
    localStorage.clear();
    const finish = pendingSelection();
    render(LibrariesPage);
    await waitFor(() => expect(screen.getAllByTestId('library-item')).toHaveLength(2));

    const item = screen
      .getAllByTestId('library-item')
      .find((element) => element.textContent?.includes('alpha')) as HTMLElement;
    await fireEvent.click(item.querySelector('[data-testid="library-item"] button') as HTMLElement);
    await waitFor(() => expect(screen.getByTestId('library-card-progress')).toBeTruthy());

    // Другая строка списка остаётся кликабельной: выбор можно поменять.
    const other = screen
      .getAllByTestId('library-item')
      .find((element) => element.textContent?.includes('zeta')) as HTMLElement;
    const button = other.querySelector('[data-testid="library-item"] button') as HTMLButtonElement;
    expect(button.disabled).toBe(false);

    await fireEvent.click(button);
    finish();
    // Новый выбор главнее прежнего: карточка показывает zeta.
    await waitFor(() => expect(screen.getByTestId('library-card').textContent).toContain('zeta'));
  });
});

describe('оформление библиотек', () => {
  /** История из одной оформленной библиотеки. */
  function decoratedHistory() {
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
              name: 'Домашняя',
              description: 'Книги вечером',
              icon: 'star',
              color: 'blue',
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

  it('показывает название, иконку и цвет записи; описание — только в карточке', async () => {
    decoratedHistory();
    render(LibrariesPage);

    await waitFor(() => expect(screen.getAllByTestId('library-item')).toHaveLength(1));
    // Пользовательское название перекрывает имя папки.
    expect(screen.getByTestId('library-name').textContent).toContain('Домашняя');
    // Описание в элементе списка не показывается: оно принадлежит карточке.
    expect(screen.queryByTestId('library-item-description')).toBeNull();
    // Цвет задаёт заливку и обводку строки, иконка стоит перед названием.
    const item = screen.getByTestId('library-item');
    const style = item.querySelector('[style]')?.getAttribute('style') ?? '';
    expect(style).toContain('--row-fill');
    expect(style).toContain('--row-line');
    const name = item.querySelector('[data-testid="library-name"]');
    expect(name?.parentElement?.querySelector('svg')).not.toBeNull();

    // Выбор строки показывает название и описание в шапке карточки; «загружена»
    // стоит ниже, вне кликабельной области.
    await fireEvent.click(item.querySelector('[data-testid="library-item"] button') as HTMLElement);
    const open = await screen.findByTestId('library-card-open');
    const head = open.parentElement as HTMLElement;
    expect(head.textContent).toContain('Домашняя');
    expect(within(head).getByTestId('library-card-description').textContent).toContain(
      'Книги вечером',
    );
    expect(head.textContent).not.toContain('загружена');
    expect(screen.getByTestId('library-card').textContent).toContain('загружена');
  });

  it('применяет цвет и к карточке библиотеки', async () => {
    decoratedHistory();
    render(LibrariesPage);

    await waitFor(() => expect(screen.getAllByTestId('library-item')).toHaveLength(1));
    const item = screen.getByTestId('library-item');
    await fireEvent.click(item.querySelector('[data-testid="library-item"] button') as HTMLElement);
    const card = await screen.findByTestId('library-card-open');
    // Шапка карточки залита цветом библиотеки; обводка карточки — тоже.
    expect(card.parentElement?.className).toContain('bg-[var(--row-fill-selected');
    expect(screen.getByTestId('library-card').getAttribute('style')).toContain('--row-line');
  });

  it('делает кликабельной всю шапку карточки, а меню выносит из неё', async () => {
    decoratedHistory();
    render(LibrariesPage);

    await waitFor(() => expect(screen.getAllByTestId('library-item')).toHaveLength(1));
    const item = screen.getByTestId('library-item');
    await fireEvent.click(item.querySelector('[data-testid="library-item"] button') as HTMLElement);
    const open = await screen.findByTestId('library-card-open');

    // Кнопка-наложение занимает всю шапку: целиться в текст не нужно.
    expect(open.className).toContain('absolute inset-0');
    // Название и описание — внутри шапки, но не внутри кнопки: они не мешают
    // нажатию в любое место.
    const head = open.parentElement as HTMLElement;
    expect(within(head).getByTestId('library-card-description')).toBeTruthy();
    // Меню стоит рядом с кнопкой, а не поверх неё.
    const menu = within(head).getByRole('button', { name: 'Действия с библиотекой' });
    expect(open.contains(menu)).toBe(false);
  });

  it('даёт карточке то же меню оформления, что и записи списка', async () => {
    decoratedHistory();
    render(LibrariesPage);

    await waitFor(() => expect(screen.getAllByTestId('library-item')).toHaveLength(1));
    const item = screen.getByTestId('library-item');
    await fireEvent.click(item.querySelector('[data-testid="library-item"] button') as HTMLElement);
    const card = await screen.findByTestId('library-card');

    // Меню карточки: смена цвета доступна прямо из неё.
    await fireEvent.click(within(card).getByRole('button', { name: 'Действия с библиотекой' }));
    await fireEvent.click(await screen.findByTestId('menu-color-red'));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        'library_history_appearance',
        expect.objectContaining({ path: '/lib/alpha', color: 'red' }),
      ),
    );
  });

  it('сохраняет цвет и иконку командой оформления', async () => {
    decoratedHistory();
    render(LibrariesPage);

    await waitFor(() => expect(screen.getAllByTestId('library-item')).toHaveLength(1));
    await fireEvent.click(screen.getByRole('button', { name: 'Действия с библиотекой' }));
    await fireEvent.click(await screen.findByTestId('menu-color-green'));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('library_history_appearance', {
        path: '/lib/alpha',
        name: 'Домашняя',
        description: 'Книги вечером',
        icon: 'star',
        color: 'green',
      }),
    );
  });

  it('правит название диалогом и снимает его пустым полем', async () => {
    decoratedHistory();
    render(LibrariesPage);

    await waitFor(() => expect(screen.getAllByTestId('library-item')).toHaveLength(1));
    await fireEvent.click(screen.getByRole('button', { name: 'Действия с библиотекой' }));
    await fireEvent.click(await screen.findByRole('menuitem', { name: 'Редактировать название' }));

    const field = (await screen.findByRole('textbox', {
      name: 'Название библиотеки',
    })) as HTMLInputElement;
    expect(field.value).toBe('Домашняя');
    await fireEvent.input(field, { target: { value: 'Рабочая' } });
    await fireEvent.click(screen.getByLabelText('Сохранить'));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        'library_history_appearance',
        expect.objectContaining({ path: '/lib/alpha', name: 'Рабочая' }),
      ),
    );
  });
});
