import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import ReaderFooter from './ReaderFooter.svelte';

/** Нижняя панель читалки страничного формата. */
function drawPagedFooter(onGoToPage = vi.fn()) {
    render(ReaderFooter, {
        props: {
            workplace: true,
            workplacePages: true,
            workplacePage: 11,
            workplacePageCount: 123,
            progress: 10,
            onStepPage: vi.fn(),
            onGoToPage,
        },
    });
    return onGoToPage;
}

describe('ReaderFooter: состав панели', () => {
    it('не содержит управления масштабом и переключателя темы', () => {
        drawPagedFooter();

        expect(screen.queryByTestId('reader-zoom')).toBeNull();
        expect(screen.queryByTestId('reader-theme-toggle')).toBeNull();
        expect(screen.queryByRole('button', { name: 'Уменьшить масштаб' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Увеличить масштаб' })).toBeNull();
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
                workplace: true,
                workplacePages: true,
                workplacePage: 2,
                workplacePageCount: null,
                progress: 10,
                onStepPage: vi.fn(),
                onGoToPage: vi.fn(),
            },
        });

        expect(screen.getByTestId('reader-page-count').textContent).toBe('/ ?');
    });

    it('скрывает навигацию по страницам для формата без страниц', () => {
        render(ReaderFooter, {
            props: {
                workplace: false,
                workplacePages: false,
                workplacePage: null,
                workplacePageCount: null,
                progress: 10,
                onStepPage: vi.fn(),
                onGoToPage: vi.fn(),
            },
        });

        expect(screen.queryByTestId('reader-pages')).toBeNull();
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
