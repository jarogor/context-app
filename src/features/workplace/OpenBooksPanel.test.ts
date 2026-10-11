import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import OpenBooksPanel from './OpenBooksPanel.svelte';
import type { WorkspaceTab } from './workplace';

/** Вкладка с заданным оформлением. */
function tab(id: string, overrides: Partial<WorkspaceTab> = {}): WorkspaceTab {
    return {
        id,
        path: `/lib/${id}.epub`,
        title: `Книга ${id}`,
        format: 'epub',
        zoom: 100,
        position: 0,
        mode: 'scroll',
        ...overrides,
    };
}

/** Обработчики панели с заглушками по умолчанию. */
function handlers() {
    return {
        onSelect: vi.fn<(id: string) => void>(),
        onClose: vi.fn<(id: string) => void>(),
        onEditAppearance: vi.fn(),
    };
}

describe('панель открытых книг: оформление', () => {
    it('показывает имя, иконку, цвет и описание', () => {
        render(OpenBooksPanel, {
            props: {
                tabs: [tab('t1', { name: 'Черновик', description: 'сравнение глав', icon: 'star', color: 'blue' })],
                activeTabId: 't1',
                ...handlers(),
            },
        });

        expect(screen.getByText('Черновик')).toBeTruthy();
        expect(screen.getByTestId('open-books-item-description').textContent).toContain('сравнение глав');
        expect(screen.getByTestId('open-books-item').getAttribute('style')).toContain('#2563eb');
        expect(screen.getByText('Черновик').closest('button')?.querySelector('svg')).toBeTruthy();
    });

    it('оставляет прежний вид пункта без оформления', () => {
        render(OpenBooksPanel, {
            props: { tabs: [tab('t1')], activeTabId: 't1', ...handlers() },
        });

        expect(screen.getByText('Книга t1')).toBeTruthy();
        expect(screen.queryByTestId('open-books-item-description')).toBeNull();
        expect(screen.getByTestId('open-books-item').getAttribute('style')).not.toContain(
            'color-mix',
        );
    });

    it('отмечает активную вкладку и не несёт отдельной кнопки закрытия', () => {
        render(OpenBooksPanel, {
            props: { tabs: [tab('t1'), tab('t2')], activeTabId: 't2', ...handlers() },
        });

        const items = screen.getAllByTestId('open-books-item');
        expect(items[0].getAttribute('data-active')).toBe('false');
        expect(items[1].getAttribute('data-active')).toBe('true');
        // Отдельная кнопка закрытия убрана: закрытие — пункт меню оформления.
        expect(screen.queryByLabelText('Закрыть вкладку')).toBeNull();
    });
});

describe('панель открытых книг: поиск', () => {
    it('фильтрует по имени, названию книги и описанию', async () => {
        render(OpenBooksPanel, {
            props: {
                tabs: [
                    tab('t1', { name: 'Черновик' }),
                    tab('t2'),
                    tab('t3', { description: 'глубокий анализ' }),
                ],
                activeTabId: 't1',
                ...handlers(),
            },
        });
        const query = screen.getByLabelText('Поиск по вкладкам');

        await fireEvent.input(query, { target: { value: 'черновик' } });
        expect(screen.queryByText('Книга t2')).toBeNull();
        expect(screen.getByText('Черновик')).toBeTruthy();

        await fireEvent.input(query, { target: { value: 't2' } });
        expect(screen.getByText('Книга t2')).toBeTruthy();
        expect(screen.queryByText('Черновик')).toBeNull();

        await fireEvent.input(query, { target: { value: 'анализ' } });
        expect(screen.getByText('Книга t3')).toBeTruthy();
        expect(screen.queryByText('Книга t2')).toBeNull();
    });

    it('показывает пустое состояние поиска, не меняя состав вкладок', async () => {
        const tabs = [tab('t1'), tab('t2')];
        render(OpenBooksPanel, { props: { tabs, activeTabId: 't1', ...handlers() } });

        await fireEvent.input(screen.getByLabelText('Поиск по вкладкам'), {
            target: { value: 'нет такого' },
        });

        expect(screen.getByTestId('open-books-search-empty')).toBeTruthy();
        expect(tabs).toHaveLength(2);
    });
});

describe('панель открытых книг: правка оформления по пунктам меню', () => {
    it('выбор цвета вызывает правку только цвета', async () => {
        const base = handlers();
        render(OpenBooksPanel, {
            props: { tabs: [tab('t1', { color: 'red' })], activeTabId: 't1', ...base },
        });

        await fireEvent.click(screen.getByLabelText('Оформление вкладки'));
        await fireEvent.click(await screen.findByLabelText('синий'));

        expect(base.onEditAppearance).toHaveBeenCalledWith('t1', { color: 'blue' });
    });

    it('выбор иконки вызывает правку только иконки', async () => {
        const base = handlers();
        render(OpenBooksPanel, {
            props: { tabs: [tab('t1')], activeTabId: 't1', ...base },
        });

        await fireEvent.click(screen.getByLabelText('Оформление вкладки'));
        await fireEvent.click(await screen.findByTestId('menu-icon-star'));

        expect(base.onEditAppearance).toHaveBeenCalledWith('t1', { icon: 'star' });
    });

    it('правка названия сохраняет только имя', async () => {
        const base = handlers();
        render(OpenBooksPanel, {
            props: { tabs: [tab('t1')], activeTabId: 't1', ...base },
        });

        await fireEvent.click(screen.getByLabelText('Оформление вкладки'));
        await fireEvent.click(await screen.findByRole('menuitem', { name: 'Название' }));
        await fireEvent.input(screen.getByLabelText('Название вкладки'), {
            target: { value: 'Черновик' },
        });
        await fireEvent.click(screen.getByLabelText('Сохранить'));

        expect(base.onEditAppearance).toHaveBeenCalledWith('t1', { name: 'Черновик' });
        expect(screen.queryByLabelText('Название вкладки')).toBeNull();
    });

    it('правка описания сохраняет только описание', async () => {
        const base = handlers();
        render(OpenBooksPanel, {
            props: { tabs: [tab('t1', { name: 'Имя' })], activeTabId: 't1', ...base },
        });

        await fireEvent.click(screen.getByLabelText('Оформление вкладки'));
        await fireEvent.click(await screen.findByRole('menuitem', { name: 'Описание' }));
        await fireEvent.input(screen.getByLabelText('Описание вкладки'), {
            target: { value: 'сравнение глав' },
        });
        await fireEvent.click(screen.getByLabelText('Сохранить'));

        expect(base.onEditAppearance).toHaveBeenCalledWith('t1', { description: 'сравнение глав' });
    });

    it('отмена правки не сохраняет и не мешает открыть её снова', async () => {
        const base = handlers();
        render(OpenBooksPanel, {
            props: { tabs: [tab('t1', { name: 'Имя' })], activeTabId: 't1', ...base },
        });

        await fireEvent.click(screen.getByLabelText('Оформление вкладки'));
        await fireEvent.click(await screen.findByRole('menuitem', { name: 'Название' }));
        await fireEvent.input(screen.getByLabelText('Название вкладки'), { target: { value: 'X' } });
        await fireEvent.click(screen.getByLabelText('Отмена'));
        expect(base.onEditAppearance).not.toHaveBeenCalled();

        await fireEvent.click(screen.getByLabelText('Оформление вкладки'));
        await fireEvent.click(await screen.findByRole('menuitem', { name: 'Название' }));
        expect((screen.getByLabelText('Название вкладки') as HTMLInputElement).value).toBe('Имя');
    });

    it('очистка поля снимает свойство', async () => {
        const base = handlers();
        render(OpenBooksPanel, {
            props: { tabs: [tab('t1', { name: 'Имя' })], activeTabId: 't1', ...base },
        });

        await fireEvent.click(screen.getByLabelText('Оформление вкладки'));
        await fireEvent.click(await screen.findByRole('menuitem', { name: 'Название' }));
        await fireEvent.click(screen.getByLabelText('Очистить поле'));

        expect(base.onEditAppearance).toHaveBeenCalledWith('t1', { name: undefined });
    });

    it('сброс оформления очищает все поля вкладки', async () => {
        const base = handlers();
        render(OpenBooksPanel, {
            props: {
                tabs: [tab('t1', { name: 'Имя', description: 'Описание', icon: 'star', color: 'blue' })],
                activeTabId: 't1',
                ...base,
            },
        });

        await fireEvent.click(screen.getByLabelText('Оформление вкладки'));
        await fireEvent.click(await screen.findByRole('menuitem', { name: 'Сбросить оформление' }));

        expect(base.onEditAppearance).toHaveBeenCalledWith('t1', {
            name: undefined,
            description: undefined,
            icon: undefined,
            color: undefined,
        });
    });

    it('закрытие вкладки доступно пунктом контекстного меню', async () => {
        const base = handlers();
        render(OpenBooksPanel, {
            props: { tabs: [tab('t1')], activeTabId: 't1', ...base },
        });

        await fireEvent.click(screen.getByLabelText('Оформление вкладки'));
        await fireEvent.click(await screen.findByRole('menuitem', { name: 'Закрыть вкладку' }));

        expect(base.onClose).toHaveBeenCalledWith('t1');
        expect(base.onEditAppearance).not.toHaveBeenCalled();
    });
});
