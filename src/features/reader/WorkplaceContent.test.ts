import { render, waitFor } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import WorkplaceContent from './WorkplaceContent.svelte';
import { readerThemeNoteTones, readerThemeTokens } from '@texture/ui';

vi.mock('./reader', () => ({
    loadWorkplaceBundle: vi.fn(async () => ({ entry: '<html></html>', files: [] })),
    readWorkplaceBook: vi.fn(async () => ({ data: '' })),
    openBookExternally: vi.fn(),
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
            palette: 'gruvbox' as const,
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
                data: { channel: 'texture-workplace', type: 'ready' },
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
        expect(payload.value.tokens).toEqual(readerThemeTokens('gruvbox', 'dark'));
        expect(payload.value.notes).toEqual(readerThemeNoteTones('gruvbox', 'dark'));
    });

    it('просит плагин довести отрисовку по возврате видимости', async () => {
        const result = render(WorkplaceContent, {
            props: {
                pluginId: 'pdf',
                path: '/lib/book.pdf',
                title: 'Книга',
                zoom: 100,
                readerTheme: 'dark' as const,
                palette: 'gruvbox' as const,
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
                data: { channel: 'texture-workplace', type: 'ready' },
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
            palette: 'gruvbox' as const,
            visible: false,
        });
        await result.rerender({
            pluginId: 'pdf',
            path: '/lib/book.pdf',
            title: 'Книга',
            zoom: 100,
            readerTheme: 'dark' as const,
            palette: 'gruvbox' as const,
            visible: true,
        });

        await waitFor(() => {
            expect(
                post.mock.calls.some((call) => (call[0] as { type?: string })?.type === 'show'),
            ).toBe(true);
        });
    });
});
