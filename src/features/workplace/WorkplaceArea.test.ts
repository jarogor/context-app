import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import WorkplaceArea from './WorkplaceArea.svelte';
import { DEFAULT_NOTE_TOOL, normalizeNote, noteList } from '../notes/notes';

/** Обязательные обработчики области с заглушками. */
function handlers() {
    return {
        openTabsLimit: 50,
        tool: DEFAULT_NOTE_TOOL,
        onToolChange: vi.fn(),
        onSelectTab: vi.fn(),
        onCloseTab: vi.fn(),
        onDuplicateTab: vi.fn(),
        onEditTabAppearance: vi.fn(),
        onAddBook: vi.fn(),
        onAddFile: vi.fn(),
        onToggleBooks: vi.fn(),
        onToggleNotes: vi.fn(),
        onCloseNotes: vi.fn(),
        onQuote: vi.fn(),
        onTextNote: vi.fn(),
        onEditNoteText: vi.fn(),
        onShape: vi.fn(),
        onDeleteNote: vi.fn(),
        onChangeNoteColor: vi.fn(),
        onEditNote: vi.fn(),
        onGoToNote: vi.fn(),
        onSelectNote: vi.fn(),
        onSelectSet: vi.fn(),
        onCreateSet: vi.fn(),
        onRenameSet: vi.fn(),
        onRemoveSet: vi.fn(),
        onTabState: vi.fn(),
        onRepointTab: vi.fn(),
        onBackToList: vi.fn(),
        onCreateWorkspace: vi.fn(),
        onOpenWorkspace: vi.fn(),
        onRenameWorkspace: vi.fn(),
        onRemoveWorkspace: vi.fn(),
    };
}

/** Значения панелей, общие для тестов. */
function panels() {
    return {
        notesOpen: false,
        notes: [],
        noteSets: [],
        activeSetId: null,
        notesLoading: false,
        hasBook: false,
    };
}

/** Свойства области с текущим местом и одной открытой вкладкой. */
function workplaceProps(overrides: { listMode: boolean }) {
    return {
        workspace: {
            id: 'ws-1',
            name: 'Первое',
            createdAtMillis: 0,
            tabs: [
                {
                    id: 't1',
                    path: '/lib/book-1.epub',
                    title: 'Книга',
                    format: 'epub',
                    zoom: 100,
                    position: 0,
                    mode: 'scroll',
                },
            ],
            activeTabId: 't1',
        },
        workspaces: [],
        currentWorkspaceId: 'ws-1',
        booksOpen: false,
        visible: true,
        ...panels(),
        ...handlers(),
        ...overrides,
    };
}

describe('область рабочего места: список и вкладки', () => {
    it('показывает список при отсутствии активного рабочего места', () => {
        render(WorkplaceArea, {
            props: {
                workspace: null,
                workspaces: [
                    { id: 'ws-1', name: 'Первое', createdAtMillis: 0, tabs: [], activeTabId: null },
                ],
                currentWorkspaceId: null,
                listMode: true,
                booksOpen: false,
                visible: true,
                ...panels(),
                ...handlers(),
            },
        });

        expect(screen.getByTestId('workspaces-page')).toBeTruthy();
        expect(screen.queryByTestId('workplace-tabs')).toBeNull();
    });

    it('показывает вкладки при активном рабочем месте', () => {
        render(WorkplaceArea, {
            props: {
                workspace: {
                    id: 'ws-1',
                    name: 'Первое',
                    createdAtMillis: 0,
                    tabs: [
                        {
                            id: 't1',
                            path: '/lib/book-1.epub',
                            title: 'Книга',
                            format: 'epub',
                            zoom: 100,
                            position: 0,
                            mode: 'scroll',
                        },
                    ],
                    activeTabId: 't1',
                },
                workspaces: [],
                currentWorkspaceId: 'ws-1',
                listMode: false,
                booksOpen: false,
                visible: true,
                ...panels(),
                ...handlers(),
            },
        });

        expect(screen.getByTestId('workplace-tabs')).toBeTruthy();
        expect(screen.queryByTestId('workspaces-page')).toBeNull();
    });

    it('показывает список в режиме списка даже при активном рабочем месте', () => {
        render(WorkplaceArea, {
            props: {
                workspace: {
                    id: 'ws-1',
                    name: 'Первое',
                    createdAtMillis: 0,
                    tabs: [],
                    activeTabId: null,
                },
                workspaces: [
                    { id: 'ws-1', name: 'Первое', createdAtMillis: 0, tabs: [], activeTabId: null },
                ],
                currentWorkspaceId: 'ws-1',
                listMode: true,
                booksOpen: false,
                visible: true,
                ...panels(),
                ...handlers(),
            },
        });

        expect(screen.getByTestId('workspaces-page')).toBeTruthy();
        expect(screen.getByTestId('workspace-meta').textContent).toContain('текущее');
    });

    it('оставляет вкладки смонтированными, когда показан список', () => {
        render(WorkplaceArea, {
            props: workplaceProps({ listMode: true }),
        });

        // Список показан, но слой вкладок не уничтожен: он скрыт, а не удалён,
        // поэтому возврат к месту не пересоздаёт читалки и не читает книгу заново.
        expect(screen.getByTestId('workspaces-page')).toBeTruthy();
        expect(screen.getByTestId('workplace-tabs')).toBeTruthy();
        expect(screen.getByTestId('workplace-tabs-layer').getAttribute('data-shown')).toBe('false');
        expect(screen.getByTestId('workplace-tab-page')).toBeTruthy();
    });

    it('показывает слой вкладок после выхода из списка', async () => {
        const { rerender } = render(WorkplaceArea, {
            props: workplaceProps({ listMode: true }),
        });
        expect(screen.getByTestId('workplace-tabs-layer').getAttribute('data-shown')).toBe('false');

        await rerender(workplaceProps({ listMode: false }));

        expect(screen.getByTestId('workplace-tabs-layer').getAttribute('data-shown')).toBe('true');
        // Вкладка осталась той же самой: состав и активная вкладка не изменились.
        expect(screen.getByTestId('workplace-tab-page').getAttribute('data-active')).toBe('true');
    });

    it('передаёт возврат к списку из панели вкладок', async () => {
        const base = handlers();
        render(WorkplaceArea, {
            props: {
                workspace: {
                    id: 'ws-1',
                    name: 'Исследование',
                    createdAtMillis: 0,
                    tabs: [],
                    activeTabId: null,
                },
                workspaces: [],
                currentWorkspaceId: 'ws-1',
                listMode: false,
                booksOpen: false,
                visible: true,
                ...panels(),
                ...base,
            },
        });

        await fireEvent.click(screen.getByLabelText('К списку рабочих мест'));

        expect(base.onBackToList).toHaveBeenCalled();
    });

    it('показывает общую нижнюю панель при открытой вкладке', () => {
        render(WorkplaceArea, {
            props: {
                workspace: {
                    id: 'ws-1',
                    name: 'Первое',
                    createdAtMillis: 0,
                    tabs: [
                        {
                            id: 't1',
                            path: '/lib/book-1.epub',
                            title: 'Книга',
                            format: 'epub',
                            zoom: 100,
                            position: 0,
                            mode: 'scroll',
                        },
                    ],
                    activeTabId: 't1',
                },
                workspaces: [],
                currentWorkspaceId: 'ws-1',
                listMode: false,
                booksOpen: false,
                visible: true,
                ...panels(),
                ...handlers(),
            },
        });

        expect(screen.getByTestId('note-toolbar').contains(screen.getByTestId('reader-zoom'))).toBe(
            true,
        );
        expect(screen.getByTestId('reader-zoom').textContent).toBe('100%');
        expect(screen.getByTestId('reader-progress').textContent).toBe('0%');
    });

    it('на узком окне переход к заметке закрывает панель заметок', async () => {        const matchMedia = vi.spyOn(window, 'matchMedia').mockReturnValue({
            matches: true,
            media: '(max-width: 899px)',
            onchange: null,
            addEventListener: () => {},
            removeEventListener: () => {},
            addListener: () => {},
            removeListener: () => {},
            dispatchEvent: () => false,
        } as unknown as MediaQueryList);
        const base = handlers();
        render(WorkplaceArea, {
            props: {
                workspace: {
                    id: 'ws-1',
                    name: 'Первое',
                    createdAtMillis: 0,
                    tabs: [
                        {
                            id: 't1',
                            path: '/lib/book-1.epub',
                            title: 'Книга',
                            format: 'epub',
                            zoom: 100,
                            position: 0,
                            mode: 'scroll',
                        },
                    ],
                    activeTabId: 't1',
                },
                workspaces: [],
                currentWorkspaceId: 'ws-1',
                listMode: false,
                booksOpen: false,
                visible: true,
                notesOpen: true,
                notes: noteList([normalizeNote({ id: 'note-1', quote: 'Цитата' })]),
                noteSets: [],
                activeSetId: null,
                notesLoading: false,
                hasBook: true,
                ...base,
            },
        });

        await fireEvent.click(screen.getByTestId('notes-item-link'));

        expect(base.onGoToNote).toHaveBeenCalled();
        expect(base.onCloseNotes).toHaveBeenCalled();
        matchMedia.mockRestore();
    });

    it('передаёт правку оформления вкладки из панели открытых книг', async () => {
        const base = handlers();
        render(WorkplaceArea, {
            props: {
                workspace: {
                    id: 'ws-1',
                    name: 'Первое',
                    createdAtMillis: 0,
                    tabs: [
                        {
                            id: 't1',
                            path: '/lib/book-1.epub',
                            title: 'Книга',
                            format: 'epub',
                            zoom: 100,
                            position: 0,
                            mode: 'scroll',
                        },
                    ],
                    activeTabId: 't1',
                },
                workspaces: [],
                currentWorkspaceId: 'ws-1',
                listMode: false,
                booksOpen: true,
                visible: true,
                ...panels(),
                ...base,
            },
        });

        await fireEvent.click(screen.getByLabelText('Оформление вкладки'));
        await fireEvent.click(await screen.findByText('Сбросить оформление'));

        expect(base.onEditTabAppearance).toHaveBeenCalledWith('t1', {
            name: undefined,
            description: undefined,
            icon: undefined,
            color: undefined,
        });
        // Состав вкладок и активная вкладка при правке оформления не меняются.
        expect(base.onSelectTab).not.toHaveBeenCalled();
        expect(base.onCloseTab).not.toHaveBeenCalled();
    });
});
