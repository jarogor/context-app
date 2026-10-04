import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import WorkplaceSurface from './WorkplaceSurface.svelte';

/** Обязательные обработчики поверхности с заглушками. */
function handlers() {
    return {
        onSelectTab: vi.fn(),
        onCloseTab: vi.fn(),
        onDuplicateTab: vi.fn(),
        onAddBook: vi.fn(),
        onAddFile: vi.fn(),
        onToggleBooks: vi.fn(),
        onToggleNotes: vi.fn(),
        onQuote: vi.fn(),
        onDeleteNote: vi.fn(),
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

describe('поверхность рабочего места: список и вкладки', () => {
    it('показывает список при отсутствии активного рабочего места', () => {
        render(WorkplaceSurface, {
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
        render(WorkplaceSurface, {
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
        render(WorkplaceSurface, {
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
        expect(screen.getByTestId('workspace-current')).toBeTruthy();
    });

    it('передаёт возврат к списку из панели вкладок', async () => {
        const base = handlers();
        render(WorkplaceSurface, {
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
});
