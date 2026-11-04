import { render, waitFor } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import WorkplaceContent from './WorkplaceContent.svelte';
import { readerThemeNoteTones, readerThemeTokens } from '@context/ui';

vi.mock('./reader', () => ({
    loadWorkplaceBundle: vi.fn(async () => ({ entry: '<html></html>', files: [] })),
    readBookContent: vi.fn(async () => ({ title: '', authors: [], chapters: [] })),
    readWorkplaceBook: vi.fn(async () => ''),
    encodeText: (value: string) => value,
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

    it('разбирает книгу сразу, а модулю отдаёт её по готовности', async () => {
        // Книгу разбирает плагин формата, а не загрузка модуля рисования:
        // поэтому содержимое читается сразу при монтировании вкладки, а
        // сообщение `open` уходит модулю, когда он сообщил о готовности.
        const { readBookContent } = await import('./reader');
        const readBook = vi.mocked(readBookContent);
        readBook.mockClear();
        readBook.mockResolvedValue({ title: '', authors: [], chapters: [] });

        const props = {
            pluginId: 'format-epub',
            path: '/lib/book.epub',
            title: 'Книга',
            zoom: 100,
            readerTheme: 'dark' as const,
            palette: 'linen' as const,
            flowing: true,
        };
        const result = render(WorkplaceContent, { props });
        await waitFor(() => {
            expect(readBook).toHaveBeenCalledTimes(1);
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
                    (call) => (call[0] as { type?: string })?.type === 'open',
                ),
            ).toBe(true);
        });

        // Повторная видимость не разбирает файл заново.
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

    it('отправляет плагину запрос поиска и передаёт результат наружу', async () => {
        const onSearch = vi.fn();
        const result = render(WorkplaceContent, {
            props: {
                pluginId: 'pdf',
                path: '/lib/book.pdf',
                title: 'Книга',
                zoom: 100,
                readerTheme: 'dark' as const,
                palette: 'linen' as const,
                visible: true,
                onSearch,
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
            expect(post).toHaveBeenCalled();
        });

        result.component.search('слово');
        expect(
            post.mock.calls.some((call) => (call[0] as { type?: string })?.type === 'search'),
        ).toBe(true);

        result.component.stepSearch(1);
        const step = post.mock.calls.find(
            (call) => (call[0] as { type?: string })?.type === 'search-step',
        );
        expect((step?.[0] as { value?: { delta?: number } })?.value?.delta).toBe(1);

        window.dispatchEvent(
            new MessageEvent('message', {
                source: contentWindow,
                data: {
                    channel: 'context-workplace',
                    type: 'search',
                    value: { query: 'слово', total: 3, index: 0 },
                },
            }),
        );
        expect(onSearch).toHaveBeenCalledWith({
            query: 'слово',
            total: 3,
            index: 0,
            truncated: false,
        });
    });
});
