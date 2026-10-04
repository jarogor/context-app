import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import ReaderPage from './ReaderPage.svelte';

vi.mock('./reader', () => ({
    UnsupportedFormatError: class UnsupportedFormatError extends Error {},
    formatFromPath: (path: string) => /\.([a-z0-9]+)$/i.exec(path)?.[1]?.toLowerCase() ?? '',
    isSupportedFormat: (format: string) => format === 'epub',
    loadBookContent: vi.fn(async () => ({
        title: 'Книга',
        authors: [],
        chapters: [{ title: null, html: '<p>Текст</p>' }],
    })),
    openBookExternally: vi.fn(),
    selectWorkplacePlugin: vi.fn(async () => null),
}));

describe('ReaderPage как содержимое вкладки', () => {
    it('принимает начальные масштаб и позицию вкладки', async () => {
        render(ReaderPage, {
            props: {
                path: '/lib/book.epub',
                title: 'Книга',
                initialZoom: 130,
                initialPosition: 40,
            },
        });

        expect(await screen.findByTestId('reader-zoom')).toBeTruthy();
        expect(screen.getByTestId('reader-zoom').textContent).toBe('130%');
        expect(screen.getByTestId('reader-progress').textContent).toBe('40%');
    });

    it('сообщает наружу изменение масштаба', async () => {
        const onStateChange = vi.fn();
        render(ReaderPage, {
            props: {
                path: '/lib/book.epub',
                title: 'Книга',
                initialZoom: 130,
                initialPosition: 40,
                onStateChange,
            },
        });

        await fireEvent.click(screen.getByLabelText('Увеличить масштаб'));

        expect(screen.getByTestId('reader-zoom').textContent).toBe('140%');
        expect(onStateChange).toHaveBeenCalledWith({ zoom: 140, position: 40 });
    });

    it('показывает заглушку недоступной книги и предлагает указать файл', async () => {
        const reader = await import('./reader');
        vi.mocked(reader.loadBookContent).mockRejectedValueOnce(new Error('нет файла'));

        render(ReaderPage, {
            props: { path: '/lib/gone.epub', title: 'Пропавшая книга', onRepoint: vi.fn() },
        });

        expect(await screen.findByTestId('reader-unavailable')).toBeTruthy();
        expect(screen.getByText('Пропавшая книга')).toBeTruthy();
        expect(screen.getByText('Указать файл')).toBeTruthy();
    });
});
