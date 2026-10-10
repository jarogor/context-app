import { render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
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
        const onFooter = vi.fn();
        render(ReaderPage, {
            props: {
                path: '/lib/book.epub',
                title: 'Книга',
                initialZoom: 130,
                initialPosition: 40,
                onFooter,
            },
        });

        await screen.findByTestId('reader-loading');
        expect(onFooter).toHaveBeenLastCalledWith(
            expect.objectContaining({ zoom: 130, progress: 40 }),
        );
    });

    it('сообщает наружу изменение масштаба', async () => {
        const onStateChange = vi.fn();
        const onFooter = vi.fn();
        const component = render(ReaderPage, {
            props: {
                path: '/lib/book.epub',
                title: 'Книга',
                initialZoom: 130,
                initialPosition: 40,
                onStateChange,
                onFooter,
            },
        });

        await screen.findByTestId('reader-loading');
        component.component.changeFooterZoom(10);
        await tick();

        expect(onStateChange).toHaveBeenCalledWith({ zoom: 140, position: 40 });
        expect(onFooter).toHaveBeenLastCalledWith(expect.objectContaining({ zoom: 140 }));
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

    it('публикует снимок нижней панели для рабочего места', async () => {
        const onFooter = vi.fn();
        render(ReaderPage, {
            props: {
                path: '/lib/book.epub',
                title: 'Книга',
                initialZoom: 130,
                initialPosition: 40,
                onFooter,
            },
        });

        await screen.findByTestId('reader-loading');
        expect(onFooter).toHaveBeenCalled();
        expect(onFooter).toHaveBeenLastCalledWith(
            expect.objectContaining({ workplace: false, zoom: 130, progress: 40 }),
        );
    });
});
