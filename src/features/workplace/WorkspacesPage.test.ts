import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import WorkspacesPage from './WorkspacesPage.svelte';

/** Обработчики экрана с заглушками по умолчанию. */
function handlers() {
    return {
        onCreate: vi.fn<(name: string) => void>(),
        onOpen: vi.fn<(id: string) => void>(),
        onRename: vi.fn<(id: string, name: string) => void>(),
        onRemove: vi.fn<(id: string) => void>(),
    };
}

describe('экран списка рабочих мест', () => {
    it('показывает рабочие места и отмечает текущее', () => {
        render(WorkspacesPage, {
            props: {
                workspaces: [
                    { id: 'ws-1', name: 'Первое' },
                    { id: 'ws-2', name: 'Второе' },
                ],
                currentId: 'ws-2',
                ...handlers(),
            },
        });

        expect(screen.getAllByTestId('workspace-item')).toHaveLength(2);
        expect(screen.getAllByTestId('workspace-meta')[1].textContent).toContain('текущее');
    });

    it('показывает дату создания рабочего места', () => {
        render(WorkspacesPage, {
            props: {
                workspaces: [{ id: 'ws-1', name: 'Первое', createdAtMillis: 1_700_000_000_000 }],
                currentId: null,
                ...handlers(),
            },
        });

        expect(screen.getByTestId('workspace-meta').textContent).toContain('2023');
    });

    it('показывает подсказку при пустом списке', () => {
        render(WorkspacesPage, { props: { workspaces: [], currentId: null, ...handlers() } });

        expect(screen.getByTestId('workspaces-empty')).toBeTruthy();
    });

    it('фильтрует рабочие места по имени', async () => {
        render(WorkspacesPage, {
            props: {
                workspaces: [
                    { id: 'ws-1', name: 'Первое' },
                    { id: 'ws-2', name: 'Второе' },
                ],
                currentId: null,
                ...handlers(),
            },
        });

        await fireEvent.input(screen.getByPlaceholderText('Поиск рабочего места'), {
            target: { value: 'втор' },
        });

        expect(screen.getAllByTestId('workspace-item')).toHaveLength(1);
        expect(screen.getByTestId('workspace-open').textContent?.trim()).toBe('Второе');
    });

    it('показывает «ничего не найдено» при пустом результате поиска', async () => {
        render(WorkspacesPage, {
            props: { workspaces: [{ id: 'ws-1', name: 'Первое' }], currentId: null, ...handlers() },
        });

        await fireEvent.input(screen.getByPlaceholderText('Поиск рабочего места'), {
            target: { value: 'нет такого' },
        });

        expect(screen.getByTestId('workspaces-not-found')).toBeTruthy();
    });

    it('создаёт рабочее место из введённого имени', async () => {
        const base = handlers();
        render(WorkspacesPage, { props: { workspaces: [], currentId: null, ...base } });

        const input = screen.getByPlaceholderText('Новое рабочее место');
        await fireEvent.input(input, { target: { value: 'Новое' } });
        await fireEvent.click(screen.getByLabelText('Создать рабочее место'));

        expect(base.onCreate).toHaveBeenCalledWith('Новое');
    });

    it('не создаёт рабочее место с пустым именем', async () => {
        const base = handlers();
        render(WorkspacesPage, { props: { workspaces: [], currentId: null, ...base } });

        await fireEvent.click(screen.getByLabelText('Создать рабочее место'));

        expect(base.onCreate).not.toHaveBeenCalled();
    });

    it('открывает рабочее место по клику', async () => {
        const base = handlers();
        render(WorkspacesPage, {
            props: { workspaces: [{ id: 'ws-1', name: 'Первое' }], currentId: null, ...base },
        });

        await fireEvent.click(screen.getByTestId('workspace-open'));

        expect(base.onOpen).toHaveBeenCalledWith('ws-1');
    });

    it('переименовывает рабочее место через меню действий', async () => {
        const base = handlers();
        render(WorkspacesPage, {
            props: { workspaces: [{ id: 'ws-1', name: 'Старое' }], currentId: null, ...base },
        });

        await fireEvent.pointerDown(screen.getByLabelText('Действия с рабочим местом'), {
            button: 0,
        });
        await fireEvent.click(screen.getByRole('menuitem', { name: 'Переименовать' }));
        const input = screen.getByPlaceholderText('Новое имя');
        await fireEvent.input(input, { target: { value: 'Новое' } });
        await fireEvent.click(screen.getByText('Сохранить'));

        expect(base.onRename).toHaveBeenCalledWith('ws-1', 'Новое');
    });

    it('удаляет рабочее место через меню действий', async () => {
        const base = handlers();
        render(WorkspacesPage, {
            props: { workspaces: [{ id: 'ws-1', name: 'Первое' }], currentId: null, ...base },
        });

        await fireEvent.pointerDown(screen.getByLabelText('Действия с рабочим местом'), {
            button: 0,
        });
        await fireEvent.click(screen.getByRole('menuitem', { name: 'Удалить' }));

        expect(base.onRemove).toHaveBeenCalledWith('ws-1');
    });
});
