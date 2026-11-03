import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WorkplaceTabs from './WorkplaceTabs.svelte';
import { logEvent } from '../../shared/app-log';
import type { WorkspaceTab } from './workplace';

vi.mock('../../shared/app-log', () => ({
    logEvent: vi.fn(async () => undefined),
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
    vi.mocked(logEvent).mockClear();
});

describe('панель вкладок: окно и навигация', () => {
    it('показывает навигацию, счётчик и закреплённые кнопки действий при переполнении', () => {
        mockWidth(480);
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
        mockWidth(480);
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
        // Номер вкладки — её место в составе места, а не порядок в окне: при
        // листании номера не «переезжают».
        expect(
            screen.getAllByTestId('workplace-tab-item').map((el) => el.textContent?.trim()),
        ).toEqual(['2  Книга 2', '3  Книга 3', '4  Книга 4']);
    });

    it('навигация не меняет состав вкладок и активную вкладку', async () => {
        mockWidth(480);
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
        mockWidth(320);
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
        mockWidth(480);
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

describe('панель вкладок: оформление вкладки', () => {
    /** Вкладка с заданным пользовательским оформлением. */
    function decorated(): WorkspaceTab {
        return {
            ...tab('t1', 'Книга 1'),
            name: 'Черновик',
            description: 'сравнение глав',
            icon: 'star',
            color: 'blue',
        };
    }

    it('показывает имя, иконку, цвет и описание в подсказке', () => {
        mockWidth(320);
        render(WorkplaceTabs, {
            props: {
                tabs: [decorated()],
                activeTabId: 't1',
                booksOpen: false,
                notesOpen: false,
                ...handlers(),
            },
        });

        const item = screen.getAllByTestId('workplace-tab')[0];
        expect(item.textContent).toContain('Черновик');
        expect(item.querySelector('svg')).toBeTruthy();
        expect(item.getAttribute('title')).toBe('Черновик (Книга 1)');
        const box = screen.getAllByTestId('workplace-tab-item')[0];
        expect(box.getAttribute('style')).toContain('#2563eb');
    });

    it('даёт неактивной вкладке фон, отличный от полосы', () => {
        // Дефект: неактивная вкладка без цвета сливалась с полосой, потому что
        // фон у неё отсутствовал. Фон общий для всех неактивных вкладок.
        mockWidth(320);
        render(WorkplaceTabs, {
            props: {
                tabs: [tab('t1', 'Книга 1'), tab('t2', 'Книга 2')],
                activeTabId: 't1',
                booksOpen: false,
                notesOpen: false,
                ...handlers(),
            },
        });
        const [active, inactive] = screen.getAllByTestId('workplace-tab-item');
        // Активная — как активный пункт раздела в шапке: акцентная заливка и
        // светлый текст поверх неё. Неактивная — общий фон, отличный от полосы.
        expect(active.className).toContain('bg-[var(--primary)]');
        expect(active.className).toContain('text-[var(--primary-foreground)]');
        expect(inactive.className).toContain('bg-[var(--tab-idle-surface)]');
    });

    it('заливает неактивную цветную вкладку поверх общего фона', () => {
        // Цветная неактивная отличается от нецветной только слабым оттенком
        // цвета, а основа у них одна — фон неактивной вкладки.
        mockWidth(320);
        render(WorkplaceTabs, {
            props: {
                tabs: [tab('t1', 'Книга 1'), { ...decorated(), id: 't2' }],
                activeTabId: 't1',
                booksOpen: false,
                notesOpen: false,
                ...handlers(),
            },
        });
        const [, colored] = screen.getAllByTestId('workplace-tab-item');
        expect(colored.className).toContain('bg-[var(--tab-fill)]');
        expect(colored.getAttribute('style')).toContain('var(--tab-idle-surface)');
    });

    it('заливает активную цветную вкладку плотнее неактивной', () => {
        // Активная заливается заметно плотнее: 40% цвета против 7% у неактивной.
        mockWidth(320);
        render(WorkplaceTabs, {
            props: {
                tabs: [tab('t1', 'Книга 1'), { ...decorated(), id: 't2' }],
                activeTabId: 't2',
                booksOpen: false,
                notesOpen: false,
                ...handlers(),
            },
        });
        const active = screen.getAllByTestId('workplace-tab-item')[1];
        expect(active.className).toContain('bg-[var(--tab-fill-active)]');
        expect(active.getAttribute('style')).toContain(
            '--tab-fill-active: color-mix(in oklab, #2563eb 40%',
        );
    });

    it('оставляет прежний вид вкладки без оформления', () => {
        mockWidth(320);
        render(WorkplaceTabs, {
            props: {
                tabs: [tab('t1', 'Книга 1')],
                activeTabId: 't1',
                booksOpen: false,
                notesOpen: false,
                ...handlers(),
            },
        });

        const item = screen.getAllByTestId('workplace-tab')[0];
        expect(item.textContent).toContain('Книга 1');
        expect(item.querySelector('svg')).toBeNull();
        expect(item.getAttribute('title')).toBe('Книга 1');
        expect(screen.getAllByTestId('workplace-tab-item')[0].getAttribute('style')).not.toContain(
            'color-mix',
        );
    });
});

describe('панель вкладок: подтверждение закрытия', () => {
    it('открывает подтверждение по кнопке закрытия и не закрывает вкладку сразу', async () => {
        mockWidth(320);
        const base = handlers();
        render(WorkplaceTabs, {
            props: {
                tabs: tabs(2),
                activeTabId: 't1',
                booksOpen: false,
                notesOpen: false,
                ...base,
            },
        });

        await fireEvent.click(screen.getAllByTestId('workplace-tab-close')[1]);

        expect(screen.getByTestId('workplace-tab-close-question')).toBeTruthy();
        // Крестика в диалоге нет: закрыть окно можно кнопкой «Нет».
        expect(screen.queryByLabelText('Закрыть')).toBeNull();
        expect(screen.getByText('Да')).toBeTruthy();
        expect(screen.getByText('Нет')).toBeTruthy();
        expect(base.onClose).not.toHaveBeenCalled();
    });

    it('подтверждение закрывает запомненную вкладку', async () => {
        mockWidth(320);
        const base = handlers();
        render(WorkplaceTabs, {
            props: {
                tabs: tabs(2),
                activeTabId: 't1',
                booksOpen: false,
                notesOpen: false,
                ...base,
            },
        });

        await fireEvent.click(screen.getAllByTestId('workplace-tab-close')[1]);
        await fireEvent.click(screen.getByText('Да'));

        expect(base.onClose).toHaveBeenCalledWith('t2');
        expect(base.onSelect).not.toHaveBeenCalled();
        expect(base.onDuplicate).not.toHaveBeenCalled();
        expect(screen.queryByTestId('workplace-tab-close-question')).toBeNull();
    });

    it('отмена подтверждения не меняет состав вкладок', async () => {
        mockWidth(320);
        const base = handlers();
        render(WorkplaceTabs, {
            props: {
                tabs: tabs(2),
                activeTabId: 't1',
                booksOpen: false,
                notesOpen: false,
                ...base,
            },
        });

        await fireEvent.click(screen.getAllByTestId('workplace-tab-close')[1]);
        await fireEvent.click(screen.getByText('Нет'));

        expect(base.onClose).not.toHaveBeenCalled();
        expect(screen.queryByTestId('workplace-tab-close-question')).toBeNull();
    });

    it('иконки дублирования и закрытия остаются у вкладки', () => {
        mockWidth(320);
        render(WorkplaceTabs, {
            props: {
                tabs: tabs(1),
                activeTabId: 't1',
                booksOpen: false,
                notesOpen: false,
                ...handlers(),
            },
        });

        expect(screen.getByLabelText('Дублировать вкладку')).toBeTruthy();
        expect(screen.getByTestId('workplace-tab-close')).toBeTruthy();
    });

    it('подпись кнопки панели заметок — «Заметки»', () => {
        mockWidth(320);
        render(WorkplaceTabs, {
            props: {
                tabs: tabs(1),
                activeTabId: 't1',
                booksOpen: false,
                notesOpen: false,
                ...handlers(),
            },
        });

        expect(screen.getByTestId('workplace-notes-toggle').getAttribute('aria-label')).toBe(
            'Заметки',
        );
    });

    it('подпись кнопки панели списка — «Вкладки»', () => {
        mockWidth(320);
        render(WorkplaceTabs, {
            props: {
                tabs: tabs(1),
                activeTabId: 't1',
                booksOpen: false,
                notesOpen: false,
                ...handlers(),
            },
        });

        expect(screen.getByLabelText('Вкладки')).toBeTruthy();
    });
});

describe('панель вкладок: лимит открытых вкладок', () => {
    it('оставляет открытие и дублирование доступными ниже лимита', () => {
        mockWidth(320);
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
        expect(logEvent).not.toHaveBeenCalled();
    });

    it('блокирует открытие и дублирование при достижении лимита', async () => {
        mockWidth(320);
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
        // Достижение лимита ещё не превышение: в журнал ничего не пишется.
        await Promise.resolve();
        expect(logEvent).not.toHaveBeenCalled();
    });

    it('выделяет превышение и пишет пояснение в журнал один раз', async () => {
        mockWidth(320);
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

        // Повторный рендер при том же превышении не пишет запись дважды.
        await rerender({
            tabs: tabs(5),
            activeTabId: 't1',
            booksOpen: false,
            notesOpen: false,
            ...handlers(),
            openTabsLimit: 3,
        });
        expect(logEvent).toHaveBeenCalledTimes(1);

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
