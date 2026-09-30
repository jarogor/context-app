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
  it('показывает рабочие места и отмечает активное', () => {
    render(WorkspacesPage, {
      props: {
        workspaces: [
          { id: 'ws-1', name: 'Первое' },
          { id: 'ws-2', name: 'Второе' },
        ],
        activeId: 'ws-2',
        ...handlers(),
      },
    });

    expect(screen.getAllByTestId('workspace-item')).toHaveLength(2);
    expect(screen.getByTestId('workspace-active').textContent?.trim()).toBe('активное');
  });

  it('показывает подсказку при пустом списке', () => {
    render(WorkspacesPage, { props: { workspaces: [], activeId: null, ...handlers() } });

    expect(screen.getByTestId('workspaces-empty')).toBeTruthy();
  });

  it('создаёт рабочее место из введённого имени', async () => {
    const base = handlers();
    render(WorkspacesPage, { props: { workspaces: [], activeId: null, ...base } });

    const input = screen.getByRole('textbox');
    await fireEvent.input(input, { target: { value: 'Новое' } });
    await fireEvent.click(screen.getByText('Создать'));

    expect(base.onCreate).toHaveBeenCalledWith('Новое');
  });

  it('не создаёт рабочее место с пустым именем', async () => {
    const base = handlers();
    render(WorkspacesPage, { props: { workspaces: [], activeId: null, ...base } });

    await fireEvent.click(screen.getByText('Создать'));

    expect(base.onCreate).not.toHaveBeenCalled();
  });

  it('открывает рабочее место по клику', async () => {
    const base = handlers();
    render(WorkspacesPage, {
      props: { workspaces: [{ id: 'ws-1', name: 'Первое' }], activeId: null, ...base },
    });

    await fireEvent.click(screen.getByTestId('workspace-open'));

    expect(base.onOpen).toHaveBeenCalledWith('ws-1');
  });

  it('переименовывает рабочее место', async () => {
    const base = handlers();
    render(WorkspacesPage, {
      props: { workspaces: [{ id: 'ws-1', name: 'Старое' }], activeId: null, ...base },
    });

    await fireEvent.click(screen.getByLabelText('Переименовать рабочее место'));
    const input = screen.getAllByRole('textbox')[1];
    await fireEvent.input(input, { target: { value: 'Новое' } });
    await fireEvent.click(screen.getByText('Сохранить'));

    expect(base.onRename).toHaveBeenCalledWith('ws-1', 'Новое');
  });

  it('удаляет рабочее место по кнопке', async () => {
    const base = handlers();
    render(WorkspacesPage, {
      props: { workspaces: [{ id: 'ws-1', name: 'Первое' }], activeId: null, ...base },
    });

    await fireEvent.click(screen.getByLabelText('Удалить рабочее место'));

    expect(base.onRemove).toHaveBeenCalledWith('ws-1');
  });
});
