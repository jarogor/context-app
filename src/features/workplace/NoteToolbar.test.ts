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
        onChangeZoom: vi.fn(),
        onChangeReaderTheme: vi.fn(),
        notesMode: true,
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

    it('сообщает о выборе типа', async () => {
        const onChange = vi.fn();
        render(NoteToolbar, { props: props({ onChange }) });

        await fireEvent.click(screen.getByRole('button', { name: 'Текст' }));
        expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_NOTE_TOOL, type: 'text' });
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
        const group = screen.getByTestId('note-toolbar-reading');
        const footer = screen.getByTestId('reader-footer');
        const quote = screen.getByRole('button', { name: 'Цитата' });

        // Группа чтения идёт после инструментов заметок и прижата вправо.
        const order = Array.from(toolbar.querySelectorAll('*'));
        expect(order.indexOf(quote)).toBeLessThan(order.indexOf(group));
        expect(footer.className).toContain('ml-auto');
    });
});

describe('панель чтения: масштаб', () => {
    it('показывает текущий масштаб и сообщает об изменении', async () => {
        const onChangeZoom = vi.fn();
        render(NoteToolbar, { props: props({ zoom: 110, onChangeZoom }) });

        expect(screen.getByTestId('reader-zoom').textContent).toBe('110%');

        await fireEvent.click(screen.getByRole('button', { name: 'Увеличить масштаб' }));
        expect(onChangeZoom).toHaveBeenCalledWith(10);

        await fireEvent.click(screen.getByRole('button', { name: 'Уменьшить масштаб' }));
        expect(onChangeZoom).toHaveBeenCalledWith(-10);
    });

    it('блокирует кнопки на границах масштаба', () => {
        const { unmount } = render(NoteToolbar, {
            props: props({ zoom: 60, minZoom: 60, maxZoom: 220 }),
        });
        expect(
            (screen.getByRole('button', { name: 'Уменьшить масштаб' }) as HTMLButtonElement)
                .disabled,
        ).toBe(true);
        unmount();

        render(NoteToolbar, { props: props({ zoom: 220, minZoom: 60, maxZoom: 220 }) });
        expect(
            (screen.getByRole('button', { name: 'Увеличить масштаб' }) as HTMLButtonElement)
                .disabled,
        ).toBe(true);
    });

    it('скрывает масштаб, когда формат его не поддерживает', () => {
        render(NoteToolbar, { props: props({ showZoom: false }) });

        expect(screen.queryByTestId('reader-zoom')).toBeNull();
        expect(screen.queryByRole('button', { name: 'Увеличить масштаб' })).toBeNull();
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
