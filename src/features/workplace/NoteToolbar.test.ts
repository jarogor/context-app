import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import NoteToolbar from './NoteToolbar.svelte';
import { DEFAULT_NOTE_TOOL } from '../notes/notes';

/** Обязательные пропсы панели с заглушками управления чтением. */
function props(overrides: Record<string, unknown> = {}) {
  return {
    tool: DEFAULT_NOTE_TOOL,
    onChange: vi.fn(),
    zoom: 100,
    minZoom: 60,
    maxZoom: 220,
    readerTheme: 'light' as const,
    readerFont: 'serif' as const,
    onChangeZoom: vi.fn(),
    onChangeReaderTheme: vi.fn(),
    onChangeReaderFont: vi.fn(),
    notesMode: true,
    flowing: true,
    progress: 0,
    ...overrides,
  };
}

describe('панель инструментов заметок', () => {
  it('показывает три типа заметок', () => {
    render(NoteToolbar, { props: props() });

    expect(screen.getByRole('button', { name: 'Цитата' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Текст' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Фигура' })).toBeTruthy();
  });

  it('называет тип во всплывающей подсказке кнопки', () => {
    render(NoteToolbar, { props: props() });

    // Подсказка — короткое название типа: на узком окне сама кнопка
    // показывает только иконку, и подсказка объясняет, что это за тип.
    for (const label of ['Цитата', 'Текст', 'Фигура']) {
      expect(screen.getByRole('button', { name: label }).getAttribute('title')).toBe(label);
    }
  });

  it('не показывает служебный надзаголовок «Заметка»', () => {
    render(NoteToolbar, { props: props() });

    expect(screen.queryByText('Заметка')).toBeNull();
  });

  it('сообщает о выборе типа', async () => {
    const onChange = vi.fn();
    render(NoteToolbar, { props: props({ onChange }) });

    await fireEvent.click(screen.getByRole('button', { name: 'Текст' }));
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_NOTE_TOOL, type: 'text' });
  });

  it('открывает поиск по книге из панели чтения', async () => {
    const onToggleSearch = vi.fn();
    const { rerender } = render(NoteToolbar, {
      props: props({ onToggleSearch, searchOpen: false }),
    });

    const button = screen.getByRole('button', { name: 'Поиск по книге' });
    expect(button.getAttribute('aria-pressed')).toBe('false');
    await fireEvent.click(button);
    expect(onToggleSearch).toHaveBeenCalledTimes(1);

    await rerender({ onToggleSearch, searchOpen: true });
    expect(
      screen.getByRole('button', { name: 'Поиск по книге' }).getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('показывает вид фигуры только для инструмента фигуры', async () => {
    const { rerender } = render(NoteToolbar, { props: props() });
    expect(screen.queryByTestId('note-tool-shape')).toBeNull();

    await rerender(props({ tool: { ...DEFAULT_NOTE_TOOL, type: 'shape' } }));
    expect(screen.getByTestId('note-tool-shape')).toBeTruthy();
  });

  it('сообщает о выборе цвета фигуры', async () => {
    const onChange = vi.fn();
    render(NoteToolbar, {
      props: props({ onChange, tool: { ...DEFAULT_NOTE_TOOL, type: 'shape' } }),
    });

    await fireEvent.click(screen.getByRole('button', { name: 'фиолетовый' }));
    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_NOTE_TOOL,
      type: 'shape',
      color: 'purple',
    });
  });

  it('показывает палитру только для фигуры', async () => {
    const { rerender } = render(NoteToolbar, {
      props: props({ tool: { ...DEFAULT_NOTE_TOOL, type: 'quote' } }),
    });
    expect(screen.queryByTestId('note-tool-color-picker')).toBeNull();

    await rerender(props({ tool: { ...DEFAULT_NOTE_TOOL, type: 'text' } }));
    expect(screen.queryByTestId('note-tool-color-picker')).toBeNull();

    await rerender(props({ tool: { ...DEFAULT_NOTE_TOOL, type: 'shape' } }));
    expect(screen.getByTestId('note-tool-color-picker')).toBeTruthy();
  });

  it('держит кнопки типов, вид фигуры и палитру одного компактного размера', () => {
    render(NoteToolbar, {
      props: props({ tool: { ...DEFAULT_NOTE_TOOL, type: 'shape' } }),
    });

    // Компактный размер дизайн-системы (`h-8`) у кнопок и выпадающего списка,
    // чтобы ряд не выглядел разного масштаба.
    const quote = screen.getByRole('button', { name: 'Цитата' });
    expect(quote.className).toContain('h-8');

    expect(screen.getByRole('button', { name: 'Вид фигуры' }).className).toContain('h-8');

    const picker = screen.getByTestId('note-tool-color-picker');
    expect(picker.className).toContain('h-8');
  });

  it('выстраивает элементы слева одной цепочкой: типы, вид фигуры, цвет', async () => {
    render(NoteToolbar, { props: props({ tool: { ...DEFAULT_NOTE_TOOL, type: 'shape' } }) });

    const toolbar = screen.getByTestId('note-toolbar');
    const color = screen.getByTestId('note-tool-color-picker');
    const quote = screen.getByRole('button', { name: 'Цитата' });
    const shape = screen.getByTestId('note-tool-shape');

    // Порядок в DOM: типы → выпадающий выбор фигуры → палитра цветов.
    const order = Array.from(toolbar.querySelectorAll('*'));
    expect(order.indexOf(quote)).toBeLessThan(order.indexOf(shape));
    expect(order.indexOf(shape)).toBeLessThan(order.indexOf(color));
    // Выбор фигуры и палитра идут сразу за группами типов, не уезжая к правому краю.
    const classes = shape.className;
    expect(classes.includes('ml-auto')).toBe(false);
  });

  it('в текучем формате не показывает типы и палитру, но оставляет управление чтением', () => {
    render(NoteToolbar, {
      props: props({
        tool: { ...DEFAULT_NOTE_TOOL, type: 'quote' },
        allowedTypes: ['quote'],
        notesMode: true,
      }),
    });

    // Единственный доступный тип не показывается кнопкой, а палитра ему не нужна.
    expect(screen.queryByRole('button', { name: 'Цитата' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Текст' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Фигура' })).toBeNull();
    expect(screen.queryByTestId('note-tool-color-picker')).toBeNull();
    expect(screen.queryByTestId('note-tool-shape')).toBeNull();
    // Панель остаётся ради масштаба и переключателя темы.
    expect(screen.getByTestId('reader-zoom')).toBeTruthy();
    expect(screen.getByTestId('reader-theme-toggle')).toBeTruthy();
  });

  it('выносит управление чтением в правую группу после инструментов заметок', () => {
    render(NoteToolbar, { props: props() });

    const toolbar = screen.getByTestId('note-toolbar');
    const footer = screen.getByTestId('reader-footer');
    const quote = screen.getByRole('button', { name: 'Цитата' });
    const zoom = screen.getByTestId('reader-zoom-group');

    // Группа чтения идёт после инструментов заметок и прижата вправо.
    const order = Array.from(toolbar.querySelectorAll('*'));
    expect(order.indexOf(quote)).toBeLessThan(order.indexOf(zoom));
    expect(footer.className).toContain('ml-auto');
  });

  it('ставит цвет сразу за списком вида фигуры, в той же строке', () => {
    render(NoteToolbar, {
      props: props({
        tool: { ...DEFAULT_NOTE_TOOL, type: 'shape' },
        workplace: true,
        workplacePages: true,
        workplacePage: 3,
        workplacePageCount: 12,
      }),
    });

    const toolbar = screen.getByTestId('note-toolbar');
    const order = Array.from(toolbar.querySelectorAll('*'));
    const shape = screen.getByTestId('note-tool-shape');
    const color = screen.getByTestId('note-tool-color-picker');
    const theme = screen.getByTestId('reader-theme-toggle');

    // Цвет идёт сразу за списком вида фигуры и до разрыва строки.
    expect(order.indexOf(shape)).toBeLessThan(order.indexOf(color));
    expect(color.className).toContain('max-large-tablet:order-4');
    // В управление чтением цвет не попадает: его строка начинается с темы.
    expect(theme.className).toContain('max-large-tablet:order-6');
    expect(Number(theme.className.match(/max-large-tablet:order-(\d+)/)![1])).toBeGreaterThan(
      Number(color.className.match(/max-large-tablet:order-(\d+)/)![1]),
    );
  });

  it('на узком окне начинает нижнюю строку с левого края, а не с правого', () => {
    render(NoteToolbar, { props: props() });

    // Выталкивание вправо — только на широком окне (`large-tablet:ml-auto`): на узком
    // строка идёт слева, иначе строки «смотрят» в разные стороны.
    const footer = screen.getByTestId('reader-footer');
    expect(footer.className).toContain('large-tablet:ml-auto');
    expect(footer.className).not.toContain(' max-large-tablet:justify-end');
    expect(footer.className).toContain('max-large-tablet:contents');
  });

  it('держит выбор вида фигуры компактным: длинное название не растягивает список', () => {
    render(NoteToolbar, {
      props: props({ tool: { ...DEFAULT_NOTE_TOOL, type: 'shape' } }),
    });

    // «Рамка» вместо «Прямоугольника» и узкий триггер: список вида фигуры
    // равен ширине самого длинного варианта и не вытесняет соседей.
    expect(screen.getByRole('button', { name: 'Вид фигуры' }).className).toContain('w-[6.25rem]');
    const shape = screen.getByTestId('note-tool-shape');
    expect(shape).toBeTruthy();
  });
});

describe('панель чтения: масштаб', () => {
  it('показывает текущий масштаб и сообщает о направлении изменения', async () => {
    const onChangeZoom = vi.fn();
    render(NoteToolbar, { props: props({ zoom: 110, onChangeZoom }) });

    expect(screen.getByTestId('reader-zoom').textContent).toBe('110%');

    // Кнопки передают направление шага (`1`/`-1`), а не величину: шкала
    // уровней живёт в читалке, панель лишь просит шагнуть в сторону.
    await fireEvent.click(screen.getByRole('button', { name: 'Увеличить масштаб' }));
    expect(onChangeZoom).toHaveBeenCalledWith(1);

    await fireEvent.click(screen.getByRole('button', { name: 'Уменьшить масштаб' }));
    expect(onChangeZoom).toHaveBeenCalledWith(-1);
  });

  it('блокирует кнопки на границах масштаба', () => {
    const { unmount } = render(NoteToolbar, {
      props: props({ zoom: 60, minZoom: 60, maxZoom: 220 }),
    });
    expect(
      (screen.getByRole('button', { name: 'Уменьшить масштаб' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    unmount();

    render(NoteToolbar, { props: props({ zoom: 220, minZoom: 60, maxZoom: 220 }) });
    expect(
      (screen.getByRole('button', { name: 'Увеличить масштаб' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('скрывает масштаб, когда формат его не поддерживает', () => {
    render(NoteToolbar, { props: props({ showZoom: false }) });

    expect(screen.queryByTestId('reader-zoom')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Увеличить масштаб' })).toBeNull();
  });

  it('держит ширину масштаба под четыре разряда: «1000%» не липнет к краям', () => {
    render(NoteToolbar, { props: props({ zoom: 1000, maxZoom: 1000 }) });

    // На узком окне ширина поля та же, что на широком: «1000%» в 12 px
    // требует ~50 px, а поле — 52 px, плюс центрирование внутри.
    const zoom = screen.getByTestId('reader-zoom');
    expect(zoom.className).toContain('w-[3.25rem]');
    expect(zoom.className).toContain('text-center');
    expect(zoom.textContent).toBe('1000%');
  });

  it('держит ширину масштаба и прогресса фиксированной независимо от числа цифр', () => {
    const { unmount } = render(NoteToolbar, { props: props({ zoom: 60, progress: 5 }) });
    expect(screen.getByTestId('reader-progress').className).toContain('w-[2.75rem]');
    expect(screen.getByTestId('reader-zoom').className).toContain('w-[3.25rem]');
    expect(screen.getByTestId('reader-zoom-group')).toBeTruthy();
    unmount();

    render(NoteToolbar, { props: props({ zoom: 220, progress: 100 }) });
    expect(screen.getByTestId('reader-progress').className).toContain('w-[2.75rem]');
    expect(screen.getByTestId('reader-zoom').className).toContain('w-[3.25rem]');
  });

  it('не показывает прогресс у постраничной книги', () => {
    render(NoteToolbar, {
      props: props({
        workplace: true,
        workplacePages: true,
        workplacePage: 3,
        workplacePageCount: 1200,
        zoom: 100,
      }),
    });

    // Постраничная навигация есть, а прогресса чтения нет.
    expect(screen.getByTestId('reader-pages')).toBeTruthy();
    expect(screen.queryByTestId('reader-progress')).toBeNull();
  });

  it('держит поле страницы фиксированной ширины на любой разрядности', () => {
    const { unmount } = render(NoteToolbar, {
      props: props({
        workplace: true,
        workplacePages: true,
        workplacePage: 3,
        workplacePageCount: 9,
      }),
    });
    const field = screen.getByLabelText('Текущая страница');
    expect(field.className).toContain('w-[3.5rem]');
    expect(field.className).toContain('shrink-0');
    unmount();

    render(NoteToolbar, {
      props: props({
        workplace: true,
        workplacePages: true,
        workplacePage: 3,
        workplacePageCount: 1200,
      }),
    });
    // Та же ширина: смена «9 → 1200» не сдвигает ни кнопки, ни соседей.
    const wide = screen.getByLabelText('Текущая страница');
    expect(wide.className).toContain('w-[3.5rem]');
    expect(screen.getByTestId('reader-pages').className).toContain('shrink-0');
  });

  it('выравнивает номер страницы вправо: он образует отношение «n / m»', () => {
    render(NoteToolbar, {
      props: props({
        workplace: true,
        workplacePages: true,
        workplacePage: 3,
        workplacePageCount: 1200,
      }),
    });

    // Номер в поле прижат вправо — к косой черте счётчика, а не по центру.
    expect(screen.getByLabelText('Текущая страница').className).toContain('text-right');
    expect(screen.getByLabelText('Текущая страница').className).not.toContain('text-center');
  });

  it('оставляет запас у счётчика страниц справа от последней цифры', () => {
    render(NoteToolbar, {
      props: props({
        workplace: true,
        workplacePages: true,
        workplacePage: 1,
        workplacePageCount: 1200,
      }),
    });

    // Счётчик — естественной ширины с правым отступом: на четырёх- и
    // пятизначном числе текст не упирается в край группы.
    const count = screen.getByTestId('reader-page-count');
    expect(count.textContent).toBe('/ 1200');
    expect(count.className).toContain('pr-2');
    expect(count.className).toContain('shrink-0');
  });
});

describe('панель чтения: единый вид групп управления', () => {
  it('обрамляет навигацию и масштаб так же, как блок типов заметок', () => {
    render(NoteToolbar, {
      props: props({
        tool: { ...DEFAULT_NOTE_TOOL, type: 'shape' },
        workplace: true,
        workplacePages: true,
        workplacePage: 3,
        workplacePageCount: 1200,
      }),
    });

    // Все три области — с фоном шапки и внутренним отступом блока типов,
    // без собственной обводки: она выбивалась из системы цветов.
    const types = screen.getByRole('group', { name: 'Тип заметки' });
    const pages = screen.getByTestId('reader-pages');
    const zoom = screen.getByTestId('reader-zoom-group');
    for (const group of [types, pages, zoom]) {
      expect(group.className).toContain('bg-[var(--panel)]');
      expect(group.className).toContain('p-0.5');
      expect(group.className).not.toContain('border-[var(--border)]');
    }
  });

  it('держит внутренние элементы групп одной высоты', () => {
    render(NoteToolbar, {
      props: props({
        workplace: true,
        workplacePages: true,
        workplacePage: 3,
        workplacePageCount: 1200,
      }),
    });

    // Высота элементов внутри групп равна `h-8` (`size-8`): области не
    // расходятся по высоте из-за разного размера кнопок.
    expect(screen.getByRole('button', { name: 'Следующая страница' }).className).toContain('h-8');
    expect(screen.getByRole('button', { name: 'Предыдущая страница' }).className).toContain('h-8');
    expect(screen.getByLabelText('Текущая страница').className).toContain('h-8');
    expect(screen.getByRole('button', { name: 'Увеличить масштаб' }).className).toContain('size-8');
  });

  it('держит одинаковый кегль текста во всех группах', () => {
    render(NoteToolbar, {
      props: props({
        tool: { ...DEFAULT_NOTE_TOOL, type: 'shape' },
        workplace: true,
        workplacePages: true,
        workplacePage: 3,
        workplacePageCount: 1200,
      }),
    });

    // Панель задаёт кегль один раз (`text-sm`), а не разными ролями у групп.
    expect(screen.getByTestId('note-toolbar').className).toContain('text-sm');
    expect(screen.getByLabelText('Текущая страница').className).toContain('text-sm');
    expect(screen.getByTestId('reader-page-count').className).toContain('text-sm');
    expect(screen.getByTestId('reader-zoom').className).toContain('text-sm');
    expect(screen.getByRole('button', { name: 'Вид фигуры' }).className).toContain('text-sm');
  });

  it('показывает поле страницы без обводки, но с прежним цветом', () => {
    render(NoteToolbar, {
      props: props({
        workplace: true,
        workplacePages: true,
        workplacePage: 3,
        workplacePageCount: 1200,
      }),
    });

    // Поле номера — с прежним цветом (`bg-card`) и без обводки (`border-0`):
    // рамка делала поле похожим на кнопку.
    const field = screen.getByLabelText('Текущая страница');
    expect(field.className).toContain('bg-card');
    expect(field.className).toContain('border-0');
  });

  it('держит группы вплотную: промежуток панели небольшой', () => {
    render(NoteToolbar, {
      props: props({
        tool: { ...DEFAULT_NOTE_TOOL, type: 'shape' },
        workplace: true,
        workplacePages: true,
        workplacePage: 3,
        workplacePageCount: 1200,
      }),
    });

    // Промежуток панели и её правой группы одинаков и невелик (`gap-1.5`
    // = 6px): группы стоят тесной связкой, а не вразрядку.
    expect(screen.getByTestId('note-toolbar').className).toContain('gap-1.5');
    expect(screen.getByTestId('reader-footer').className).toContain('gap-1.5');
  });
});

describe('панель чтения: переключатель темы', () => {
  it('называет тему, на которую переключает кнопка', () => {
    const { rerender } = render(NoteToolbar, { props: props({ readerTheme: 'light' }) });
    // В светлой теме кнопка переключает на тёмную — так и называется.
    expect(screen.getByRole('button', { name: 'Тёмная тема области чтения' })).toBeTruthy();

    rerender(props({ readerTheme: 'dark' }));
    expect(screen.getByRole('button', { name: 'Светлая тема области чтения' })).toBeTruthy();
  });

  it('переключает светлую тему на тёмную', async () => {
    const onChangeReaderTheme = vi.fn();
    render(NoteToolbar, { props: props({ readerTheme: 'light', onChangeReaderTheme }) });

    await fireEvent.click(screen.getByRole('button', { name: 'Тёмная тема области чтения' }));
    expect(onChangeReaderTheme).toHaveBeenCalledWith('dark');
  });

  it('переключает тёмную тему на светлую', async () => {
    const onChangeReaderTheme = vi.fn();
    render(NoteToolbar, { props: props({ readerTheme: 'dark', onChangeReaderTheme }) });

    await fireEvent.click(screen.getByRole('button', { name: 'Светлая тема области чтения' }));
    expect(onChangeReaderTheme).toHaveBeenCalledWith('light');
  });
});

describe('панель чтения: переключатель шрифта книги', () => {
  it('называет шрифт, на который переключает кнопка', () => {
    const { rerender } = render(NoteToolbar, { props: props({ readerFont: 'serif' }) });
    // С засечками кнопка переключает на шрифт без засечек — так и называется.
    expect(screen.getByRole('button', { name: 'Шрифт без засечек' })).toBeTruthy();

    rerender(props({ readerFont: 'sans' }));
    expect(screen.getByRole('button', { name: 'Шрифт с засечками' })).toBeTruthy();
  });

  it('переключает шрифт с засечками на шрифт без засечек', async () => {
    const onChangeReaderFont = vi.fn();
    render(NoteToolbar, { props: props({ readerFont: 'serif', onChangeReaderFont }) });

    await fireEvent.click(screen.getByRole('button', { name: 'Шрифт без засечек' }));
    expect(onChangeReaderFont).toHaveBeenCalledWith('sans');
  });

  it('переключает шрифт без засечек на шрифт с засечками', async () => {
    const onChangeReaderFont = vi.fn();
    render(NoteToolbar, { props: props({ readerFont: 'sans', onChangeReaderFont }) });

    await fireEvent.click(screen.getByRole('button', { name: 'Шрифт с засечками' }));
    expect(onChangeReaderFont).toHaveBeenCalledWith('serif');
  });

  it('без обработчика кнопки шрифта нет', () => {
    render(NoteToolbar, { props: props({ onChangeReaderFont: undefined }) });

    expect(screen.queryByTestId('reader-font-toggle')).toBeNull();
  });

  it('у постраничных форматов кнопки шрифта нет', () => {
    // У PDF и DjVu текст — часть растра: выбор гарнитуры ничего не меняет.
    render(NoteToolbar, { props: props({ flowing: false }) });

    expect(screen.queryByTestId('reader-font-toggle')).toBeNull();
  });

  it('кнопка шрифта стоит в собственном блоке с фоном, как другие группы', () => {
    render(NoteToolbar, { props: props() });

    const toggle = screen.getByTestId('reader-font-toggle');
    // Единый вид управляющих групп панели: блок с фоном и скруглением,
    // внутри — кнопка. Блок готов принять и другие действия оформления.
    expect(toggle.className).toContain('bg-[var(--panel)]');
    expect(toggle.className).toContain('rounded-[var(--radius)]');
    expect(toggle.getAttribute('role')).toBe('group');
    expect(toggle.getAttribute('aria-label')).toBe('Шрифт книги');
    expect(toggle.querySelector('button')).toBeTruthy();

    // Так же оформлены типы заметок и масштаб.
    const types = screen.getByRole('group', { name: 'Тип заметки' });
    expect(types.className).toContain('bg-[var(--panel)]');
  });

  it('кнопка шрифта стоит слева, в группе инструментов', () => {
    render(NoteToolbar, { props: props() });

    const toolbar = screen.getByTestId('note-toolbar');
    const toggle = screen.getByTestId('reader-font-toggle');
    const footer = screen.getByTestId('reader-footer');
    // Кнопка в левой части панели, до правой группы управления чтением.
    expect(toolbar.contains(toggle)).toBe(true);
    expect(footer.contains(toggle)).toBe(false);
  });
});
