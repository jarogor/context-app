import { render, waitFor } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import WorkplaceContent from './WorkplaceContent.svelte';
import { readerThemeNoteTones, readerThemeTokens } from '@context/ui';

vi.mock('./reader', () => ({
    loadWorkplaceBundle: vi.fn(async () => ({ entry: '<html></html>', files: [] })),
    readWorkplaceBook: vi.fn(async () => ({ data: '' })),
    openBookFile: vi.fn(),
}));

vi.mock('./viewer-bundle', () => ({
    buildViewerDocument: vi.fn(() => '<html></html>'),
}));

/** Область содержимого плагина, отрисованная с заданной темой области чтения. */
function drawWorkplace() {
    const result = render(WorkplaceContent, {
        props: {
            pluginId: 'pdf',
            path: '/lib/book.pdf',
            title: 'Книга',
            zoom: 100,
            readerTheme: 'dark' as const,
            palette: 'linen' as const,
        },
    });
    return result;
}

describe('WorkplaceContent: тема области чтения', () => {
    it('сообщает плагину тему при готовности', async () => {
        drawWorkplace();
        const frame = document.querySelector('iframe') as HTMLIFrameElement;
        const contentWindow = frame.contentWindow;
        if (!contentWindow) {
            return;
        }
        const post = vi.spyOn(contentWindow, 'postMessage');

        window.dispatchEvent(
            new MessageEvent('message', {
                source: contentWindow,
                data: { channel: 'context-workplace', type: 'ready' },
            }),
        );

        await waitFor(() => {
            const sent = post.mock.calls.find(
                (call) => (call[0] as { type?: string })?.type === 'reader-theme',
            );
            expect(sent).toBeTruthy();
        });
        const payload = post.mock.calls.find(
            (call) => (call[0] as { type?: string })?.type === 'reader-theme',
        )?.[0] as { value: { id: string; tokens: unknown; notes: unknown } };
        expect(payload.value.id).toBe('dark');
        expect(payload.value.tokens).toEqual(readerThemeTokens('linen', 'dark'));
        expect(payload.value.notes).toEqual(readerThemeNoteTones('linen', 'dark'));
    });

    it('не читает книгу, пока вкладка скрыта, и читает при первом показе', async () => {
        // При открытии рабочего места монтируются все вкладки. Если каждая начнёт
        // читать свою книгу, главный поток занят ими всеми сразу — интерфейс
        // замирает, хотя книги грузятся «в свои области».
        const { readWorkplaceBook } = await import('./reader');
        const readBook = vi.mocked(readWorkplaceBook);
        readBook.mockClear();
        readBook.mockResolvedValue('' as never);

        const props = {
            pluginId: 'pdf',
            path: '/lib/book.pdf',
            title: 'Книга',
            zoom: 100,
            readerTheme: 'dark' as const,
            palette: 'linen' as const,
        };
        const result = render(WorkplaceContent, { props: { ...props, visible: false } });
        const frame = document.querySelector('iframe') as HTMLIFrameElement;
        const contentWindow = frame.contentWindow;
        if (!contentWindow) {
            return;
        }

        window.dispatchEvent(
            new MessageEvent('message', {
                source: contentWindow,
                data: { channel: 'context-workplace', type: 'ready' },
            }),
        );

        // Скрытая вкладка книгу не читает.
        expect(readBook).not.toHaveBeenCalled();

        // Первый показ вкладки запускает чтение, и только один раз.
        await result.rerender({ ...props, visible: true });
        await waitFor(() => {
            expect(readBook).toHaveBeenCalledTimes(1);
        });
        await result.rerender({ ...props, visible: false });
        await result.rerender({ ...props, visible: true });
        expect(readBook).toHaveBeenCalledTimes(1);
    });

    it('просит плагин довести отрисовку по возврате видимости', async () => {
        const result = render(WorkplaceContent, {
            props: {
                pluginId: 'pdf',
                path: '/lib/book.pdf',
                title: 'Книга',
                zoom: 100,
                readerTheme: 'dark' as const,
                palette: 'linen' as const,
                visible: true,
            },
        });
        const frame = document.querySelector('iframe') as HTMLIFrameElement;
        const contentWindow = frame.contentWindow;
        if (!contentWindow) {
            return;
        }
        const post = vi.spyOn(contentWindow, 'postMessage');

        window.dispatchEvent(
            new MessageEvent('message', {
                source: contentWindow,
                data: { channel: 'context-workplace', type: 'ready' },
            }),
        );
        await waitFor(() => {
            expect(
                post.mock.calls.some(
                    (call) => (call[0] as { type?: string })?.type === 'reader-theme',
                ),
            ).toBe(true);
        });

        // Скрытие и возврат области чтения: возврат должен попросить плагин
        // перерисовать «грязные» страницы, не дожидаясь прокрутки или размера.
        post.mockClear();
        await result.rerender({
            pluginId: 'pdf',
            path: '/lib/book.pdf',
            title: 'Книга',
            zoom: 100,
            readerTheme: 'dark' as const,
            palette: 'linen' as const,
            visible: false,
        });
        await result.rerender({
            pluginId: 'pdf',
            path: '/lib/book.pdf',
            title: 'Книга',
            zoom: 100,
            readerTheme: 'dark' as const,
            palette: 'linen' as const,
            visible: true,
        });

        await waitFor(() => {
            expect(
                post.mock.calls.some((call) => (call[0] as { type?: string })?.type === 'show'),
            ).toBe(true);
        });
    });
});
