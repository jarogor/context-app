import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import NoteMenu from './NoteMenu.svelte';

/** Общие реквизиты меню: заметка под точкой (100, 100). */
const AREA = { width: 800, height: 600 };
const AT = { left: 100, top: 100, bottom: 120 };

describe('контекстное меню заметки', () => {
    it('у цитаты предлагает правку выделения', async () => {
        const onResize = vi.fn();
        render(NoteMenu, {
            props: { type: 'quote', at: AT, area: AREA, onMove: vi.fn(), onResize, onClose: vi.fn() },
        });

        expect(screen.getByTestId('note-menu')).toBeTruthy();
        await fireEvent.click(screen.getByRole('button', { name: 'Изменить выделение' }));
        expect(onResize).toHaveBeenCalled();
    });

    it('у карточки и фигуры предлагает перемещение', async () => {
        const onMove = vi.fn();
        render(NoteMenu, {
            props: {
                type: 'text',
                at: AT,
                area: AREA,
                onMove,
                onResize: vi.fn(),
                onClose: vi.fn(),
            },
        });

        expect(screen.queryByRole('button', { name: 'Изменить выделение' })).toBeNull();
        await fireEvent.click(screen.getByRole('button', { name: 'Переместить' }));
        expect(onMove).toHaveBeenCalled();
    });

    it('закрывается кнопкой закрытия', async () => {
        const onClose = vi.fn();
        render(NoteMenu, {
            props: { type: 'quote', at: AT, area: AREA, onMove: vi.fn(), onResize: vi.fn(), onClose },
        });

        await fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
        expect(onClose).toHaveBeenCalled();
    });

    it('держится внутри области чтения у нижней кромки', () => {
        render(NoteMenu, {
            props: {
                type: 'quote',
                at: { left: 780, top: 580, bottom: 595 },
                area: AREA,
                onMove: vi.fn(),
                onResize: vi.fn(),
                onClose: vi.fn(),
            },
        });

        const style = screen.getByTestId('note-menu').getAttribute('style') ?? '';
        // Меню не выходит за правый и нижний края: оно поднимается над заметкой.
        expect(style).toContain('top: 534px');
        expect(style).not.toContain('top: 601px');
    });
});
