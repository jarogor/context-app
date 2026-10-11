import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WorkplaceTabs from './WorkplaceTabs.svelte';
import { publishUserNotification } from '../notifications/notifications';
import type { WorkspaceTab } from './workplace';

vi.mock('../notifications/notifications', () => ({
    publishUserNotification: vi.fn(async () => undefined),
}));

/** Вкладка с заданным идентификатором и названием. */
function tab(id: string, title: string): WorkspaceTab {
    return {
        id,
        path: `/lib/${id}.epub`,
        title,
        format: 'epub',
        zoom: 100,
        position: 0,
        mode: 'scroll',
    };
}

/** Набор вкладок с последовательными названиями. */
function tabs(count: number): WorkspaceTab[] {
    return Array.from({ length: count }, (_, index) => tab(`t${index + 1}`, `Книга ${index + 1}`));
}

/** Обработчики панели с заглушками по умолчанию. */
function handlers() {
    return {
        openTabsLimit: 50,
        onSelect: vi.fn<(id: string) => void>(),
        onClose: vi.fn<(id: string) => void>(),
        onDuplicate: vi.fn<(id: string) => void>(),
        onAdd: vi.fn(),
        onAddFile: vi.fn(),
        onToggleBooks: vi.fn(),
        onToggleNotes: vi.fn(),
        onBackToList: vi.fn(),
    };
}

/** Задание ширины списка вкладок и масштаба для расчёта ёмкости. */
function mockWidth(width: number) {
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(width);
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
        fontSize: '16px',
    } as unknown as CSSStyleDeclaration);
}

/** Подсказка кнопки: берётся с ближайшей обёртки, несущей `title`.
 *
 * Подсказка выставляется обёртке, а не недоступной кнопке: собственная
 * подсказка `disabled`-кнопки не показывается.
 */
function wrapperTitle(el: Element): string | null {
    return el.closest('[title]')?.getAttribute('title') ?? null;
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(publishUserNotification).mockClear();
});

describe('панель вкладок: окно и навигация', () => {
    it('показывает навигацию, счётчик и закреплённые кнопки действий при переполнении', () => {
        mockWidth(368);
        render(WorkplaceTabs, {
            props: {
                tabs: tabs(7),
                activeTabId: 't1',
                booksOpen: false,
                notesOpen: false,
                ...handlers(),
            },
        });

        expect(screen.getByLabelText('Следующие вкладки')).toBeTruthy();
        expect(screen.getByLabelText('Предыдущие вкладки')).toBeTruthy();
        expect(screen.getByTestId('workplace-tabs-counter').textContent).toContain('1–3 из 7');
        // Кнопки открытия книги закреплены вне окна вкладок и видны.
        expect(screen.getByLabelText('Добавить книгу')).toBeTruthy();
        expect(screen.getByLabelText('Открыть файл с диска')).toBeTruthy();
    });

    it('навигация сдвигает видимый диапазон и счётчик', async () => {
        mockWidth(368);
        render(WorkplaceTabs, {
            props: {
                tabs: tabs(5),
                activeTabId: 't1',
                booksOpen: false,
                notesOpen: false,
                ...handlers(),
            },
        });

        expect(screen.getByTestId('workplace-tabs-counter').textContent).toContain('1–3 из 5');
        await fireEvent.click(screen.getByLabelText('Следующие вкладки'));

        expect(screen.getByTestId('workplace-tabs-counter').textContent).toContain('2–4 из 5');
        expect(
            screen.getAllByTestId('workplace-tab-item').map((el) => el.textContent?.trim()),
        ).toEqual(['Книга 2', 'Книга 3', 'Книга 4']);
    });

    it('навигация не меняет состав вкладок и активную вкладку', async () => {
        mockWidth(368);
        const base = handlers();
        render(WorkplaceTabs, {
            props: {
                tabs: tabs(5),
                activeTabId: 't1',
                booksOpen: false,
                notesOpen: false,
                ...base,
            },
        });

        await fireEvent.click(screen.getByLabelText('Следующие вкладки'));

        expect(screen.getAllByTestId('workplace-tab-item')).toHaveLength(3);
        expect(base.onSelect).not.toHaveBeenCalled();
        expect(base.onClose).not.toHaveBeenCalled();
        expect(base.onDuplicate).not.toHaveBeenCalled();
    });

    it('скрывает навигацию и счётчик, когда все вкладки помещаются', () => {
        mockWidth(250);
        render(WorkplaceTabs, {
            props: {
                tabs: tabs(2),
                activeTabId: 't1',
                booksOpen: false,
                notesOpen: false,
                ...handlers(),
            },
        });

        expect(screen.queryByLabelText('Следующие вкладки')).toBeNull();
        expect(screen.queryByLabelText('Предыдущие вкладки')).toBeNull();
        expect(screen.queryByTestId('workplace-tabs-counter')).toBeNull();
        expect(screen.getAllByTestId('workplace-tab-item')).toHaveLength(2);
    });

    it('сдвигает окно, чтобы показать активную вкладку за границей', async () => {
        mockWidth(368);
        const { rerender } = render(WorkplaceTabs, {
            props: {
                tabs: tabs(5),
                activeTabId: 't1',
                booksOpen: false,
                notesOpen: false,
                ...handlers(),
            },
        });
        expect(screen.queryByText('Книга 5')).toBeNull();

        await rerender({
            tabs: tabs(5),
            activeTabId: 't5',
            booksOpen: false,
            notesOpen: false,
            ...handlers(),
        });

        expect(screen.getByText('Книга 5')).toBeTruthy();
        expect(screen.getByTestId('workplace-tabs-counter').textContent).toContain('3–5 из 5');
    });
});

describe('панель вкладок: лимит открытых вкладок', () => {
    it('оставляет открытие и дублирование доступными ниже лимита', () => {
        mockWidth(250);
        render(WorkplaceTabs, {
            props: {
                tabs: tabs(2),
                activeTabId: 't1',
                booksOpen: false,
                notesOpen: false,
                ...handlers(),
                openTabsLimit: 5,
            },
        });

        const add = screen.getByLabelText('Добавить книгу') as HTMLButtonElement;
        const addFile = screen.getByLabelText('Открыть файл с диска') as HTMLButtonElement;
        expect(add.disabled).toBe(false);
        expect(addFile.disabled).toBe(false);
        expect(wrapperTitle(add)).toBe('Добавить книгу');
        expect(publishUserNotification).not.toHaveBeenCalled();
    });

    it('блокирует открытие и дублирование при достижении лимита', async () => {
        mockWidth(250);
        render(WorkplaceTabs, {
            props: {
                tabs: tabs(3),
                activeTabId: 't1',
                booksOpen: false,
                notesOpen: false,
                ...handlers(),
                openTabsLimit: 3,
            },
        });

        const add = screen.getByLabelText('Добавить книгу') as HTMLButtonElement;
        expect(add.disabled).toBe(true);
        expect(wrapperTitle(add)).toBe('Достигнут лимит открытых вкладок');
        expect(add.className).not.toContain('text-destructive');

        const duplicate = screen.getAllByLabelText('Дублировать вкладку')[0] as HTMLButtonElement;
        expect(duplicate.disabled).toBe(true);
        expect(wrapperTitle(duplicate)).toBe('Достигнут лимит открытых вкладок');
        // Достижение лимита ещё не превышение: уведомление не публикуется.
        await Promise.resolve();
        expect(publishUserNotification).not.toHaveBeenCalled();
    });

    it('выделяет превышение и публикует пояснение один раз', async () => {
        mockWidth(250);
        const { rerender } = render(WorkplaceTabs, {
            props: {
                tabs: tabs(5),
                activeTabId: 't1',
                booksOpen: false,
                notesOpen: false,
                ...handlers(),
                openTabsLimit: 5,
            },
        });

        await rerender({
            tabs: tabs(5),
            activeTabId: 't1',
            booksOpen: false,
            notesOpen: false,
            ...handlers(),
            openTabsLimit: 3,
        });

        const add = screen.getByLabelText('Добавить книгу') as HTMLButtonElement;
        expect(add.disabled).toBe(true);
        expect(wrapperTitle(add)).toBe('Превышен лимит открытых вкладок');
        expect(add.className).toContain('text-destructive');

        // Кнопка дублирования вкладки тоже выделяется как превышение.
        const duplicate = screen.getAllByLabelText('Дублировать вкладку')[0] as HTMLButtonElement;
        expect(duplicate.disabled).toBe(true);
        expect(duplicate.className).toContain('text-destructive');
        expect(wrapperTitle(duplicate)).toBe('Превышен лимит открытых вкладок');

        // Повторный рендер при том же превышении не публикует запись дважды.
        await rerender({
            tabs: tabs(5),
            activeTabId: 't1',
            booksOpen: false,
            notesOpen: false,
            ...handlers(),
            openTabsLimit: 3,
        });
        expect(publishUserNotification).toHaveBeenCalledTimes(1);

        // Возврат в предел снимает выделение и подсказку о превышении.
        await rerender({
            tabs: tabs(2),
            activeTabId: 't1',
            booksOpen: false,
            notesOpen: false,
            ...handlers(),
            openTabsLimit: 3,
        });
        const relaxed = screen.getByLabelText('Добавить книгу') as HTMLButtonElement;
        expect(relaxed.disabled).toBe(false);
        expect(wrapperTitle(relaxed)).toBe('Добавить книгу');
        expect(relaxed.className).not.toContain('text-destructive');
    });
});
