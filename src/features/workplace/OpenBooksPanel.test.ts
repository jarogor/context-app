import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import OpenBooksPanel from './OpenBooksPanel.svelte';
import type { WorkspaceTab } from './workplace';

vi.mock('../reader/reader', () => ({
  openBookFile: vi.fn(),
}));

import { openBookFile } from '../reader/reader';

const openExternal = vi.mocked(openBookFile);

beforeEach(() => {
  openExternal.mockReset();
});

/** Вкладка с заданным оформлением. */
function tab(id: string, overrides: Partial<WorkspaceTab> = {}): WorkspaceTab {
  return {
    id,
    path: `/lib/${id}.epub`,
    title: `Книга ${id}`,
    format: 'epub',
    zoom: 100,
    position: 0,
    mode: 'scroll',
    ...overrides,
  };
}

/** Обработчики панели с заглушками по умолчанию. */
function handlers() {
  return {
    openTabsLimit: 50,
    onSelect: vi.fn<(id: string) => void>(),
    onClose: vi.fn<(id: string) => void>(),
    onDuplicate: vi.fn<(id: string) => void>(),
    onEditAppearance: vi.fn(),
  };
}

describe('панель открытых книг: оформление', () => {
  it('показывает имя, иконку, цвет и описание', () => {
    render(OpenBooksPanel, {
      props: {
        tabs: [
          tab('t1', {
            name: 'Черновик',
            description: 'сравнение глав',
            icon: 'star',
            color: 'blue',
          }),
        ],
        activeTabId: 't1',
        ...handlers(),
      },
    });

    expect(screen.getByText('Черновик')).toBeTruthy();
    expect(screen.getByTestId('open-books-item-description').textContent).toContain(
      'сравнение глав',
    );
    expect(screen.getByTestId('open-books-item').getAttribute('style')).toContain('#2563eb');
    expect(screen.getByText('Черновик').closest('button')?.querySelector('svg')).toBeTruthy();
  });

  it('показывает путь к файлу книги', () => {
    render(OpenBooksPanel, {
      props: { tabs: [tab('t1')], activeTabId: 't1', ...handlers() },
    });

    const path = screen.getByTestId('open-books-item-path');
    expect(path.textContent).toContain('/lib/t1.epub');
    expect(path.closest('[title]')?.getAttribute('title')).toBe('/lib/t1.epub');
  });

  it('показывает формат книги вместо иконки каталога у пути', () => {
    render(OpenBooksPanel, {
      props: {
        tabs: [tab('t1'), tab('t2', { format: 'fb2' }), tab('t3', { format: 'pdf' })],
        activeTabId: 't1',
        ...handlers(),
      },
    });

    const badges = screen
      .getAllByTestId('open-books-item-path-badge')
      .map((element) => element.textContent?.trim());
    expect(badges).toEqual(['EPUB', 'FB2', 'PDF']);
  });

  it('не показывает метку у вкладки без формата', () => {
    render(OpenBooksPanel, {
      props: { tabs: [tab('t1', { format: '' })], activeTabId: 't1', ...handlers() },
    });

    expect(screen.queryByTestId('open-books-item-path-badge')).toBeNull();
  });

  it('называет книгу отдельно, если вкладка переименована', () => {
    render(OpenBooksPanel, {
      props: { tabs: [tab('t1', { name: 'Черновик' })], activeTabId: 't1', ...handlers() },
    });

    const meta = screen.getByTestId('open-books-item-meta');
    expect(meta.textContent).toContain('Книга t1');
    expect(meta.textContent).toContain('/lib/t1.epub');
  });

  it('не повторяет название книги, когда вкладка не переименована', () => {
    render(OpenBooksPanel, {
      props: { tabs: [tab('t1')], activeTabId: 't1', ...handlers() },
    });

    const meta = screen.getByTestId('open-books-item-meta');
    expect(meta.textContent).not.toContain('Книга t1');
  });

  it('оставляет прежний вид пункта без оформления', () => {
    render(OpenBooksPanel, {
      props: { tabs: [tab('t1')], activeTabId: 't1', ...handlers() },
    });

    expect(screen.getByText('Книга t1')).toBeTruthy();
    expect(screen.queryByTestId('open-books-item-description')).toBeNull();
    expect(screen.getByTestId('open-books-item').getAttribute('style')).not.toContain('color-mix');
  });

  it('отмечает активную вкладку и не несёт отдельной кнопки закрытия', () => {
    render(OpenBooksPanel, {
      props: { tabs: [tab('t1'), tab('t2')], activeTabId: 't2', ...handlers() },
    });

    const items = screen.getAllByTestId('open-books-item');
    expect(items[0].getAttribute('data-active')).toBe('false');
    expect(items[1].getAttribute('data-active')).toBe('true');
    // Отдельная кнопка закрытия убрана: закрытие — пункт меню оформления.
    expect(screen.queryByLabelText('Закрыть вкладку')).toBeNull();
  });

  it('оформляет пункт как строку заметок: без обводки у невыбранных', () => {
    // Дефект: у каждого пункта была своя обводка, из-за чего список читался
    // набором рамок, а не единым листом, как в заметках.
    render(OpenBooksPanel, {
      props: { tabs: [tab('t1'), tab('t2')], activeTabId: 't2', ...handlers() },
    });

    const items = screen.getAllByTestId('open-books-item');
    // Невыбранный пункт — на фоне карточки и без видимой обводки.
    expect(items[0].className).toContain('bg-[var(--card)]');
    expect(items[0].className).toContain('border-transparent');
    // Выбранный — фон выбора и обводка.
    expect(items[1].className).toContain('bg-[var(--surface-selected)]');
    expect(items[1].className).toContain('border-[var(--item-line)]');
  });

  it('даёт обводку выбранному пункту и не даёт невыбранному цветному', () => {
    // Цветная обводка — общий расчёт цвета: тот же, что у плашки на полосе.
    // Контур получает только выбранный пункт, как и на полосе вкладок.
    render(OpenBooksPanel, {
      props: {
        tabs: [tab('t1', { color: 'blue' }), tab('t2', { color: 'blue' })],
        activeTabId: 't1',
        ...handlers(),
      },
    });

    const items = screen.getAllByTestId('open-books-item');
    // Выбранный цветной — контур цветом вкладки.
    expect(items[0].className).toContain('border-[var(--item-line)]');
    expect(items[0].getAttribute('style')).toContain('--item-line: color-mix');
    expect(items[0].getAttribute('style')).toContain('#2563eb');
    // Невыбранный цветной — только заливка, без контура.
    expect(items[1].className).toContain('border-transparent');
    expect(items[1].className).not.toContain('border-[var(--item-line)]');
  });
});

describe('панель открытых книг: поиск', () => {
  it('фильтрует по имени, названию книги и описанию', async () => {
    render(OpenBooksPanel, {
      props: {
        tabs: [
          tab('t1', { name: 'Черновик' }),
          tab('t2'),
          tab('t3', { description: 'глубокий анализ' }),
        ],
        activeTabId: 't1',
        ...handlers(),
      },
    });
    const query = screen.getByLabelText('Поиск по вкладкам');

    await fireEvent.input(query, { target: { value: 'черновик' } });
    expect(screen.queryByText('Книга t2')).toBeNull();
    expect(screen.getByText('Черновик')).toBeTruthy();

    await fireEvent.input(query, { target: { value: 't2' } });
    expect(screen.getByText('Книга t2')).toBeTruthy();
    expect(screen.queryByText('Черновик')).toBeNull();

    await fireEvent.input(query, { target: { value: 'анализ' } });
    expect(screen.getByText('Книга t3')).toBeTruthy();
    expect(screen.queryByText('Книга t2')).toBeNull();
  });

  it('показывает пустое состояние поиска, не меняя состав вкладок', async () => {
    const tabs = [tab('t1'), tab('t2')];
    render(OpenBooksPanel, { props: { tabs, activeTabId: 't1', ...handlers() } });

    await fireEvent.input(screen.getByLabelText('Поиск по вкладкам'), {
      target: { value: 'нет такого' },
    });

    expect(screen.getByTestId('open-books-search-empty')).toBeTruthy();
    expect(tabs).toHaveLength(2);
  });
});

describe('панель открытых книг: правка оформления по пунктам меню', () => {
  it('выбор цвета вызывает правку только цвета', async () => {
    const base = handlers();
    render(OpenBooksPanel, {
      props: { tabs: [tab('t1', { color: 'red' })], activeTabId: 't1', ...base },
    });

    await fireEvent.click(screen.getByLabelText('Оформление вкладки'));
    await fireEvent.click(await screen.findByLabelText('синий'));

    expect(base.onEditAppearance).toHaveBeenCalledWith('t1', { color: 'blue' });
  });

  it('выбор иконки вызывает правку только иконки', async () => {
    const base = handlers();
    render(OpenBooksPanel, {
      props: { tabs: [tab('t1')], activeTabId: 't1', ...base },
    });

    await fireEvent.click(screen.getByLabelText('Оформление вкладки'));
    await fireEvent.click(await screen.findByTestId('menu-icon-star'));

    expect(base.onEditAppearance).toHaveBeenCalledWith('t1', { icon: 'star' });
  });

  it('правка названия сохраняет только имя', async () => {
    const base = handlers();
    render(OpenBooksPanel, {
      props: { tabs: [tab('t1')], activeTabId: 't1', ...base },
    });

    await fireEvent.click(screen.getByLabelText('Оформление вкладки'));
    await fireEvent.click(await screen.findByRole('menuitem', { name: 'Добавить название' }));
    await fireEvent.input(screen.getByLabelText('Название вкладки'), {
      target: { value: 'Черновик' },
    });
    await fireEvent.click(screen.getByLabelText('Сохранить'));

    expect(base.onEditAppearance).toHaveBeenCalledWith('t1', { name: 'Черновик' });
    expect(screen.queryByLabelText('Название вкладки')).toBeNull();
  });

  it('правка описания сохраняет только описание', async () => {
    const base = handlers();
    render(OpenBooksPanel, {
      props: { tabs: [tab('t1', { name: 'Имя' })], activeTabId: 't1', ...base },
    });

    await fireEvent.click(screen.getByLabelText('Оформление вкладки'));
    await fireEvent.click(await screen.findByRole('menuitem', { name: 'Добавить описание' }));
    await fireEvent.input(screen.getByLabelText('Описание вкладки'), {
      target: { value: 'сравнение глав' },
    });
    await fireEvent.click(screen.getByLabelText('Сохранить'));

    expect(base.onEditAppearance).toHaveBeenCalledWith('t1', { description: 'сравнение глав' });
  });

  it('отмена правки не сохраняет и не мешает открыть её снова', async () => {
    const base = handlers();
    render(OpenBooksPanel, {
      props: { tabs: [tab('t1', { name: 'Имя' })], activeTabId: 't1', ...base },
    });

    await fireEvent.click(screen.getByLabelText('Оформление вкладки'));
    // Имя уже задано, поэтому пункт предлагает редактирование, а не добавление.
    await fireEvent.click(await screen.findByRole('menuitem', { name: 'Редактировать название' }));
    await fireEvent.input(screen.getByLabelText('Название вкладки'), {
      target: { value: 'X' },
    });
    await fireEvent.click(screen.getByLabelText('Отмена'));
    expect(base.onEditAppearance).not.toHaveBeenCalled();

    await fireEvent.click(screen.getByLabelText('Оформление вкладки'));
    await fireEvent.click(await screen.findByRole('menuitem', { name: 'Редактировать название' }));
    expect((screen.getByLabelText('Название вкладки') as HTMLInputElement).value).toBe('Имя');
  });

  it('очистка поля снимает свойство', async () => {
    const base = handlers();
    render(OpenBooksPanel, {
      props: { tabs: [tab('t1', { name: 'Имя' })], activeTabId: 't1', ...base },
    });

    await fireEvent.click(screen.getByLabelText('Оформление вкладки'));
    await fireEvent.click(await screen.findByRole('menuitem', { name: 'Редактировать название' }));
    await fireEvent.click(screen.getByLabelText('Очистить поле'));

    expect(base.onEditAppearance).toHaveBeenCalledWith('t1', { name: undefined });
  });

  it('сброс оформления очищает все поля вкладки', async () => {
    const base = handlers();
    render(OpenBooksPanel, {
      props: {
        tabs: [
          tab('t1', {
            name: 'Имя',
            description: 'Описание',
            icon: 'star',
            color: 'blue',
          }),
        ],
        activeTabId: 't1',
        ...base,
      },
    });

    await fireEvent.click(screen.getByLabelText('Оформление вкладки'));
    await fireEvent.click(await screen.findByRole('menuitem', { name: 'Сбросить все изменения' }));

    expect(base.onEditAppearance).toHaveBeenCalledWith('t1', {
      name: undefined,
      description: undefined,
      icon: undefined,
      color: undefined,
    });
  });

  it('закрытие вкладки доступно пунктом контекстного меню', async () => {
    const base = handlers();
    render(OpenBooksPanel, {
      props: { tabs: [tab('t1')], activeTabId: 't1', ...base },
    });

    await fireEvent.click(screen.getByLabelText('Оформление вкладки'));
    await fireEvent.click(await screen.findByRole('menuitem', { name: 'Закрыть вкладку' }));

    expect(base.onClose).toHaveBeenCalledWith('t1');
    expect(base.onEditAppearance).not.toHaveBeenCalled();
  });

  it('дублирование вкладки доступно пунктом контекстного меню', async () => {
    const base = handlers();
    render(OpenBooksPanel, {
      props: { tabs: [tab('t1')], activeTabId: 't1', ...base },
    });

    await fireEvent.click(screen.getByLabelText('Оформление вкладки'));
    await fireEvent.click(await screen.findByRole('menuitem', { name: 'Дублировать вкладку' }));

    expect(base.onDuplicate).toHaveBeenCalledWith('t1');
    expect(base.onClose).not.toHaveBeenCalled();
    expect(base.onEditAppearance).not.toHaveBeenCalled();
  });
});

describe('панель открытых книг: открытие книги в другой программе', () => {
  it('открывает файл вкладки системным приложением', async () => {
    // Книга открывается тем файлом, что лежит во вкладке: рабочее место и
    // вкладка при этом не меняются.
    render(OpenBooksPanel, {
      props: {
        ...handlers(),
        tabs: [tab('t1', { path: '/lib/book.pdf' })],
        activeTabId: 't1',
      },
    });

    await fireEvent.click(screen.getByLabelText('Оформление вкладки'));
    await fireEvent.click(
      await screen.findByRole('menuitem', { name: 'Открыть в другой программе' }),
    );

    await waitFor(() => expect(openExternal).toHaveBeenCalledWith('/lib/book.pdf'));
  });

  it('не закрывает и не дублирует вкладку при внешнем открытии', async () => {
    const base = handlers();
    render(OpenBooksPanel, {
      props: { ...base, tabs: [tab('t1')], activeTabId: 't1' },
    });

    await fireEvent.click(screen.getByLabelText('Оформление вкладки'));
    await fireEvent.click(
      await screen.findByRole('menuitem', { name: 'Открыть в другой программе' }),
    );

    await waitFor(() => expect(openExternal).toHaveBeenCalled());
    expect(base.onClose).not.toHaveBeenCalled();
    expect(base.onDuplicate).not.toHaveBeenCalled();
    expect(base.onEditAppearance).not.toHaveBeenCalled();
  });
});

describe('панель открытых книг: активная вкладка остаётся видимой', () => {
  /** Прямоугольник элемента с заданными границами. */
  function rect(top: number, bottom: number): DOMRect {
    return {
      top,
      bottom,
      left: 0,
      right: 100,
      width: 100,
      height: bottom - top,
      x: 0,
      y: top,
      toJSON: () => ({}),
    } as DOMRect;
  }

  /** Список и его строки с искусственными границами: высота списка 100px. */
  function mockGeometry() {
    const list = screen.getByTestId('open-books-list');
    list.getBoundingClientRect = () => rect(0, 100);
    const items = screen.getAllByTestId('open-books-item');
    // Каждая строка высотой 40px идёт подряд: первая — 0–40, вторая — 40–80,
    // третья — 80–120 (частично видна), четвёртая — 120–160 (не видна).
    items.forEach((item, index) => {
      item.getBoundingClientRect = () => rect(index * 40, index * 40 + 40);
    });
    return { list, items };
  }

  it('прокручивает список к вкладке, выбранной снаружи панели', async () => {
    // Дефект: вкладку переключали в полосе сверху, а список панели оставался
    // на прежнем месте, и выбранной вкладки не было видно.
    const { rerender } = render(OpenBooksPanel, {
      props: {
        tabs: [tab('t1'), tab('t2'), tab('t3'), tab('t4')],
        activeTabId: 't1',
        ...handlers(),
      },
    });
    const { list } = mockGeometry();

    await rerender({
      tabs: [tab('t1'), tab('t2'), tab('t3'), tab('t4')],
      activeTabId: 't4',
      ...handlers(),
    });

    // Четвёртая строка кончается на 160px при высоте списка 100px.
    expect(list.scrollTop).toBe(60);
  });

  it('не двигает список, если выбранная вкладка уже видна', async () => {
    const { rerender } = render(OpenBooksPanel, {
      props: {
        tabs: [tab('t1'), tab('t2'), tab('t3'), tab('t4')],
        activeTabId: 't1',
        ...handlers(),
      },
    });
    const { list } = mockGeometry();
    list.scrollTop = 40;

    await rerender({
      tabs: [tab('t1'), tab('t2'), tab('t3'), tab('t4')],
      activeTabId: 't2',
      ...handlers(),
    });

    // Вторая строка (40–80) целиком внутри видимой части 40–140.
    expect(list.scrollTop).toBe(40);
  });

  it('не ищет вкладку, скрытую поиском', async () => {
    const { rerender } = render(OpenBooksPanel, {
      props: {
        tabs: [tab('t1'), tab('t2'), tab('t3'), tab('t4')],
        activeTabId: 't1',
        ...handlers(),
      },
    });
    const { list } = mockGeometry();
    await fireEvent.input(screen.getByLabelText('Поиск по вкладкам'), {
      target: { value: 't1' },
    });

    await rerender({
      tabs: [tab('t1'), tab('t2'), tab('t3'), tab('t4')],
      activeTabId: 't4',
      ...handlers(),
    });

    // Четвёртой строки в отфильтрованном списке нет — прокручивать не к чему.
    expect(list.scrollTop).toBe(0);
  });
});

describe('панель открытых книг: лимит открытых вкладок', () => {
  it('оставляет пункт дублирования доступным ниже лимита', async () => {
    render(OpenBooksPanel, {
      props: { ...handlers(), tabs: [tab('t1')], activeTabId: 't1', openTabsLimit: 5 },
    });

    await fireEvent.click(screen.getByLabelText('Оформление вкладки'));
    const duplicate = await screen.findByRole('menuitem', { name: 'Дублировать вкладку' });
    expect(duplicate.getAttribute('aria-disabled')).not.toBe('true');
    expect(duplicate.getAttribute('data-disabled')).toBeNull();
  });

  it('делает пункт дублирования недоступным при достижении лимита', async () => {
    render(OpenBooksPanel, {
      props: {
        ...handlers(),
        tabs: [tab('t1'), tab('t2')],
        activeTabId: 't1',
        openTabsLimit: 2,
      },
    });

    await fireEvent.click(screen.getAllByLabelText('Оформление вкладки')[0]);
    const duplicate = await screen.findByRole('menuitem', { name: 'Дублировать вкладку' });
    expect(duplicate.getAttribute('aria-disabled')).toBe('true');
    expect(duplicate.getAttribute('data-disabled')).not.toBeNull();
  });

  it('подсвечивает триггер меню при превышении лимита и снимает подсветку в пределе', async () => {
    const { rerender } = render(OpenBooksPanel, {
      props: {
        ...handlers(),
        tabs: [tab('t1'), tab('t2'), tab('t3')],
        activeTabId: 't1',
        openTabsLimit: 3,
      },
    });

    expect(screen.getAllByLabelText('Оформление вкладки')[0].className).not.toContain(
      'text-destructive',
    );

    await rerender({
      ...handlers(),
      tabs: [tab('t1'), tab('t2'), tab('t3')],
      activeTabId: 't1',
      openTabsLimit: 2,
    });

    const overTriggers = screen.getAllByLabelText('Оформление вкладки');
    expect(overTriggers[0].className).toContain('text-destructive');
    expect(overTriggers[0].getAttribute('title')).toBe('Превышен лимит открытых вкладок');

    await rerender({
      ...handlers(),
      tabs: [tab('t1'), tab('t2')],
      activeTabId: 't1',
      openTabsLimit: 2,
    });

    expect(screen.getAllByLabelText('Оформление вкладки')[0].className).not.toContain(
      'text-destructive',
    );
  });
});
