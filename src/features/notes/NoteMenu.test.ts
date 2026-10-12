import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import NoteMenu from './NoteMenu.svelte';

/** Общие реквизиты меню: заметка под точкой (100, 100). */
const AREA = { width: 800, height: 600 };
const AT = { left: 100, top: 100, bottom: 120 };

/** Порядок кнопок меню по их доступным именам. */
function buttonOrder(): string[] {
    return Array.from(screen.getByTestId('note-menu').querySelectorAll('button')).map(
        (button) => button.getAttribute('aria-label') ?? '',
    );
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('контекстное меню заметки', () => {
    it('у цитаты предлагает копирование и правку выделения', async () => {
        const onResize = vi.fn();
        const onClose = vi.fn();
        render(NoteMenu, {
            props: {
                type: 'quote',
                quote: 'Первый абзац книги.',
                at: AT,
                area: AREA,
                onMove: vi.fn(),
                onResize,
                onClose,
            },
        });

        expect(screen.getByTestId('note-menu')).toBeTruthy();
        await fireEvent.click(screen.getByRole('button', { name: 'Изменить выделение' }));
        expect(onResize).toHaveBeenCalled();

        // Порядок цитаты: копировать → изменить выделение → закрыть.
        expect(buttonOrder()).toEqual(['Копировать текст', 'Изменить выделение', 'Закрыть']);
        expect(onClose).not.toHaveBeenCalled();
    });

    it('копирует текст цитаты в буфер обмена и закрывает меню', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        vi.stubGlobal('navigator', { clipboard: { writeText } });
        const onClose = vi.fn();

        render(NoteMenu, {
            props: {
                type: 'quote',
                quote: '  Первый абзац книги.  ',
                at: AT,
                area: AREA,
                onMove: vi.fn(),
                onResize: vi.fn(),
                onClose,
            },
        });

        await fireEvent.click(screen.getByRole('button', { name: 'Копировать текст' }));

        // Копируется текст без внешних пробелов, меню закрывается.
        expect(writeText).toHaveBeenCalledWith('Первый абзац книги.');
        expect(onClose).toHaveBeenCalled();
    });

    it('не копирует пустой текст цитаты, но закрывает меню', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        vi.stubGlobal('navigator', { clipboard: { writeText } });
        const onClose = vi.fn();

        render(NoteMenu, {
            props: {
                type: 'quote',
                quote: '   ',
                at: AT,
                area: AREA,
                onMove: vi.fn(),
                onResize: vi.fn(),
                onClose,
            },
        });

        await fireEvent.click(screen.getByRole('button', { name: 'Копировать текст' }));

        expect(writeText).not.toHaveBeenCalled();
        expect(onClose).toHaveBeenCalled();
    });

    it('у карточки предлагает правку текста и перемещение', async () => {
        const onMove = vi.fn();
        const onEditText = vi.fn();
        render(NoteMenu, {
            props: {
                type: 'text',
                at: AT,
                area: AREA,
                onMove,
                onResize: vi.fn(),
                onEditText,
                onClose: vi.fn(),
            },
        });

        expect(screen.queryByRole('button', { name: 'Изменить выделение' })).toBeNull();
        await fireEvent.click(screen.getByRole('button', { name: 'Переместить' }));
        expect(onMove).toHaveBeenCalled();

        await fireEvent.click(screen.getByRole('button', { name: 'Изменить текст' }));
        expect(onEditText).toHaveBeenCalled();

        // Порядок карточки: изменить текст → переместить → закрыть.
        expect(buttonOrder()).toEqual(['Изменить текст', 'Переместить', 'Закрыть']);
    });

    it('у фигуры нет правки текста, только перемещение', () => {
        render(NoteMenu, {
            props: {
                type: 'shape',
                at: AT,
                area: AREA,
                onMove: vi.fn(),
                onResize: vi.fn(),
                onEditText: vi.fn(),
                onClose: vi.fn(),
            },
        });

        expect(screen.getByRole('button', { name: 'Переместить' })).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Изменить текст' })).toBeNull();
        // Порядок фигуры: переместить → закрыть.
        expect(buttonOrder()).toEqual(['Переместить', 'Закрыть']);
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
