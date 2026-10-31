import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ReaderSearchBar from './ReaderSearchBar.svelte';
import { createSearchScheduler, SEARCH_DEBOUNCE_MS, SEARCH_MIN_LENGTH } from './search-scheduler';
import { EMPTY_SEARCH_STATE, stepSearchIndex, withSearchIndex } from './search-state';

describe('панель поиска, планировщик и состояние', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('панель показывает счётчик, сообщает о запросе и переходах', async () => {
        const onQuery = vi.fn();
        const onStep = vi.fn();
        const onClose = vi.fn();
        render(ReaderSearchBar, {
            props: {
                query: '',
                state: { total: 17, index: 1, truncated: false },
                onQuery,
                onStep,
                onClose,
            },
        });

        expect(screen.getByTestId('reader-search-counter').textContent).toBe('2 из 17');

        const field = screen.getByRole('textbox');
        await fireEvent.input(field, { target: { value: 'слово' } });
        expect(onQuery).toHaveBeenCalledWith('слово');

        await fireEvent.click(screen.getByTestId('reader-search-next'));
        expect(onStep).toHaveBeenCalledWith(1);
        await fireEvent.click(screen.getByTestId('reader-search-prev'));
        expect(onStep).toHaveBeenCalledWith(-1);

        await fireEvent.keyDown(field, { key: 'Enter' });
        expect(onStep).toHaveBeenCalledWith(1);
        await fireEvent.keyDown(field, { key: 'Enter', shiftKey: true });
        expect(onStep).toHaveBeenCalledWith(-1);
        await fireEvent.keyDown(field, { key: 'Escape' });
        expect(onClose).toHaveBeenCalled();
    });

    it('панель не резервирует место под счётчик без результата', () => {
        render(ReaderSearchBar, {
            props: { query: '', state: EMPTY_SEARCH_STATE },
        });

        // Счётчика нет вовсе: в строке он не оставлял бы пустоту справа от поля.
        expect(screen.queryByTestId('reader-search-counter')).toBeNull();
        expect(
            (screen.getByTestId('reader-search-next') as HTMLButtonElement).disabled,
        ).toBe(true);
    });

    it('панель объясняет пустой результат и обрезку', async () => {
        const { unmount } = render(ReaderSearchBar, {
            props: { query: 'нет такого', state: { total: 0, index: null, truncated: false } },
        });
        expect(screen.getByTestId('reader-search-hint').textContent).toContain('Не найдено');
        unmount();

        render(ReaderSearchBar, {
            props: { query: 'слово', state: { total: 500, index: 0, truncated: true } },
        });
        expect(screen.getByTestId('reader-search-hint').textContent).toContain('больше');
    });

    it('планировщик: короткий запрос не ищется, серия набора даёт один поиск', () => {
        const run = vi.fn();
        const onReset = vi.fn();
        const scheduler = createSearchScheduler({ run, onReset });

        // Одна буква поиск не запускает: это десятки тысяч вхождений и тормоза.
        scheduler.change('с');
        vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS * 4);
        expect(SEARCH_MIN_LENGTH).toBe(2);
        expect(run).not.toHaveBeenCalled();
        expect(onReset).toHaveBeenCalled();

        // Набор подряд — один поиск после затишья, по последнему запросу.
        scheduler.change('сл');
        scheduler.change('  сло  ');
        scheduler.change('слово');
        vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1);
        expect(run).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(run).toHaveBeenCalledTimes(1);
        expect(run).toHaveBeenCalledWith('слово');

        // Enter применяет накопленный запрос сразу, повторный — уже переход.
        scheduler.change('слово');
        expect(scheduler.flush()).toBe(true);
        expect(run).toHaveBeenCalledTimes(2);
        expect(scheduler.flush()).toBe(false);

        // Закрытие панели отменяет отложенный поиск.
        scheduler.change('слово');
        scheduler.cancel();
        vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
        expect(run).toHaveBeenCalledTimes(2);
    });

    it('переход по вхождениям идёт по кругу, без вхождений не переходит', () => {
        const empty = EMPTY_SEARCH_STATE;
        expect(stepSearchIndex(empty, 1)).toBeNull();
        expect(stepSearchIndex({ ...empty, total: 3 }, 1)).toBe(0);
        expect(stepSearchIndex({ ...empty, total: 3 }, -1)).toBe(2);
        expect(stepSearchIndex({ total: 3, index: 2, truncated: false }, 1)).toBe(0);
        expect(stepSearchIndex({ total: 3, index: 0, truncated: false }, -1)).toBe(2);
        expect(withSearchIndex({ total: 2, index: null, truncated: false }, 1).index).toBe(1);
        expect(withSearchIndex({ total: 2, index: null, truncated: false }, null).index).toBeNull();
    });
});
