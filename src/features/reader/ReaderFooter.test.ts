import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import ReaderFooter from './ReaderFooter.svelte';

/** Нижняя панель читалки с заданной темой области чтения. */
function drawFooter(readerTheme: 'light' | 'dark', onChangeReaderTheme = vi.fn()) {
    render(ReaderFooter, {
        props: {
            zoom: 100,
            minZoom: 60,
            maxZoom: 220,
            workplace: false,
            workplaceZoom: true,
            workplacePages: false,
            workplacePage: null,
            workplacePageCount: null,
            progress: 10,
            readerTheme,
            onChangeZoom: vi.fn(),
            onStepPage: vi.fn(),
            onGoToPage: vi.fn(),
            onChangeReaderTheme,
        },
    });
    return onChangeReaderTheme;
}

describe('ReaderFooter: переключатель темы области чтения', () => {
    it('показывает текущую тему как нажатую', () => {
        drawFooter('dark');

        expect(screen.getByLabelText('Тёмная тема области чтения')).toBeTruthy();
        expect(
            screen.getByLabelText('Тёмная тема области чтения').getAttribute('aria-pressed'),
        ).toBe('true');
        expect(
            screen.getByLabelText('Светлая тема области чтения').getAttribute('aria-pressed'),
        ).toBe('false');
    });

    it('сообщает о выборе светлой и тёмной темы', async () => {
        const onChange = drawFooter('light');

        await fireEvent.click(screen.getByLabelText('Тёмная тема области чтения'));
        expect(onChange).toHaveBeenCalledWith('dark');

        await fireEvent.click(screen.getByLabelText('Светлая тема области чтения'));
        expect(onChange).toHaveBeenCalledWith('light');
    });
});
