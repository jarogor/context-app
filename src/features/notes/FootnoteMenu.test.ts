import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import FootnoteMenu from './FootnoteMenu.svelte';

/** Общие реквизиты меню: сноска под маркером (100, 100). */
const AREA = { width: 800, height: 600 };
const AT = { left: 100, top: 100, bottom: 120 };

/** Отрисовка меню с темой области чтения по умолчанию. */
function renderMenu(props: Record<string, unknown> = {}) {
    return render(FootnoteMenu, {
        props: {
            html: '<p>Сноска.</p>',
            at: AT,
            area: AREA,
            palette: 'linen',
            readerTheme: 'light',
            onGoto: vi.fn(),
            onClose: vi.fn(),
            ...props,
        },
    });
}

describe('меню сноски', () => {
    it('показывает текст сноски в разметке книги', () => {
        renderMenu({ html: '<p>Текст <em>сноски</em>.</p>' });

        expect(screen.getByTestId('footnote-menu')).toBeTruthy();
        expect(screen.getByTestId('footnote-text').innerHTML).toBe(
            '<p>Текст <em>сноски</em>.</p>',
        );
    });

    it('переходит к сноске по действию', async () => {
        const onGoto = vi.fn();
        renderMenu({ onGoto });

        await fireEvent.click(screen.getByRole('button', { name: 'Перейти к сноске' }));

        expect(onGoto).toHaveBeenCalled();
    });

    it('закрывается по действию закрытия', async () => {
        const onClose = vi.fn();
        renderMenu({ onClose });

        await fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));

        expect(onClose).toHaveBeenCalled();
    });

    it('у нижнего края области показывается над маркером', () => {
        renderMenu({ at: { left: 100, top: 560, bottom: 580 } });

        const menu = screen.getByTestId('footnote-menu') as HTMLElement;
        // Меню встаёт выше маркера, а не уходит за нижний край области.
        expect(menu.style.top).toBe(`${560 - 220 - 6}px`);
    });

    it('оформление следует теме области чтения, а не интерфейса', () => {
        renderMenu({ readerTheme: 'dark' });
        const dark = screen.getByTestId('footnote-menu') as HTMLElement;

        renderMenu({ readerTheme: 'light' });
        const lights = screen.getAllByTestId('footnote-menu') as HTMLElement[];

        expect(dark.style.background).not.toBe(lights[1].style.background);
        expect(dark.dataset.readerTheme).toBe('dark');
    });
});
