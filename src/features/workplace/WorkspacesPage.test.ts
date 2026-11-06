import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import WorkspacesPage from './WorkspacesPage.svelte';

vi.mock('../../shared/app-bridge', () => ({
  invokeCommand: vi.fn(async () => null),
  listenEvent: vi.fn(async () => () => {}),
  openDialog: vi.fn(async () => null),
}));

/** Обработчики экрана с заглушками по умолчанию. */
function handlers() {
  return {
    onCreate: vi.fn<(name: string) => void>(),
    onOpen: vi.fn<(id: string) => void>(),
    onRename: vi.fn<(id: string, name: string) => void>(),
    onRemove: vi.fn<(id: string) => void>(),
  };
}

describe('экран списка рабочих мест', () => {
  it('показывает рабочие места и отмечает текущее', () => {
    render(WorkspacesPage, {
      props: {
        workspaces: [
          { id: 'ws-1', name: 'Первое' },
          { id: 'ws-2', name: 'Второе' },
        ],
        currentId: 'ws-2',
        ...handlers(),
      },
    });

    expect(screen.getAllByTestId('workspace-item')).toHaveLength(2);
    expect(screen.getByTestId('workspace-current').textContent).toContain('Текущее');
    expect(screen.getAllByTestId('workspace-current')).toHaveLength(1);
  });

  it('показывает дату создания рабочего места', () => {
    render(WorkspacesPage, {
      props: {
        workspaces: [{ id: 'ws-1', name: 'Первое', createdAtMillis: 1_700_000_000_000 }],
        currentId: null,
        ...handlers(),
      },
    });

    expect(screen.getByTestId('workspace-meta').textContent).toContain('2023');
  });

  it('показывает подсказку при пустом списке', () => {
    render(WorkspacesPage, { props: { workspaces: [], currentId: null, ...handlers() } });

    expect(screen.getByTestId('workspaces-empty')).toBeTruthy();
  });

  it('фильтрует рабочие места по имени', async () => {
    render(WorkspacesPage, {
      props: {
        workspaces: [
          { id: 'ws-1', name: 'Первое' },
          { id: 'ws-2', name: 'Второе' },
        ],
        currentId: null,
        ...handlers(),
      },
    });

    await fireEvent.input(screen.getByPlaceholderText('Поиск рабочего места'), {
      target: { value: 'втор' },
    });

    expect(screen.getAllByTestId('workspace-item')).toHaveLength(1);
    expect(screen.getByTestId('workspace-name').textContent).toContain('Второе');
  });

  it('показывает книги и вкладки рядом, в одном блоке', () => {
    render(WorkspacesPage, {
      props: {
        workspaces: [
          {
            id: 'ws-1',
            name: 'Первое',
            // Одна книга открыта двумя вкладками: книг две, вкладок три.
            bookPaths: ['/lib/a.epub', '/lib/b.epub', '/lib/a.epub'],
          },
        ],
        currentId: null,
        ...handlers(),
      },
    });

    const meta = screen.getByTestId('workspace-meta').textContent ?? '';
    // Русское склонение: 2 книги, 3 вкладки (формы 2–4).
    expect(meta).toContain('2 книги');
    expect(meta).toContain('3 вкладки');
  });

  it('не падает, когда одна книга открыта в нескольких вкладках места', () => {
    // Превью обложек ключуется путём книги: повтор пути (одна книга в двух
    // вкладках) раньше давал дубликат ключа, падение рендера и вечный экран
    // загрузки. Повторы должны отбрасываться.
    render(WorkspacesPage, {
      props: {
        workspaces: [
          {
            id: 'ws-1',
            name: 'Первое',
            bookCount: 2,
            bookPaths: ['/lib/a.epub', '/lib/a.epub'],
          },
        ],
        currentId: null,
        ...handlers(),
      },
    });

    expect(screen.getByTestId('workspace-item')).toBeTruthy();
    // В превью книга показана один раз, а не дважды.
    expect(
      screen.getByTestId('workspace-covers').querySelectorAll('[data-testid="workspace-cover"]'),
    ).toHaveLength(1);
  });

  it('показывает «ничего не найдено» при пустом результате поиска', async () => {
    render(WorkspacesPage, {
      props: { workspaces: [{ id: 'ws-1', name: 'Первое' }], currentId: null, ...handlers() },
    });

    await fireEvent.input(screen.getByPlaceholderText('Поиск рабочего места'), {
      target: { value: 'нет такого' },
    });

    expect(screen.getByTestId('workspaces-not-found')).toBeTruthy();
  });

  it('создаёт рабочее место из введённого имени', async () => {
    const base = handlers();
    render(WorkspacesPage, { props: { workspaces: [], currentId: null, ...base } });

    // Поле открывается кнопкой создания, а кнопка меняет действие по вводу.
    await fireEvent.click(screen.getByRole('button', { name: 'Создать рабочее место' }));
    const input = await screen.findByPlaceholderText('Новое рабочее место');
    await fireEvent.input(input, { target: { value: 'Новое' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Создать рабочее место' }));

    expect(base.onCreate).toHaveBeenCalledWith('Новое');
  });

  it('с пустым полем кнопка закрывает создание, а не создаёт место', async () => {
    const base = handlers();
    render(WorkspacesPage, { props: { workspaces: [], currentId: null, ...base } });

    await fireEvent.click(screen.getByRole('button', { name: 'Создать рабочее место' }));
    await expect(await screen.findByPlaceholderText('Новое рабочее место')).toBeTruthy();

    // Пустое поле: кнопка становится закрытием и убирает поле.
    await fireEvent.click(screen.getByLabelText('Отменить создание'));
    expect(base.onCreate).not.toHaveBeenCalled();
    expect(screen.queryByPlaceholderText('Новое рабочее место')).toBeNull();
  });

  it('показывает кнопку создания в одном и том же месте при открытии поля', async () => {
    const base = handlers();
    render(WorkspacesPage, { props: { workspaces: [], currentId: null, ...base } });

    // Кнопка не переезжает: меняется только её действие.
    const before = screen.getByRole('button', { name: 'Создать рабочее место' });
    expect(before.className).toContain('inline-flex');
    await fireEvent.click(before);
    expect(await screen.findByPlaceholderText('Новое рабочее место')).toBeTruthy();
    // На месте кнопки создания — та же иконочная кнопка закрытия.
    expect(screen.getByLabelText('Отменить создание')).toBeTruthy();
  });

  it('на узком окне показывает кнопку создания, а поле — по нажатию', async () => {
    // Поле во всю ширину оттесняло поиск, поэтому на телефоне и планшете
    // оно появляется только по нажатию кнопки.
    const matchMedia = vi.fn((query: string) => ({
      matches: query.includes('899'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    vi.stubGlobal('matchMedia', matchMedia);

    const base = handlers();
    render(WorkspacesPage, { props: { workspaces: [], currentId: null, ...base } });

    // Поля нет: на его месте только кнопка создания.
    expect(screen.queryByPlaceholderText('Новое рабочее место')).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Создать рабочее место' }));

    // Нажатие открывает поле, ввод и подтверждение создают место.
    const input = await screen.findByPlaceholderText('Новое рабочее место');
    await fireEvent.input(input, { target: { value: 'С телефона' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Создать рабочее место' }));
    expect(base.onCreate).toHaveBeenCalledWith('С телефона');

    vi.unstubAllGlobals();
  });

  it('открывает рабочее место по клику', async () => {
    const base = handlers();
    render(WorkspacesPage, {
      props: { workspaces: [{ id: 'ws-1', name: 'Первое' }], currentId: null, ...base },
    });

    await fireEvent.click(screen.getByTestId('workspace-open'));

    expect(base.onOpen).toHaveBeenCalledWith('ws-1');
  });

  it('переименовывает рабочее место через меню действий', async () => {
    const base = handlers();
    render(WorkspacesPage, {
      props: { workspaces: [{ id: 'ws-1', name: 'Старое' }], currentId: null, ...base },
    });

    await fireEvent.pointerDown(screen.getByLabelText(/Действия с рабочим местом/), {
      button: 0,
    });
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Переименовать' }));
    const input = screen.getByPlaceholderText('Новое имя');
    await fireEvent.input(input, { target: { value: 'Новое' } });
    await fireEvent.click(screen.getByText('Сохранить'));

    expect(base.onRename).toHaveBeenCalledWith('ws-1', 'Новое');
  });

  it('удаляет рабочее место через меню действий', async () => {
    const base = handlers();
    render(WorkspacesPage, {
      props: { workspaces: [{ id: 'ws-1', name: 'Первое' }], currentId: null, ...base },
    });

    await fireEvent.pointerDown(screen.getByLabelText(/Действия с рабочим местом/), {
      button: 0,
    });
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Удалить' }));

    expect(base.onRemove).toHaveBeenCalledWith('ws-1');
  });
});
