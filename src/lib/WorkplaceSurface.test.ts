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
    onToggleBooks: vi.fn(),
    onTabState: vi.fn(),
    onRepointTab: vi.fn(),
    onBackToList: vi.fn(),
    onCreateWorkspace: vi.fn(),
    onOpenWorkspace: vi.fn(),
    onRenameWorkspace: vi.fn(),
    onRemoveWorkspace: vi.fn(),
  };
}

describe('поверхность рабочего места: список и вкладки', () => {
  it('показывает список при отсутствии активного рабочего места', () => {
    render(WorkplaceSurface, {
      props: {
        workspace: null,
        workspaces: [{ id: 'ws-1', name: 'Первое', createdAtMillis: 0, tabs: [], activeTabId: null }],
        activeWorkspaceId: null,
        listMode: true,
        booksOpen: false,
        visible: true,
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
          tabs: [{ id: 't1', bookId: 'book-1', title: 'Книга', format: 'epub', zoom: 100, position: 0, mode: 'scroll' }],
          activeTabId: 't1',
        },
        workspaces: [],
        activeWorkspaceId: 'ws-1',
        listMode: false,
        booksOpen: false,
        visible: true,
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
        workspaces: [{ id: 'ws-1', name: 'Первое', createdAtMillis: 0, tabs: [], activeTabId: null }],
        activeWorkspaceId: 'ws-1',
        listMode: true,
        booksOpen: false,
        visible: true,
        ...handlers(),
      },
    });

    expect(screen.getByTestId('workspaces-page')).toBeTruthy();
    expect(screen.getByTestId('workspace-active')).toBeTruthy();
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
        activeWorkspaceId: 'ws-1',
        listMode: false,
        booksOpen: false,
        visible: true,
        ...base,
      },
    });

    await fireEvent.click(screen.getByTestId('workplace-back-to-list'));

    expect(base.onBackToList).toHaveBeenCalled();
  });
});
