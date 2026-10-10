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

/** Нижняя панель читалки страничного формата. */
function drawPagedFooter(onGoToPage = vi.fn()) {
    render(ReaderFooter, {
        props: {
            zoom: 100,
            minZoom: 5,
            maxZoom: 1000,
            workplace: true,
            workplaceZoom: true,
            workplacePages: true,
            workplacePage: 11,
            workplacePageCount: 123,
            progress: 10,
            readerTheme: 'light',
            onChangeZoom: vi.fn(),
            onStepPage: vi.fn(),
            onGoToPage,
            onChangeReaderTheme: vi.fn(),
        },
    });
    return onGoToPage;
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

describe('ReaderFooter: навигация по страницам', () => {
    it('показывает текущую страницу полем и пометку «/ N»', () => {
        drawPagedFooter();

        const field = screen.getByLabelText('Текущая страница') as HTMLInputElement;
        expect(field.value).toBe('11');
        expect(screen.getByTestId('reader-page-count').textContent).toBe('/ 123');
    });

    it('не показывает отдельного поля ввода страницы', () => {
        drawPagedFooter();

        expect(screen.queryByLabelText('Перейти к странице')).toBeNull();
    });

    it('переходит к введённой странице по Enter', async () => {
        const onGoToPage = drawPagedFooter();
        const field = screen.getByLabelText('Текущая страница');

        await fireEvent.input(field, { target: { value: '3' } });
        await fireEvent.keyDown(field, { key: 'Enter' });

        expect(onGoToPage).toHaveBeenCalledWith(3);
    });

    it('игнорирует нечисловой ввод и возвращает текущую страницу', async () => {
        const onGoToPage = drawPagedFooter();
        const field = screen.getByLabelText('Текущая страница') as HTMLInputElement;

        await fireEvent.input(field, { target: { value: 'abc' } });
        await fireEvent.keyDown(field, { key: 'Enter' });

        expect(onGoToPage).not.toHaveBeenCalled();
        expect(field.value).toBe('11');
    });

    it('переходит к введённой странице по потере фокуса', async () => {
        const onGoToPage = drawPagedFooter();
        const field = screen.getByLabelText('Текущая страница');

        await fireEvent.input(field, { target: { value: '7' } });
        await fireEvent.blur(field);

        expect(onGoToPage).toHaveBeenCalledWith(7);
    });

    it('показывает «/ ?» при неизвестном числе страниц', () => {
        render(ReaderFooter, {
            props: {
                zoom: 100,
                minZoom: 5,
                maxZoom: 1000,
                workplace: true,
                workplaceZoom: true,
                workplacePages: true,
                workplacePage: 2,
                workplacePageCount: null,
                progress: 10,
                readerTheme: 'light',
                onChangeZoom: vi.fn(),
                onStepPage: vi.fn(),
                onGoToPage: vi.fn(),
                onChangeReaderTheme: vi.fn(),
            },
        });

        expect(screen.getByTestId('reader-page-count').textContent).toBe('/ ?');
    });
});

describe('ReaderFooter: адаптивность прогресса', () => {
    it('скрывает полосу прогресса на узком окне, оставляя цифру', () => {
        drawPagedFooter();

        expect(screen.getByTestId('reader-progress').textContent).toBe('10%');
        const bar = document.querySelector('[data-testid="reader-footer"] [role="progressbar"]');
        expect(bar).not.toBeNull();
        expect(bar?.className).toContain('max-[899px]:hidden');
    });
});
