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

    it('сообщает о выборе цвета', async () => {
        const onChange = vi.fn();
        render(NoteToolbar, { props: props({ onChange }) });

        await fireEvent.click(screen.getByRole('button', { name: 'фиолетовый' }));
        expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_NOTE_TOOL, color: 'purple' });
    });

    it('выстраивает элементы слева одной цепочкой: цвет, типы, вид фигуры', async () => {
        render(NoteToolbar, { props: props({ tool: { ...DEFAULT_NOTE_TOOL, type: 'shape' } }) });

        const toolbar = screen.getByTestId('note-toolbar');
        const color = screen.getByTestId('note-tool-color-picker');
        const quote = screen.getByRole('button', { name: 'Цитата' });
        const shape = screen.getByTestId('note-tool-shape');

        // Порядок в DOM: палитра → типы → выпадающий выбор фигуры.
        const order = Array.from(toolbar.querySelectorAll('*'));
        expect(order.indexOf(color)).toBeLessThan(order.indexOf(quote));
        expect(order.indexOf(quote)).toBeLessThan(order.indexOf(shape));
        // Выбор фигуры идёт сразу за группами типов, не уезжая к правому краю.
        const classes = shape.className;
        expect(classes.includes('ml-auto')).toBe(false);
    });

    it('в текучем формате показывает только цитату и не показывает вид фигуры', () => {
        render(NoteToolbar, {
            props: props({
                tool: { ...DEFAULT_NOTE_TOOL, type: 'quote' },
                allowedTypes: ['quote'],
            }),
        });

        expect(screen.getByRole('button', { name: 'Цитата' })).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Текст' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Фигура' })).toBeNull();
        expect(screen.queryByTestId('note-tool-shape')).toBeNull();
    });

    it('выносит управление чтением в правую группу после инструментов заметок', () => {
        render(NoteToolbar, { props: props() });

        const toolbar = screen.getByTestId('note-toolbar');
        const group = screen.getByTestId('note-toolbar-reading');
        const quote = screen.getByRole('button', { name: 'Цитата' });

        // Группа чтения идёт после инструментов заметок и прижата вправо.
        const order = Array.from(toolbar.querySelectorAll('*'));
        expect(order.indexOf(quote)).toBeLessThan(order.indexOf(group));
        expect(group.className).toContain('ml-auto');
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
