import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WorkplaceTabs from './WorkplaceTabs.svelte';
import { logEvent } from '../../shared/app-log';
import type { WorkspaceTab } from './workplace';
import { NARROW_MAX_WIDTH } from '../../shared/breakpoints';

vi.mock('../../shared/app-log', () => ({
  logEvent: vi.fn(async () => undefined),
}));

/** Вкладка с заданным идентификатором и названием. */
function tab(id: string, title: string): WorkspaceTab {
  return {
    id,
    path: `/lib/${id}.epub`,
    title,
    format: 'epub',
    zoom: 100,
    position: 0,
    mode: 'scroll',
  };
}

/** Набор вкладок с последовательными названиями. */
function tabs(count: number): WorkspaceTab[] {
  return Array.from({ length: count }, (_, index) => tab(`t${index + 1}`, `Книга ${index + 1}`));
}

/** Обработчики панели с заглушками по умолчанию. */
function handlers() {
  return {
    openTabsLimit: 50,
    onSelect: vi.fn<(id: string) => void>(),
    onClose: vi.fn<(id: string) => void>(),
    onDuplicate: vi.fn<(id: string) => void>(),
    onAdd: vi.fn(),
    onAddFile: vi.fn(),
    onToggleBooks: vi.fn(),
    onToggleNotes: vi.fn(),
  };
}

/** Задание ширины списка вкладок и масштаба для расчёта ёмкости. */
function mockWidth(width: number) {
  vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(width);
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({
    fontSize: '16px',
  } as unknown as CSSStyleDeclaration);
}

/** Подсказка кнопки: берётся с ближайшей обёртки, несущей `title`.
 *
 * Подсказка выставляется обёртке, а не недоступной кнопке: собственная
 * подсказка `disabled`-кнопки не показывается.
 */
function wrapperTitle(el: Element): string | null {
  return el.closest('[title]')?.getAttribute('title') ?? null;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(logEvent).mockClear();
});

describe('панель вкладок: окно и навигация', () => {
  it('показывает навигацию, счётчик и закреплённые кнопки действий при переполнении', () => {
    mockWidth(480);
    render(WorkplaceTabs, {
      props: {
        tabs: tabs(7),
        activeTabId: 't1',
        booksOpen: false,
        notesOpen: false,
        ...handlers(),
      },
    });

    expect(screen.getByLabelText('Следующие вкладки')).toBeTruthy();
    expect(screen.getByLabelText('Предыдущие вкладки')).toBeTruthy();
    expect(screen.getByTestId('workplace-tabs-counter').textContent).toContain('1–3 из 7');
    // Кнопки открытия книги закреплены вне окна вкладок и видны.
    expect(screen.getByLabelText('Добавить книгу')).toBeTruthy();
    expect(screen.getByLabelText('Открыть файл с диска')).toBeTruthy();
  });

  it('навигация сдвигает видимый диапазон и счётчик', async () => {
    mockWidth(480);
    render(WorkplaceTabs, {
      props: {
        tabs: tabs(5),
        activeTabId: 't1',
        booksOpen: false,
        notesOpen: false,
        ...handlers(),
      },
    });

    expect(screen.getByTestId('workplace-tabs-counter').textContent).toContain('1–3 из 5');
    await fireEvent.click(screen.getByLabelText('Следующие вкладки'));

    expect(screen.getByTestId('workplace-tabs-counter').textContent).toContain('2–4 из 5');
    // Номер вкладки — её место в составе места, а не порядок в окне: при
    // листании номера не «переезжают».
    expect(screen.getAllByTestId('workplace-tab-item').map((el) => el.textContent?.trim())).toEqual(
      ['2  Книга 2', '3  Книга 3', '4  Книга 4'],
    );
  });

  it('навигация не меняет состав вкладок и активную вкладку', async () => {
    mockWidth(480);
    const base = handlers();
    render(WorkplaceTabs, {
      props: {
        tabs: tabs(5),
        activeTabId: 't1',
        booksOpen: false,
        notesOpen: false,
        ...base,
      },
    });

    await fireEvent.click(screen.getByLabelText('Следующие вкладки'));

    expect(screen.getAllByTestId('workplace-tab-item')).toHaveLength(3);
    expect(base.onSelect).not.toHaveBeenCalled();
    expect(base.onClose).not.toHaveBeenCalled();
    expect(base.onDuplicate).not.toHaveBeenCalled();
  });

  it('скрывает навигацию и счётчик, когда все вкладки помещаются', () => {
    mockWidth(320);
    render(WorkplaceTabs, {
      props: {
        tabs: tabs(2),
        activeTabId: 't1',
        booksOpen: false,
        notesOpen: false,
        ...handlers(),
      },
    });

    expect(screen.queryByLabelText('Следующие вкладки')).toBeNull();
    expect(screen.queryByLabelText('Предыдущие вкладки')).toBeNull();
    expect(screen.queryByTestId('workplace-tabs-counter')).toBeNull();
    expect(screen.getAllByTestId('workplace-tab-item')).toHaveLength(2);
  });

  it('сдвигает окно, чтобы показать активную вкладку за границей', async () => {
    mockWidth(480);
    const { rerender } = render(WorkplaceTabs, {
      props: {
        tabs: tabs(5),
        activeTabId: 't1',
        booksOpen: false,
        notesOpen: false,
        ...handlers(),
      },
    });
    expect(screen.queryByText('Книга 5')).toBeNull();

    await rerender({
      tabs: tabs(5),
      activeTabId: 't5',
      booksOpen: false,
      notesOpen: false,
      ...handlers(),
    });

    expect(screen.getByText('Книга 5')).toBeTruthy();
    expect(screen.getByTestId('workplace-tabs-counter').textContent).toContain('3–5 из 5');
  });
});

describe('панель вкладок: оформление вкладки', () => {
  /** Вкладка с заданным пользовательским оформлением. */
  function decorated(): WorkspaceTab {
    return {
      ...tab('t1', 'Книга 1'),
      name: 'Черновик',
      description: 'сравнение глав',
      icon: 'star',
      color: 'blue',
    };
  }

  it('показывает имя, иконку, цвет и описание в подсказке', () => {
    mockWidth(320);
    render(WorkplaceTabs, {
      props: {
        tabs: [decorated()],
        activeTabId: 't1',
        booksOpen: false,
        notesOpen: false,
        ...handlers(),
      },
    });

    const item = screen.getAllByTestId('workplace-tab')[0];
    expect(item.textContent).toContain('Черновик');
    expect(item.querySelector('svg')).toBeTruthy();
    expect(item.getAttribute('title')).toBe('Черновик (Книга 1)');
    const box = screen.getAllByTestId('workplace-tab-item')[0];
    expect(box.getAttribute('style')).toContain('#2563eb');
  });

  it('даёт неактивной вкладке фон, отличный от полосы', () => {
    // Дефект: неактивная вкладка без цвета сливалась с полосой, потому что
    // фон у неё отсутствовал. Фон общий для всех неактивных вкладок.
    mockWidth(320);
    render(WorkplaceTabs, {
      props: {
        tabs: [tab('t1', 'Книга 1'), tab('t2', 'Книга 2')],
        activeTabId: 't1',
        booksOpen: false,
        notesOpen: false,
        ...handlers(),
      },
    });
    const [active, inactive] = screen.getAllByTestId('workplace-tab-item');
    // Активная — как активный пункт раздела в шапке: акцентная заливка и
    // светлый текст поверх неё. Неактивная — общий фон, отличный от полосы.
    expect(active.className).toContain('bg-[var(--primary)]');
    expect(active.className).toContain('text-[var(--primary-foreground)]');
    expect(inactive.className).toContain('bg-[var(--tab-idle-surface)]');
  });

  it('заливает неактивную цветную вкладку поверх общего фона', () => {
    // Цветная неактивная отличается от нецветной только слабым оттенком
    // цвета, а основа у них одна — фон неактивной вкладки.
    mockWidth(320);
    render(WorkplaceTabs, {
      props: {
        tabs: [tab('t1', 'Книга 1'), { ...decorated(), id: 't2' }],
        activeTabId: 't1',
        booksOpen: false,
        notesOpen: false,
        ...handlers(),
      },
    });
    const [, colored] = screen.getAllByTestId('workplace-tab-item');
    expect(colored.className).toContain('bg-[var(--tab-fill)]');
    expect(colored.getAttribute('style')).toContain('var(--tab-idle-surface)');
  });

  it('заливает активную цветную вкладку плотнее неактивной', () => {
    // Активная заливается заметно плотнее: 40% цвета против 7% у неактивной.
    mockWidth(320);
    render(WorkplaceTabs, {
      props: {
        tabs: [tab('t1', 'Книга 1'), { ...decorated(), id: 't2' }],
        activeTabId: 't2',
        booksOpen: false,
        notesOpen: false,
        ...handlers(),
      },
    });
    const active = screen.getAllByTestId('workplace-tab-item')[1];
    expect(active.className).toContain('bg-[var(--tab-fill-active)]');
    expect(active.getAttribute('style')).toContain(
      '--tab-fill-active: color-mix(in oklab, #2563eb 40%',
    );
  });

  it('оставляет прежний вид вкладки без оформления', () => {
    mockWidth(320);
    render(WorkplaceTabs, {
      props: {
        tabs: [tab('t1', 'Книга 1')],
        activeTabId: 't1',
        booksOpen: false,
        notesOpen: false,
        ...handlers(),
      },
    });

    const item = screen.getAllByTestId('workplace-tab')[0];
    expect(item.textContent).toContain('Книга 1');
    expect(item.querySelector('svg')).toBeNull();
    expect(item.getAttribute('title')).toBe('Книга 1');
    expect(screen.getAllByTestId('workplace-tab-item')[0].getAttribute('style')).not.toContain(
      'color-mix',
    );
  });
});

describe('панель вкладок: подтверждение закрытия', () => {
  it('открывает подтверждение по кнопке закрытия и не закрывает вкладку сразу', async () => {
    mockWidth(320);
    const base = handlers();
    render(WorkplaceTabs, {
      props: {
        tabs: tabs(2),
        activeTabId: 't1',
        booksOpen: false,
        notesOpen: false,
        ...base,
      },
    });

    await fireEvent.click(screen.getAllByTestId('workplace-tab-close')[1]);

    expect(screen.getByTestId('workplace-tab-close-question')).toBeTruthy();
    // Крестика в диалоге нет: закрыть окно можно кнопкой «Нет».
    expect(screen.queryByLabelText('Закрыть')).toBeNull();
    expect(screen.getByText('Да')).toBeTruthy();
    expect(screen.getByText('Нет')).toBeTruthy();
    expect(base.onClose).not.toHaveBeenCalled();
  });

  it('подтверждение закрывает запомненную вкладку', async () => {
    mockWidth(320);
    const base = handlers();
    render(WorkplaceTabs, {
      props: {
        tabs: tabs(2),
        activeTabId: 't1',
        booksOpen: false,
        notesOpen: false,
        ...base,
      },
    });

    await fireEvent.click(screen.getAllByTestId('workplace-tab-close')[1]);
    await fireEvent.click(screen.getByText('Да'));

    expect(base.onClose).toHaveBeenCalledWith('t2');
    expect(base.onSelect).not.toHaveBeenCalled();
    expect(base.onDuplicate).not.toHaveBeenCalled();
    expect(screen.queryByTestId('workplace-tab-close-question')).toBeNull();
  });

  it('отмена подтверждения не меняет состав вкладок', async () => {
    mockWidth(320);
    const base = handlers();
    render(WorkplaceTabs, {
      props: {
        tabs: tabs(2),
        activeTabId: 't1',
        booksOpen: false,
        notesOpen: false,
        ...base,
      },
    });

    await fireEvent.click(screen.getAllByTestId('workplace-tab-close')[1]);
    await fireEvent.click(screen.getByText('Нет'));

    expect(base.onClose).not.toHaveBeenCalled();
    expect(screen.queryByTestId('workplace-tab-close-question')).toBeNull();
  });

  it('иконки дублирования и закрытия остаются у вкладки', () => {
    mockWidth(320);
    render(WorkplaceTabs, {
      props: {
        tabs: tabs(1),
        activeTabId: 't1',
        booksOpen: false,
        notesOpen: false,
        ...handlers(),
      },
    });

    expect(screen.getByLabelText('Дублировать вкладку')).toBeTruthy();
    expect(screen.getByTestId('workplace-tab-close')).toBeTruthy();
  });

  it('подпись кнопки панели заметок — «Заметки»', () => {
    mockWidth(320);
    render(WorkplaceTabs, {
      props: {
        tabs: tabs(1),
        activeTabId: 't1',
        booksOpen: false,
        notesOpen: false,
        ...handlers(),
      },
    });

    expect(screen.getByTestId('workplace-notes-toggle').getAttribute('aria-label')).toBe('Заметки');
  });

  it('подпись кнопки панели списка — «Вкладки»', () => {
    mockWidth(320);
    render(WorkplaceTabs, {
      props: {
        tabs: tabs(1),
        activeTabId: 't1',
        booksOpen: false,
        notesOpen: false,
        ...handlers(),
      },
    });

    expect(screen.getByLabelText('Вкладки')).toBeTruthy();
  });
});

describe('панель вкладок: лимит открытых вкладок', () => {
  it('оставляет открытие и дублирование доступными ниже лимита', () => {
    mockWidth(320);
    render(WorkplaceTabs, {
      props: {
        tabs: tabs(2),
        activeTabId: 't1',
        booksOpen: false,
        notesOpen: false,
        ...handlers(),
        openTabsLimit: 5,
      },
    });

    const add = screen.getByLabelText('Добавить книгу') as HTMLButtonElement;
    const addFile = screen.getByLabelText('Открыть файл с диска') as HTMLButtonElement;
    expect(add.disabled).toBe(false);
    expect(addFile.disabled).toBe(false);
    expect(wrapperTitle(add)).toBe('Добавить книгу');
    expect(logEvent).not.toHaveBeenCalled();
  });

  it('блокирует открытие и дублирование при достижении лимита', async () => {
    mockWidth(320);
    render(WorkplaceTabs, {
      props: {
        tabs: tabs(3),
        activeTabId: 't1',
        booksOpen: false,
        notesOpen: false,
        ...handlers(),
        openTabsLimit: 3,
      },
    });

    const add = screen.getByLabelText('Добавить книгу') as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    expect(wrapperTitle(add)).toBe('Достигнут лимит открытых вкладок');
    expect(add.className).not.toContain('text-destructive');

    const duplicate = screen.getAllByLabelText('Дублировать вкладку')[0] as HTMLButtonElement;
    expect(duplicate.disabled).toBe(true);
    expect(wrapperTitle(duplicate)).toBe('Достигнут лимит открытых вкладок');
    // Достижение лимита ещё не превышение: в журнал ничего не пишется.
    await Promise.resolve();
    expect(logEvent).not.toHaveBeenCalled();
  });

  it('выделяет превышение и пишет пояснение в журнал один раз', async () => {
    mockWidth(320);
    const { rerender } = render(WorkplaceTabs, {
      props: {
        tabs: tabs(5),
        activeTabId: 't1',
        booksOpen: false,
        notesOpen: false,
        ...handlers(),
        openTabsLimit: 5,
      },
    });

    await rerender({
      tabs: tabs(5),
      activeTabId: 't1',
      booksOpen: false,
      notesOpen: false,
      ...handlers(),
      openTabsLimit: 3,
    });

    const add = screen.getByLabelText('Добавить книгу') as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    expect(wrapperTitle(add)).toBe('Превышен лимит открытых вкладок');
    expect(add.className).toContain('text-destructive');

    // Кнопка дублирования вкладки тоже выделяется как превышение.
    const duplicate = screen.getAllByLabelText('Дублировать вкладку')[0] as HTMLButtonElement;
    expect(duplicate.disabled).toBe(true);
    expect(duplicate.className).toContain('text-destructive');
    expect(wrapperTitle(duplicate)).toBe('Превышен лимит открытых вкладок');

    // Повторный рендер при том же превышении не пишет запись дважды.
    await rerender({
      tabs: tabs(5),
      activeTabId: 't1',
      booksOpen: false,
      notesOpen: false,
      ...handlers(),
      openTabsLimit: 3,
    });
    expect(logEvent).toHaveBeenCalledTimes(1);

    // Возврат в предел снимает выделение и подсказку о превышении.
    await rerender({
      tabs: tabs(2),
      activeTabId: 't1',
      booksOpen: false,
      notesOpen: false,
      ...handlers(),
      openTabsLimit: 3,
    });
    const relaxed = screen.getByLabelText('Добавить книгу') as HTMLButtonElement;
    expect(relaxed.disabled).toBe(false);
    expect(wrapperTitle(relaxed)).toBe('Добавить книгу');
    expect(relaxed.className).not.toContain('text-destructive');
  });
});

describe('панель вкладок: место кнопок панелей', () => {
  /** Порядок дочерних блоков полосы вкладок. */
  function rowChildren(): Element[] {
    const row = screen.getByTestId('workplace-tabs');
    return Array.from(row.children);
  }

  it('кнопки панелей стоят слева, до окна вкладок', () => {
    // Кнопки «Вкладки», «Заметки» и «Свойства» относятся к панелям, которые
    // открываются слева, и стоят там же. Перенос их вправо ломал привычное
    // место и отрывал кнопку от содержимого.
    render(WorkplaceTabs, {
      props: {
        tabs: tabs(1),
        activeTabId: 't1',
        ...handlers(),
        booksOpen: false,
        notesOpen: false,
        propertiesOpen: false,
      },
    });

    const children = rowChildren();
    const panelsIndex = children.findIndex(
      (child) => child.getAttribute('data-testid') === 'workplace-tabs-panels',
    );
    const windowIndex = children.findIndex(
      (child) => child.querySelector('[data-testid="workplace-tabs-window"]') !== null,
    );

    expect(panelsIndex).toBeGreaterThanOrEqual(0);
    expect(windowIndex).toBeGreaterThan(panelsIndex);
    // Кнопки панелей идут первыми в полосе: перед ними нет других блоков.
    expect(panelsIndex).toBe(0);
    // Разделителя между панелями и вкладками нет: групп кнопок справа он не касается.
    expect(
      screen.getByTestId('workplace-tabs').querySelectorAll('[aria-hidden="true"].w-px'),
    ).toHaveLength(0);
  });

  it('кнопки открытия книги стоят справа, перед сосредоточенным чтением', () => {
    render(WorkplaceTabs, {
      props: {
        tabs: tabs(1),
        activeTabId: 't1',
        ...handlers(),
        booksOpen: false,
        notesOpen: false,
        propertiesOpen: false,
        onToggleFocus: vi.fn(),
      },
    });

    const children = rowChildren();
    const panelsIndex = children.findIndex(
      (child) => child.getAttribute('data-testid') === 'workplace-tabs-panels',
    );
    const windowIndex = children.findIndex(
      (child) => child.querySelector('[data-testid="workplace-tabs-window"]') !== null,
    );
    const actionsIndex = children.findIndex(
      (child) => child.getAttribute('data-testid') === 'workplace-tabs-actions',
    );
    const focusIndex = children.findIndex(
      (child) => child.getAttribute('data-testid') === 'workplace-focus-toggle',
    );

    // Слева три кнопки панелей, справа — «добавить», «открыть» и чтение.
    expect(windowIndex).toBeLessThan(actionsIndex);
    expect(actionsIndex).toBeLessThan(focusIndex);

    const labels = Array.from(
      screen.getByTestId('workplace-tabs-actions').querySelectorAll('button'),
    ).map((button) => button.getAttribute('aria-label'));
    expect(labels).toEqual(['Добавить книгу', 'Открыть файл с диска']);
  });

  it('порядок кнопок панелей: вкладки, заметки, свойства', () => {
    render(WorkplaceTabs, {
      props: {
        tabs: tabs(1),
        activeTabId: 't1',
        ...handlers(),
        booksOpen: false,
        notesOpen: false,
        propertiesOpen: false,
        onToggleProperties: vi.fn(),
      },
    });

    const panels = screen.getByTestId('workplace-tabs-panels');
    const labels = Array.from(panels.querySelectorAll('button')).map((button) =>
      button.getAttribute('aria-label'),
    );
    expect(labels).toEqual(['Вкладки', 'Заметки', 'Свойства файла']);
  });
});

/**
 * Включение узкого окна (телефон, планшет): сначала измеряется ширина окна,
 * затем подписка на её изменение.
 *
 * Режим определяется размером окна, поэтому проверка подменяет `matchMedia`, а
 * не передаёт флаг: так тест ловит и сам порог.
 */
function mockNarrowWindow(narrow: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => {
    return {
      matches: narrow && query === NARROW_MAX_WIDTH,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    } as unknown as MediaQueryList;
  });
}

describe('панель вкладок: узкое окно', () => {
  it('у единственной вкладки вместо кнопок стоит меню действий', () => {
    mockNarrowWindow(true);
    mockWidth(400);
    render(WorkplaceTabs, {
      props: {
        tabs: tabs(3),
        activeTabId: 't1',
        booksOpen: false,
        notesOpen: false,
        ...handlers(),
      },
    });

    // Видна одна активная вкладка.
    expect(screen.getAllByTestId('workplace-tab-item')).toHaveLength(1);
    // Отдельных кнопок дублирования и закрытия на узком окне нет.
    expect(screen.queryByTestId('workplace-tab-close')).toBeNull();
    expect(screen.queryByLabelText('Дублировать вкладку')).toBeNull();
    // Вместо них — одно меню действий вкладки.
    expect(screen.getByTestId('workplace-tab-menu')).toBeTruthy();
  });

  it('в меню вкладки входят только дублирование и закрытие', async () => {
    mockNarrowWindow(true);
    mockWidth(400);
    render(WorkplaceTabs, {
      props: {
        tabs: tabs(1),
        activeTabId: 't1',
        booksOpen: false,
        notesOpen: false,
        ...handlers(),
      },
    });

    await fireEvent.click(screen.getByTestId('workplace-tab-menu'));

    // Собственные действия вкладки: дублирование и закрытие.
    expect(await screen.findByText('Дублировать вкладку')).toBeTruthy();
    expect(screen.getByText('Закрыть вкладку')).toBeTruthy();
    // Открытие книги — в меню панелей, а не здесь.
    expect(screen.queryByText('Добавить книгу')).toBeNull();
    expect(screen.queryByText('Открыть файл с диска')).toBeNull();

    // У каждого пункта есть свой значок: он помогает узнать действие, не
    // читая подпись.
    const menu = screen.getByRole('menu');
    for (const label of ['Дублировать вкладку', 'Закрыть вкладку']) {
      const item = within(menu).getByText(label).closest('[role="menuitem"]');
      expect(item, `пункт «${label}» найден`).not.toBeNull();
      // Значок — именно элемент иконки, а не что-то ещё внутри пункта.
      expect(item?.innerHTML, `пункт «${label}»`).toContain('<svg');
    }
  });

  it('значок закрытия окрашен цветом опасности', async () => {
    // Закрытие вкладки необратимо: цвет значка предупреждает о последствии.
    mockNarrowWindow(true);
    mockWidth(400);
    render(WorkplaceTabs, {
      props: {
        tabs: tabs(1),
        activeTabId: 't1',
        booksOpen: false,
        notesOpen: false,
        ...handlers(),
      },
    });

    await fireEvent.click(screen.getByTestId('workplace-tab-menu'));
    const menu = screen.getByRole('menu');
    const closeItem = within(menu).getByText('Закрыть вкладку').closest('[role="menuitem"]');
    const icon = closeItem?.querySelector('svg');
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute('class') ?? '').toContain('text-[var(--destructive)]');
  });

  it('пункт меню выполняет своё действие', async () => {
    // Меню не декорация: пункт закрытия должен закрывать именно эту вкладку.
    mockNarrowWindow(true);
    mockWidth(400);
    const props = handlers();
    render(WorkplaceTabs, {
      props: {
        tabs: tabs(1),
        activeTabId: 't1',
        booksOpen: false,
        notesOpen: false,
        ...props,
      },
    });

    await fireEvent.click(screen.getByTestId('workplace-tab-menu'));
    await fireEvent.click(await screen.findByText('Закрыть вкладку'));

    expect(screen.getByTestId('workplace-tab-close-question')).toBeTruthy();
  });

  it('меню панелей: три панели и открытие книги отдельной группой', async () => {
    mockNarrowWindow(true);
    mockWidth(400);
    render(WorkplaceTabs, {
      props: {
        tabs: tabs(1),
        activeTabId: 't1',
        booksOpen: false,
        notesOpen: false,
        ...handlers(),
      },
    });

    await fireEvent.click(screen.getByTestId('workplace-panel-menu'));

    const menu = screen.getByRole('menu');
    for (const label of [
      'Вкладки',
      'Заметки',
      'Свойства файла',
      'Добавить книгу',
      'Открыть файл с диска',
    ]) {
      const item = within(menu).getByText(label).closest('[role="menuitem"]');
      expect(item, `пункт «${label}» найден`).not.toBeNull();
      expect(item?.innerHTML, `значок пункта «${label}»`).toContain('<svg');
    }

    // Перед открытием книги стоит разделитель: это другая группа действий.
    const dividers = menu.querySelectorAll('[aria-hidden="true"].h-px');
    expect(dividers.length).toBeGreaterThan(0);
  });

  it('меню панелей открывает библиотеку', async () => {
    mockNarrowWindow(true);
    mockWidth(400);
    const props = handlers();
    render(WorkplaceTabs, {
      props: {
        tabs: tabs(1),
        activeTabId: 't1',
        booksOpen: false,
        notesOpen: false,
        ...props,
      },
    });

    await fireEvent.click(screen.getByTestId('workplace-panel-menu'));
    await fireEvent.click(await screen.findByText('Добавить книгу'));

    expect(props.onAdd).toHaveBeenCalled();
  });

  it('на узком окне кнопки открытия книги не дублируются в полосе', () => {
    mockNarrowWindow(true);
    mockWidth(400);
    render(WorkplaceTabs, {
      props: {
        tabs: tabs(1),
        activeTabId: 't1',
        booksOpen: false,
        notesOpen: false,
        ...handlers(),
      },
    });

    // Эти действия живут в меню панелей: в полосе их кнопок нет.
    expect(screen.queryByLabelText('Добавить книгу')).toBeNull();
    expect(screen.queryByLabelText('Открыть файл с диска')).toBeNull();
    expect(screen.getByTestId('workplace-panel-menu')).toBeTruthy();
  });

  it('на широком окне кнопки остаются как были', () => {
    mockNarrowWindow(false);
    mockWidth(1200);
    render(WorkplaceTabs, {
      props: {
        tabs: tabs(2),
        activeTabId: 't1',
        booksOpen: false,
        notesOpen: false,
        ...handlers(),
      },
    });

    expect(screen.getAllByTestId('workplace-tab-close')).toHaveLength(2);
    expect(screen.getByLabelText('Добавить книгу')).toBeTruthy();
    expect(screen.getByLabelText('Открыть файл с диска')).toBeTruthy();
    // Меню панелей — только для узкого окна: на широком кнопки стоят в полосе.
    expect(screen.queryByTestId('workplace-panel-menu')).toBeNull();
    expect(screen.queryByTestId('workplace-tab-menu')).toBeNull();
  });
});

describe('панель вкладок: узкое окно без вкладок', () => {
  it('без вкладок открытие книги доступно из меню панелей', () => {
    // Меню вкладки без вкладки не существует, но меню панелей есть всегда:
    // первую книгу добавляют из него.
    mockNarrowWindow(true);
    mockWidth(400);
    render(WorkplaceTabs, {
      props: {
        tabs: [],
        activeTabId: null,
        booksOpen: false,
        notesOpen: false,
        ...handlers(),
      },
    });

    expect(screen.getByTestId('workplace-panel-menu')).toBeTruthy();
    // Меню самой вкладки действительно нет — вкладок ещё ноль.
    expect(screen.queryByTestId('workplace-tab-menu')).toBeNull();
  });
});

describe('панель вкладок: вид меню и высота вкладки', () => {
  it('кнопка меню без своей плашки: проявляется только откликом', () => {
    // На цветной вкладке плашка кнопки спорила с её цветом: значок должен
    // наследовать цвет текста вкладки, а фон появляться только при наведении.
    mockNarrowWindow(true);
    mockWidth(400);
    render(WorkplaceTabs, {
      props: {
        tabs: tabs(1),
        activeTabId: 't1',
        booksOpen: false,
        notesOpen: false,
        ...handlers(),
      },
    });

    const menu = screen.getByTestId('workplace-tab-menu');
    expect(menu).toBeTruthy();
    expect(menu.className).toContain('bg-transparent');
  });

  it('на узком окне нет разделителя перед вкладкой', () => {
    // Делить нечего: кнопок открытия книги в полосе нет, их действия — в меню.
    mockNarrowWindow(true);
    mockWidth(400);
    const { container } = render(WorkplaceTabs, {
      props: {
        tabs: tabs(1),
        activeTabId: 't1',
        booksOpen: false,
        notesOpen: false,
        ...handlers(),
      },
    });

    const dividers = container.querySelectorAll('[aria-hidden="true"].w-px');
    expect(dividers).toHaveLength(0);
  });

  it('на широком окне разделителя между группами кнопок нет', () => {
    // Кнопки панелей слева и действия книги справа разделены самим окном
    // вкладок: черта между ними только дробила полосу.
    mockNarrowWindow(false);
    mockWidth(1200);
    const { container } = render(WorkplaceTabs, {
      props: {
        tabs: tabs(1),
        activeTabId: 't1',
        booksOpen: false,
        notesOpen: false,
        ...handlers(),
      },
    });

    expect(container.querySelectorAll('[aria-hidden="true"].w-px')).toHaveLength(0);
  });
});
