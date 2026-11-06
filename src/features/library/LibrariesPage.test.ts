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
    // Кнопка добавляет новую библиотеку в список, а не открывает выбранную.
    expect(screen.getByRole('button', { name: /Добавить/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Открыть библиотеку/ })).toBeNull();
  });

  it('пункт меню открывает директорию библиотеки, а не саму библиотеку', async () => {
    render(LibrariesPage);

    await waitFor(() => expect(screen.getByTestId('library-item')).toBeTruthy());
    await fireEvent.click(screen.getByLabelText('Действия с библиотекой'));
    await fireEvent.click(await screen.findByRole('menuitem', { name: 'Открыть папку' }));

    // Клик по строке открывает библиотеку; пункт меню делает то, чего клик не
    // умеет, — показывает её директорию в файловом менеджере.
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('open_folder', { path: '/demo-library' }),
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
