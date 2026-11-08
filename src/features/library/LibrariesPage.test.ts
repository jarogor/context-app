import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import LibrariesPage from './LibrariesPage.svelte';
import { invokeCommand, listenEvent } from '../../shared/app-bridge';

vi.mock('../../shared/app-bridge', () => ({
  invokeCommand: vi.fn(),
  listenEvent: vi.fn(async () => () => {}),
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
    // Открытая библиотека не повторяется строкой списка.
    const rows = screen
      .getAllByTestId('library-name')
      .map((element) => element.textContent?.trim());
    expect(rows).toEqual(['other-library']);

    // Название карточки открывает библиотеку: отдельной кнопки нет.
    await fireEvent.click(screen.getByTestId('library-card-open'));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        'select_source_library',
        expect.objectContaining({ path: '/demo-library' }),
      ),
    );
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

    await waitFor(() => expect(screen.getByTestId('library-item')).toBeTruthy());
    await fireEvent.click(screen.getByLabelText('Действия с библиотекой'));
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
