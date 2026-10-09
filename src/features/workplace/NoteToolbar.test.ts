import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import NoteToolbar from './NoteToolbar.svelte';
import { DEFAULT_NOTE_TOOL } from '../notes/notes';

describe('панель инструментов заметок', () => {
    it('показывает три типа заметок', () => {
        render(NoteToolbar, { props: { tool: DEFAULT_NOTE_TOOL, onChange: vi.fn() } });

        expect(screen.getByRole('button', { name: 'Цитата' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Текст' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Фигура' })).toBeTruthy();
    });

    it('сообщает о выборе типа', async () => {
        const onChange = vi.fn();
        render(NoteToolbar, { props: { tool: DEFAULT_NOTE_TOOL, onChange } });

        await fireEvent.click(screen.getByRole('button', { name: 'Текст' }));
        expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_NOTE_TOOL, type: 'text' });
    });

    it('показывает вид фигуры только для инструмента фигуры', async () => {
        const { rerender } = render(NoteToolbar, {
            props: { tool: DEFAULT_NOTE_TOOL, onChange: vi.fn() },
        });
        expect(screen.queryByTestId('note-tool-shape')).toBeNull();

        await rerender({ tool: { ...DEFAULT_NOTE_TOOL, type: 'shape' }, onChange: vi.fn() });
        expect(screen.getByTestId('note-tool-shape')).toBeTruthy();
    });

    it('сообщает о выборе цвета', async () => {
        const onChange = vi.fn();
        render(NoteToolbar, { props: { tool: DEFAULT_NOTE_TOOL, onChange } });

        await fireEvent.click(screen.getByRole('button', { name: 'фиолетовый' }));
        expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_NOTE_TOOL, color: 'purple' });
    });

    it('выстраивает элементы слева одной цепочкой: цвет, типы, вид фигуры', async () => {
        render(NoteToolbar, {
            props: { tool: { ...DEFAULT_NOTE_TOOL, type: 'shape' }, onChange: vi.fn() },
        });

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
            props: {
                tool: { ...DEFAULT_NOTE_TOOL, type: 'quote' },
                allowedTypes: ['quote'],
                onChange: vi.fn(),
            },
        });

        expect(screen.getByRole('button', { name: 'Цитата' })).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Текст' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Фигура' })).toBeNull();
        expect(screen.queryByTestId('note-tool-shape')).toBeNull();
    });
});
