import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import ReaderSearchBar from './ReaderSearchBar.svelte';

describe('панель поиска по книге', () => {
    it('показывает счётчик вхождений и номер текущего', () => {
        render(ReaderSearchBar, {
            props: { query: 'слово', state: { total: 17, index: 1, truncated: false } },
        });

        expect(screen.getByTestId('reader-search-counter').textContent).toBe('2 из 17');
    });

    it('сообщает о запросе и переходе по вхождениям', async () => {
        const onQuery = vi.fn();
        const onStep = vi.fn();
        render(ReaderSearchBar, {
            props: {
                query: '',
                state: { total: 5, index: 0, truncated: false },
                onQuery,
                onStep,
            },
        });

        await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'слово' } });
        expect(onQuery).toHaveBeenCalledWith('слово');

        await fireEvent.click(screen.getByTestId('reader-search-next'));
        expect(onStep).toHaveBeenCalledWith(1);
        await fireEvent.click(screen.getByTestId('reader-search-prev'));
        expect(onStep).toHaveBeenCalledWith(-1);
    });

    it('переход по Enter и закрытие по Escape', async () => {
        const onStep = vi.fn();
        const onClose = vi.fn();
        render(ReaderSearchBar, {
            props: { query: 'x', state: { total: 2, index: 0, truncated: false }, onStep, onClose },
        });

        const field = screen.getByRole('textbox');
        await fireEvent.keyDown(field, { key: 'Enter' });
        expect(onStep).toHaveBeenCalledWith(1);
        await fireEvent.keyDown(field, { key: 'Enter', shiftKey: true });
        expect(onStep).toHaveBeenCalledWith(-1);
        await fireEvent.keyDown(field, { key: 'Escape' });
        expect(onClose).toHaveBeenCalled();
    });

    it('без вхождений сообщает «Не найдено» и не даёт переходить', () => {
        render(ReaderSearchBar, {
            props: { query: 'нет такого', state: { total: 0, index: null, truncated: false } },
        });

        expect(screen.getByTestId('reader-search-hint').textContent).toContain('Не найдено');
        expect(
            (screen.getByTestId('reader-search-next') as HTMLButtonElement).disabled,
        ).toBe(true);
    });

    it('показывает, что найдено больше, чем показано', () => {
        render(ReaderSearchBar, {
            props: { query: 'слово', state: { total: 500, index: 0, truncated: true } },
        });

        expect(screen.getByTestId('reader-search-hint').textContent).toContain('больше');
    });
});
