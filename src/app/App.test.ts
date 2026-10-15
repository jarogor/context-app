import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App.svelte';
import { DEFAULT_PALETTE } from '@texture/ui';
import {
    emptyRegistry,
    createWorkspace,
    type WorkspaceRegistry,
} from '../features/workplace/workspace-registry';

vi.mock('../shared/app-bridge', () => ({
    invokeCommand: vi.fn(async () => null),
    listenEvent: vi.fn(async () => () => {}),
    openDialog: vi.fn(async () => null),
}));

import { invokeCommand, listenEvent } from '../shared/app-bridge';

const invoke = vi.mocked(invokeCommand);
const listen = vi.mocked(listenEvent);

/** Событие хранилища заметок, перехваченное оболочкой. */
let notesChanged: ((value: unknown) => void) | undefined;

/** Событие изменения настроек, перехваченное оболочкой. */
let settingsChanged: ((value: unknown) => void) | undefined;

/** Наборы, которые вернёт хранилище на запрос реестра при открытии раздела. */
let notesSets: Array<Record<string, unknown>> = [];

/** Набор реестра в ответе хранилища. */
function aggregateSet(overrides: Record<string, unknown> = {}) {
    return {
        id: 'ns-1',
        book_key: '/lib/a.epub',
        book_title: 'Книга A',
        name: 'Основные',
        created_at_millis: 1,
        notes: [],
        ...overrides,
    };
}

/** Свойства оболочки; реестр заметок читается при открытии раздела. */
function appProps(sets: Array<Record<string, unknown>> = []) {
    notesSets = sets;
    return {
        initialRegistry: emptyRegistry() as WorkspaceRegistry,
        initialLibrary: null,
        initialAppearance: {
            theme: 'system' as const,
            palette: DEFAULT_PALETTE,
            readerTheme: 'light' as const,
        },
        initialSettings: { declarations: [], error: '' },
        initialNotifications: { entries: [], technicalVisible: false, error: '' },
        initialStore: { plugins: [], stores: [], activationPending: false, error: '' },
        initialOpenTabsLimit: 50,
    };
}

beforeEach(() => {
    notesChanged = undefined;
    settingsChanged = undefined;
    notesSets = [];
    invoke.mockReset();
    listen.mockReset();
    invoke.mockImplementation(async (command: string, args?: unknown) => {
        const payload = (args ?? {}) as { capability?: string; operation?: string };
        if (
            command === 'invoke_base_plugin_operation' &&
            payload.capability === 'notes.store@1' &&
            payload.operation === 'list_all_sets'
        ) {
            return { sets: notesSets };
        }
        return null;
    });
    listen.mockImplementation(async (event, handler) => {
        if (event === 'notes:changed') {
            notesChanged = handler;
        }
        if (event === 'settings:changed') {
            settingsChanged = handler;
        }
        return () => {};
    });
});

describe('раздел «Заметки» в оболочке', () => {
    it('не читает реестр, пока раздел не открыт', async () => {
        render(App, { props: appProps([aggregateSet()]) });

        // До открытия раздела запроса реестра нет.
        expect(
            invoke.mock.calls.some(
                ([command, args]) =>
                    command === 'invoke_base_plugin_operation' &&
                    (args as { operation?: string })?.operation === 'list_all_sets',
            ),
        ).toBe(false);

        await fireEvent.click(screen.getByLabelText('Реестр заметок'));

        await waitFor(() =>
            expect(
                invoke.mock.calls.some(
                    ([command, args]) =>
                        command === 'invoke_base_plugin_operation' &&
                        (args as { operation?: string })?.operation === 'list_all_sets',
                ),
            ).toBe(true),
        );
    });

    it('открывается кнопкой-иконкой, показывает заголовок и реестр', async () => {
        render(App, { props: appProps() });

        await fireEvent.click(screen.getByLabelText('Реестр заметок'));

        expect(screen.getByText('Заметки')).toBeTruthy();
        expect(screen.getByTestId('notes-library')).toBeTruthy();
    });

    it('показывает реестр, прочитанный при открытии раздела', async () => {
        render(App, { props: appProps([aggregateSet()]) });

        await fireEvent.click(screen.getByLabelText('Реестр заметок'));

        await waitFor(() => expect(screen.getByTestId('notes-library-book')).toBeTruthy());
        expect(screen.getByText('Книга A')).toBeTruthy();
    });

    it('перечитывает реестр по событию notes:changed', async () => {
        render(App, { props: appProps([]) });
        await fireEvent.click(screen.getByLabelText('Реестр заметок'));
        await waitFor(() => expect(screen.getByTestId('notes-library')).toBeTruthy());
        expect(screen.getByTestId('notes-library-empty')).toBeTruthy();

        notesSets = [aggregateSet({ book_title: 'Обновлённая книга' })];
        notesChanged?.({ book_key: '/lib/a.epub', set_id: 'ns-1' });

        await waitFor(() => expect(screen.getByText('Обновлённая книга')).toBeTruthy());
    });

    it('передаёт интенты перехода в реестр', async () => {
        render(App, { props: appProps([aggregateSet()]) });

        await fireEvent.click(screen.getByLabelText('Реестр заметок'));
        await waitFor(() => expect(screen.getByTestId('notes-library-set')).toBeTruthy());
        const registry = screen.getByTestId('notes-library');
        const section = within(registry).getByTestId('notes-library-set');
        await fireEvent.click(within(section).getByTestId('notes-library-set-toggle'));
        expect(within(section).getByTestId('notes-library-set-empty')).toBeTruthy();
    });

    it('открывает книгу набора в рабочем месте и запоминает активный набор', async () => {
        const registry = createWorkspace(emptyRegistry(), 'Моё место');
        const calls: Array<Record<string, unknown>> = [];
        invoke.mockImplementation(async (command: string, args?: unknown) => {
            if (command === 'invoke_base_plugin_operation') {
                const payload = (args ?? {}) as {
                    capability?: string;
                    operation?: string;
                };
                calls.push(payload as Record<string, unknown>);
                if (
                    payload.capability === 'notes.store@1' &&
                    payload.operation === 'list_all_sets'
                ) {
                    return { sets: [aggregateSet()] };
                }
            }
            return null;
        });

        render(App, {
            props: {
                ...appProps(),
                initialRegistry: registry,
            },
        });

        await fireEvent.click(screen.getByLabelText('Реестр заметок'));
        await waitFor(() => expect(screen.getByTestId('notes-library-set')).toBeTruthy());
        await fireEvent.click(screen.getByLabelText('Действия с набором заметок'));
        await fireEvent.click(await screen.findByText('Открыть книгу'));

        // Раздел реестра закрылся, рабочее место показывает вкладку книги.
        await waitFor(() => expect(screen.queryByTestId('notes-library')).toBeNull());
        expect(screen.getByTestId('workplace-surface')).toBeTruthy();
        expect(
            within(screen.getByTestId('workplace-surface')).getAllByText('Книга A').length,
        ).toBeGreaterThan(0);
        // Активный набор книги сохранён до загрузки заметок.
        await waitFor(() =>
            expect(
                calls.some(
                    (call) =>
                        call.operation === 'set_active' &&
                        (call.payload as { book_key?: string })?.book_key === '/lib/a.epub',
                ),
            ).toBe(true),
        );
    });

    it('сообщает о книге набора без файла', async () => {
        render(App, {
            props: appProps([aggregateSet({ book_key: 'no-library', book_title: 'Без книги' })]),
        });

        await fireEvent.click(screen.getByLabelText('Реестр заметок'));
        await waitFor(() => expect(screen.getByTestId('notes-library-set')).toBeTruthy());
        await fireEvent.click(screen.getByLabelText('Действия с набором заметок'));
        await fireEvent.click(await screen.findByText('Открыть книгу'));

        // Раздел остаётся открытым и показывает диагностику недоступности.
        expect(screen.getByTestId('notes-library-error').textContent).toContain('недоступна');
    });
});

describe('тема области чтения в оболочке', () => {
    it('применяется событием settings:changed, не меняя тему интерфейса', async () => {
        document.documentElement.removeAttribute('data-reader-theme');
        document.documentElement.removeAttribute('data-theme');
        render(App, { props: appProps() });

        await waitFor(() => expect(settingsChanged).toBeTypeOf('function'));
        const themeBefore = document.documentElement.dataset.theme;
        settingsChanged?.({ section: 'app.general', values: { 'reader.theme': 'dark' } });

        await waitFor(() =>
            expect(document.documentElement.dataset.readerTheme).toBe('dark'),
        );
        expect(document.documentElement.dataset.theme).toBe(themeBefore);
    });

    it('применяет изменение лимита вкладок событием settings:changed', async () => {
        const registry: WorkspaceRegistry = {
            workspaces: [
                {
                    id: 'ws-1',
                    name: 'Рабочее место',
                    createdAtMillis: 0,
                    tabs: [
                        {
                            id: 't1',
                            path: '/lib/a.epub',
                            title: 'Книга A',
                            format: 'epub',
                            zoom: 100,
                            position: 0,
                            mode: 'scroll',
                        },
                        {
                            id: 't2',
                            path: '/lib/b.epub',
                            title: 'Книга B',
                            format: 'epub',
                            zoom: 100,
                            position: 0,
                            mode: 'scroll',
                        },
                    ],
                    activeTabId: 't1',
                },
            ],
            currentWorkspaceId: 'ws-1',
        };
        render(App, { props: { ...appProps(), initialRegistry: registry } });
        await fireEvent.click(screen.getByLabelText('Рабочее место'));
        await fireEvent.click(screen.getByTestId('workspace-open'));
        await waitFor(() => expect(settingsChanged).toBeTypeOf('function'));

        // Изначально открытие доступно: лимит по умолчанию 50 больше одной вкладки.
        expect((screen.getByLabelText('Добавить книгу') as HTMLButtonElement).disabled).toBe(false);

        // Лимит уменьшен ниже уже открытого числа вкладок: превышение.
        settingsChanged?.({
            section: 'app.general',
            values: { 'window.open_tabs_limit': 0 },
        });

        await waitFor(() =>
            expect(
                (screen.getByLabelText('Добавить книгу') as HTMLButtonElement).disabled,
            ).toBe(true),
        );
        expect(
            (
                screen.getByLabelText('Добавить книгу').closest('[title]') as HTMLElement
            ).getAttribute('title'),
        ).toBe('Превышен лимит открытых вкладок');
    });
});

describe('порядок кнопок верхней панели', () => {
    /** Метки кнопок шапки в порядке слева направо. */
    function headerLabels(): string[] {
        const header = document.querySelector('header') as HTMLElement;
        return Array.from(header.querySelectorAll('button')).map(
            (node) => node.getAttribute('aria-label') ?? '',
        );
    }

    it('логотип стоит у левого края, а настройки уехали вправо', async () => {
        render(App, { props: appProps() });

        const header = document.querySelector('header') as HTMLElement;
        const children = Array.from(header.children);
        // Первый ребёнок шапки — логотип: слева кнопок больше нет.
        expect(children[0]?.textContent).toContain('Текстура');
        // Кнопка настроек — последняя в правой группе.
        expect(headerLabels().at(-1)).toBe('Настройки');
    });

    it('правая группа идёт: рабочее место, библиотеки, заметки, тема, уведомления, настройки', async () => {
        render(App, { props: appProps() });

        const labels = headerLabels().filter((label) =>
            [
                'Настройки',
                'Рабочее место',
                'Библиотеки',
                'Реестр заметок',
                'Переключить тему',
                'Уведомления',
            ].includes(label),
        );
        expect(labels).toEqual([
            'Рабочее место',
            'Библиотеки',
            'Реестр заметок',
            'Переключить тему',
            'Уведомления',
            'Настройки',
        ]);
    });
});

describe('активность кнопки рабочего места', () => {
    /** Реестр с одним рабочим местом и одной вкладкой книги. */
    function registryWithWorkspace(): WorkspaceRegistry {
        return {
            workspaces: [
                {
                    id: 'ws-1',
                    name: 'Рабочее место',
                    createdAtMillis: 0,
                    tabs: [
                        {
                            id: 't1',
                            path: '/lib/a.epub',
                            title: 'Книга A',
                            format: 'epub',
                            zoom: 100,
                            position: 0,
                            mode: 'scroll',
                        },
                    ],
                    activeTabId: 't1',
                },
            ],
            currentWorkspaceId: 'ws-1',
        };
    }

    /** Признак нажатого состояния кнопки рабочего места в шапке. */
    function workspacePressed(): string | null {
        return screen.getByLabelText('Рабочее место').getAttribute('aria-pressed');
    }

    it('активна в списке, не активна в открытом месте и вновь активна при возврате', async () => {
        render(App, {
            props: { ...appProps(), initialRegistry: registryWithWorkspace() },
        });

        // Старт: показан список рабочих мест — кнопка нажата.
        expect(workspacePressed()).toBe('true');

        // Открытие конкретного места: кнопка перестаёт выглядеть нажатой.
        await fireEvent.click(screen.getByTestId('workspace-open'));
        expect(workspacePressed()).toBe('false');

        // Возврат к списку кнопкой в панели вкладок: кнопка снова нажата.
        await fireEvent.click(screen.getByLabelText('К списку рабочих мест'));
        expect(workspacePressed()).toBe('true');
    });

    it('нажатие из открытого места возвращает к списку, а повторное нажатие оставляет список', async () => {
        render(App, {
            props: { ...appProps(), initialRegistry: registryWithWorkspace() },
        });

        await fireEvent.click(screen.getByTestId('workspace-open'));
        expect(screen.getByTestId('workplace-tabs')).toBeTruthy();
        expect(workspacePressed()).toBe('false');

        // Нажатие кнопки из открытого места возвращает к списку, не закрывая раздел.
        await fireEvent.click(screen.getByLabelText('Рабочее место'));
        expect(screen.getByTestId('workspaces-page')).toBeTruthy();
        expect(workspacePressed()).toBe('true');

        // Повторное нажатие в списке ничего не меняет: список остаётся главной
        // страницей, а кнопка не «отжимается».
        await fireEvent.click(screen.getByLabelText('Рабочее место'));
        expect(workspacePressed()).toBe('true');
        expect(screen.getByTestId('workspaces-page')).toBeTruthy();
        expect(screen.getByTestId('workplace-surface').closest('.hidden')).toBeNull();
    });

    it('повторное нажатие по активной кнопке раздела возвращает к списку рабочих мест', async () => {
        render(App, {
            props: { ...appProps(), initialRegistry: registryWithWorkspace() },
        });

        // Раздел «Библиотеки»: повторное нажатие закрывает его и показывает список.
        await fireEvent.click(screen.getByLabelText('Библиотеки'));
        expect(screen.getByTestId('libraries-page')).toBeTruthy();
        await fireEvent.click(screen.getByLabelText('Библиотеки'));
        expect(screen.getByTestId('libraries-page').closest('.hidden')).toBeTruthy();
        expect(screen.getByTestId('workspaces-page')).toBeTruthy();

        // Раздел «Заметки»: то же поведение.
        await fireEvent.click(screen.getByLabelText('Реестр заметок'));
        expect(screen.getByTestId('notes-library')).toBeTruthy();
        await fireEvent.click(screen.getByLabelText('Реестр заметок'));
        expect(screen.queryByTestId('notes-library')).toBeNull();
        expect(screen.getByTestId('workspaces-page')).toBeTruthy();
    });
});

describe('полноэкранный раздел настроек', () => {
    /** Текущая видимость шапки каркаса в jsdom (по классу `hidden`). */
    function headerHidden(): boolean {
        return (document.querySelector('header') as HTMLElement).classList.contains('hidden');
    }

    it('открывается на всё окно без верхней панели', async () => {
        render(App, { props: appProps() });

        expect(headerHidden()).toBe(false);

        await fireEvent.click(screen.getByLabelText('Настройки'));

        // Полноэкранные настройки: шапка с кнопками разделов скрыта.
        expect(headerHidden()).toBe(true);
        expect(screen.getByTestId('settings-page')).toBeTruthy();
    });

    it('закрывается кнопкой в углу и возвращает прежнюю поверхность', async () => {
        render(App, { props: appProps() });
        await fireEvent.click(screen.getByLabelText('Настройки'));
        expect(headerHidden()).toBe(true);

        await fireEvent.click(screen.getByLabelText('Закрыть настройки'));

        // Раздел настроек скрыт, шапка вернулась.
        expect(screen.getByTestId('settings-page').closest('.hidden')).toBeTruthy();
        expect(headerHidden()).toBe(false);
    });

    it('закрывается клавишей Escape', async () => {
        render(App, { props: appProps() });
        await fireEvent.click(screen.getByLabelText('Настройки'));
        expect(headerHidden()).toBe(true);

        await fireEvent.keyDown(window, { key: 'Escape' });

        expect(screen.getByTestId('settings-page').closest('.hidden')).toBeTruthy();
        expect(headerHidden()).toBe(false);
    });

    it('возвращает поверхность, из которой настройки открывали', async () => {
        render(App, { props: appProps() });

        // Открываем раздел «Заметки», затем из него — настройки.
        await fireEvent.click(screen.getByLabelText('Реестр заметок'));
        expect(screen.getByTestId('notes-library')).toBeTruthy();
        await fireEvent.click(screen.getByLabelText('Настройки'));
        await fireEvent.click(screen.getByLabelText('Закрыть настройки'));

        // Возврат не пустой основной раздел: прежняя поверхность сохранена.
        expect(screen.getByTestId('notes-library')).toBeTruthy();
    });
});
