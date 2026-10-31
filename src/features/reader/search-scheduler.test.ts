import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSearchScheduler, SEARCH_DEBOUNCE_MS, SEARCH_MIN_LENGTH } from './search-scheduler';

describe('планировщик поиска по книге', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('одна буква не запускает поиск', () => {
        const run = vi.fn();
        const onReset = vi.fn();
        const scheduler = createSearchScheduler({ run, onReset });

        scheduler.change('с');
        vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS * 4);

        expect(SEARCH_MIN_LENGTH).toBe(2);
        expect(run).not.toHaveBeenCalled();
        expect(onReset).toHaveBeenCalled();
    });

    it('поиск идёт между порциями набора: одна серия — один запуск', () => {
        const run = vi.fn();
        const scheduler = createSearchScheduler({ run });

        scheduler.change('сл');
        scheduler.change('сло');
        scheduler.change('слово');
        vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1);
        expect(run).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1);
        expect(run).toHaveBeenCalledTimes(1);
        expect(run).toHaveBeenCalledWith('слово');
    });

    it('запрос обрезается по краям до запуска', () => {
        const run = vi.fn();
        const scheduler = createSearchScheduler({ run });

        scheduler.change('  слово  ');
        vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);

        expect(run).toHaveBeenCalledWith('слово');
    });

    it('Enter запускает накопленный запрос сразу и сообщает об этом', () => {
        const run = vi.fn();
        const scheduler = createSearchScheduler({ run });

        scheduler.change('слово');
        expect(scheduler.flush()).toBe(true);
        expect(run).toHaveBeenCalledWith('слово');

        // Повторный Enter уже не запускает поиск: он переходит к вхождению.
        expect(scheduler.flush()).toBe(false);
    });

    it('закрытие панели отменяет отложенный поиск', () => {
        const run = vi.fn();
        const scheduler = createSearchScheduler({ run });

        scheduler.change('слово');
        scheduler.cancel();
        vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);

        expect(run).not.toHaveBeenCalled();
    });
});
