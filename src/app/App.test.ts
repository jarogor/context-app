import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App.svelte';
import { DEFAULT_PALETTE } from '@context/ui';
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
            readerFont: 'serif' as const,
            locale: 'ru' as const,
        },
        initialSettings: { declarations: [], error: '' },
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

        await fireEvent.click(screen.getByTestId('nav-notes'));

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

    it('открывается кнопкой-иконкой, показывает раздел в навигационном тексте', async () => {
        render(App, { props: appProps() });

        await fireEvent.click(screen.getByTestId('nav-notes'));

        expect(screen.getByTestId('app-context').textContent).toContain('Заметки');
        expect(screen.getByTestId('notes-library')).toBeTruthy();
    });

    it('показывает реестр, прочитанный при открытии раздела', async () => {
        render(App, { props: appProps([aggregateSet()]) });

        await fireEvent.click(screen.getByTestId('nav-notes'));

        await waitFor(() => expect(screen.getByTestId('notes-library-book')).toBeTruthy());
        expect(screen.getByText('Книга A')).toBeTruthy();
    });

    it('перечитывает реестр по событию notes:changed', async () => {
        render(App, { props: appProps([]) });
        await fireEvent.click(screen.getByTestId('nav-notes'));
        await waitFor(() => expect(screen.getByTestId('notes-library')).toBeTruthy());
        expect(screen.getByTestId('notes-library-empty')).toBeTruthy();

        notesSets = [aggregateSet({ book_title: 'Обновлённая книга' })];
        notesChanged?.({ book_key: '/lib/a.epub', set_id: 'ns-1' });

        await waitFor(() => expect(screen.getByText('Обновлённая книга')).toBeTruthy());
    });

    it('передаёт интенты перехода в реестр', async () => {
        render(App, { props: appProps([aggregateSet()]) });

        await fireEvent.click(screen.getByTestId('nav-notes'));
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

        await fireEvent.click(screen.getByTestId('nav-notes'));
        await waitFor(() => expect(screen.getByTestId('notes-library-set')).toBeTruthy());
        await fireEvent.click(screen.getByLabelText('Действия с набором заметок'));
        await fireEvent.click(await screen.findByText('Открыть книгу'));

        // Раздел реестра закрылся, рабочее место показывает вкладку книги.
        await waitFor(() => expect(screen.queryByTestId('notes-library')).toBeNull());
        expect(screen.getByTestId('workplace-area')).toBeTruthy();
        expect(
            within(screen.getByTestId('workplace-area')).getAllByText('Книга A').length,
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

        await fireEvent.click(screen.getByTestId('nav-notes'));
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
        await fireEvent.click(screen.getByTestId('nav-workspace'));
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

describe('состав меню разделов', () => {
    /** Метки пунктов верхней панели и навигации в порядке слева направо. */
    function navLabels(): string[] {
        const bar = document.querySelector('[data-testid="app-bar"]') as HTMLElement;
        const nav = bar.querySelector('[data-testid="section-nav"]') as HTMLElement;
        return Array.from(nav.querySelectorAll('button')).map(
            (node) => node.getAttribute('aria-label') ?? '',
        );
    }

    /** Метки служебных действий верхней панели. */
    function serviceLabels(): string[] {
        const bar = document.querySelector('[data-testid="app-bar"]') as HTMLElement;
        return Array.from(bar.querySelectorAll('[data-testid^="nav-"]')).map(
            (node) => node.getAttribute('aria-label') ?? '',
        );
    }

    it('содержит разделы и служебные пункты', async () => {
        render(App, { props: appProps() });

        const labels = navLabels();
        expect(labels).toContain('Рабочее место');
        expect(labels).toContain('Библиотека');
        expect(labels).toContain('Заметки');
        const service = serviceLabels();
        expect(service).toContain('Настройки');
        // Ленты уведомлений нет: в шапке остаются только тема и настройки.
        expect(service).not.toContain('Уведомления');
    });

    it('разделы идут в порядке: рабочие места, библиотека, заметки', async () => {
        render(App, { props: appProps() });

        const labels = navLabels().filter((label) =>
            ['Рабочее место', 'Библиотека', 'Заметки'].includes(label),
        );
        expect(labels).toEqual(['Рабочее место', 'Библиотека', 'Заметки']);
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
        return screen.getByTestId('nav-workspace').getAttribute('aria-pressed');
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

        // Возврат к списку кнопкой раздела в шапке: она снова нажата.
        await fireEvent.click(screen.getByTestId('nav-workspace'));
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
        await fireEvent.click(screen.getByTestId('nav-workspace'));
        expect(screen.getByTestId('workspaces-page')).toBeTruthy();
        expect(workspacePressed()).toBe('true');

        // Повторное нажатие в списке ничего не меняет: список остаётся главной
        // страницей, а кнопка не «отжимается».
        await fireEvent.click(screen.getByTestId('nav-workspace'));
        expect(workspacePressed()).toBe('true');
        expect(screen.getByTestId('workspaces-page')).toBeTruthy();
        expect(screen.getByTestId('workplace-area').closest('.hidden')).toBeNull();
    });

    it('повторное нажатие по активной кнопке раздела не «отжимает» её', async () => {
        render(App, {
            props: { ...appProps(), initialRegistry: registryWithWorkspace() },
        });

        // Раздел «Библиотеки»: повторное нажатие оставляет раздел открытым.
        await fireEvent.click(screen.getByTestId('nav-library'));
        expect(screen.getByTestId('libraries-page')).toBeTruthy();
        await fireEvent.click(screen.getByTestId('nav-library'));
        expect(screen.getByTestId('libraries-page').closest('.hidden')).toBeNull();

        // Раздел «Заметки»: то же поведение.
        await fireEvent.click(screen.getByTestId('nav-notes'));
        expect(screen.getByTestId('notes-library')).toBeTruthy();
        await fireEvent.click(screen.getByTestId('nav-notes'));
        expect(screen.getByTestId('notes-library')).toBeTruthy();
    });
});

describe('полноэкранный раздел настроек', () => {
    /** Видны ли меню разделов в шапке (скрыто при открытых настройках). */
    function chromeHidden(): boolean {
        return document.querySelector('[data-testid="section-nav"]') === null;
    }

    it('открывается на всё окно без меню разделов', async () => {
        render(App, { props: appProps() });

        expect(chromeHidden()).toBe(false);

        await fireEvent.click(screen.getByTestId('nav-settings'));

        // Полноэкранные настройки: меню разделов и панель раздела скрыты.
        expect(chromeHidden()).toBe(true);
        expect(screen.getByTestId('settings-page')).toBeTruthy();
    });

    it('закрывается кнопкой в углу и возвращает прежнюю область', async () => {
        render(App, { props: appProps() });
        await fireEvent.click(screen.getByTestId('nav-settings'));
        expect(chromeHidden()).toBe(true);

        await fireEvent.click(screen.getByLabelText('Закрыть настройки'));

        // Раздел настроек скрыт, меню разделов вернулось.
        expect(screen.getByTestId('settings-page').closest('.hidden')).toBeTruthy();
        expect(chromeHidden()).toBe(false);
    });

    it('закрывается клавишей Escape', async () => {
        render(App, { props: appProps() });
        await fireEvent.click(screen.getByTestId('nav-settings'));
        expect(chromeHidden()).toBe(true);

        await fireEvent.keyDown(window, { key: 'Escape' });

        expect(screen.getByTestId('settings-page').closest('.hidden')).toBeTruthy();
        expect(chromeHidden()).toBe(false);
    });

    it('возвращает область, из которой настройки открывали', async () => {
        render(App, { props: appProps() });

        // Открываем раздел «Заметки», затем из него — настройки.
        await fireEvent.click(screen.getByTestId('nav-notes'));
        expect(screen.getByTestId('notes-library')).toBeTruthy();
        await fireEvent.click(screen.getByTestId('nav-settings'));
        await fireEvent.click(screen.getByLabelText('Закрыть настройки'));

        // Возврат не пустой основной раздел: прежняя область сохранена.
        expect(screen.getByTestId('notes-library')).toBeTruthy();
    });
});

describe('текущее рабочее место остаётся загруженным при смене раздела', () => {
    /** Реестр с одним текущим местом и одной вкладкой книги. */
    function registryWithTab(): WorkspaceRegistry {
        return {
            workspaces: [
                {
                    id: 'ws-1',
                    name: 'Моё место',
                    createdAtMillis: 0,
                    tabs: [
                        {
                            id: 't1',
                            path: '/lib/a.epub',
                            title: 'Книга A',
                            format: 'epub',
                            zoom: 120,
                            position: 30,
                            mode: 'scroll',
                        },
                    ],
                    activeTabId: 't1',
                },
            ],
            currentWorkspaceId: 'ws-1',
        };
    }

    /** Число прочтений книги из хранилища (`reader_content`). */
    function contentReads(): number {
        return invoke.mock.calls.filter(([command]) => command === 'reader_content').length;
    }

    it('не перечитывает книгу после ухода в раздел и возврата', async () => {
        render(App, { props: { ...appProps(), initialRegistry: registryWithTab() } });

        // Открываем текущее место: книга читается один раз.
        await fireEvent.click(screen.getByTestId('workspace-open'));
        await waitFor(() => expect(contentReads()).toBe(1));

        // Уходим в «Библиотеки» и возвращаемся кнопкой рабочего места: раздел
        // остаётся открытым, поэтому возврат — кнопкой рабочего места.
        await fireEvent.click(screen.getByTestId('nav-library'));
        expect(screen.getByTestId('libraries-page')).toBeTruthy();
        await fireEvent.click(screen.getByTestId('nav-workspace'));
        expect(screen.getByTestId('workspaces-page')).toBeTruthy();

        // Вкладки не размонтированы: слой вкладок существует, книга не прочитана заново.
        expect(screen.getByTestId('workplace-tabs-layer')).toBeTruthy();
        expect(screen.getByTestId('workplace-tab-page')).toBeTruthy();
        expect(contentReads()).toBe(1);

        // Открытие текущего места из списка показывает уже загруженную книгу.
        await fireEvent.click(screen.getByTestId('workspace-open'));
        expect(screen.queryByTestId('reader-loading')).toBeNull();
        expect(contentReads()).toBe(1);
    });

    it('не перечитывает книгу после ухода в раздел «Заметки»', async () => {
        render(App, { props: { ...appProps(), initialRegistry: registryWithTab() } });

        await fireEvent.click(screen.getByTestId('workspace-open'));
        await waitFor(() => expect(contentReads()).toBe(1));

        await fireEvent.click(screen.getByTestId('nav-notes'));
        expect(screen.getByTestId('notes-library')).toBeTruthy();
        await fireEvent.click(screen.getByTestId('nav-workspace'));
        expect(screen.getByTestId('workspaces-page')).toBeTruthy();

        expect(screen.getByTestId('workplace-tab-page')).toBeTruthy();
        expect(contentReads()).toBe(1);
    });

    it('не перечитывает книгу после открытия и закрытия настроек', async () => {
        render(App, { props: { ...appProps(), initialRegistry: registryWithTab() } });

        await fireEvent.click(screen.getByTestId('workspace-open'));
        await waitFor(() => expect(contentReads()).toBe(1));

        await fireEvent.click(screen.getByTestId('nav-settings'));
        expect(screen.getByTestId('settings-page')).toBeTruthy();
        await fireEvent.click(screen.getByLabelText('Закрыть настройки'));

        expect(screen.getByTestId('workplace-tab-page')).toBeTruthy();
        expect(contentReads()).toBe(1);
    });

    it('открытие текущего места не читает книгу, а другого — читает', async () => {
        const registry: WorkspaceRegistry = {
            workspaces: [
                {
                    id: 'ws-1',
                    name: 'Текущее',
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
                {
                    id: 'ws-2',
                    name: 'Другое',
                    createdAtMillis: 0,
                    tabs: [
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
                    activeTabId: 't2',
                },
            ],
            currentWorkspaceId: 'ws-1',
        };
        render(App, { props: { ...appProps(), initialRegistry: registry } });

        /** Пункт списка рабочего места по имени. */
        const item = (name: string) =>
            screen
                .getAllByTestId('workspace-item')
                .find((node) => node.textContent?.includes(name)) as HTMLElement;

        // Открываем текущее место: книга читается один раз.
        await fireEvent.click(within(item('Текущее')).getByTestId('workspace-open'));
        await waitFor(() => expect(contentReads()).toBe(1));

        // Возврат к списку, повторное открытие текущего места — без нового чтения.
        await fireEvent.click(screen.getByTestId('nav-workspace'));
        await fireEvent.click(within(item('Текущее')).getByTestId('workspace-open'));
        expect(contentReads()).toBe(1);

        // Открытие другого места читает его книгу: другие места не держатся загруженными.
        await fireEvent.click(screen.getByTestId('nav-workspace'));
        await fireEvent.click(within(item('Другое')).getByTestId('workspace-open'));
        await waitFor(() => expect(contentReads()).toBe(2));
    });
});

describe('комбинации клавиш в оболочке', () => {
    /** Реестр с одним текущим местом и одной вкладкой книги. */
    function registryWithTab(): WorkspaceRegistry {
        return {
            workspaces: [
                {
                    id: 'ws-1',
                    name: 'Моё место',
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

    it('смена языка в настройках переводит интерфейс без перезапуска', async () => {
        render(App, { props: appProps() });
        expect(screen.getByTestId('nav-workspace').getAttribute('aria-label')).toBe(
            'Рабочее место',
        );

        // Событие приходит так же, как от плагина настроек после сохранения
        // поля «Язык интерфейса»: без перезапуска весь интерфейс берёт другой
        // словарь, а не только открытая страница.
        await waitFor(() => expect(settingsChanged).toBeTypeOf('function'));
        settingsChanged?.({ section: 'app.general', values: { 'appearance.language': 'en' } });
        await waitFor(() =>
            expect(screen.getByTestId('nav-workspace').getAttribute('aria-label')).toBe(
                'Workspace',
            ),
        );
        expect(document.documentElement.lang).toBe('en');

        settingsChanged?.({ section: 'app.general', values: { 'appearance.language': 'ru' } });
        await waitFor(() =>
            expect(screen.getByTestId('nav-workspace').getAttribute('aria-label')).toBe(
                'Рабочее место',
            ),
        );
    });

    it('Ctrl+2 открывает библиотеку, Ctrl+3 — заметки, Ctrl+1 — рабочее место', async () => {
        render(App, { props: appProps() });

        await fireEvent.keyDown(window, { key: '2', code: 'Digit2', ctrlKey: true });
        expect(screen.getByTestId('libraries-page')).toBeTruthy();

        await fireEvent.keyDown(window, { key: '3', code: 'Digit3', ctrlKey: true });
        expect(screen.getByTestId('notes-library')).toBeTruthy();

        await fireEvent.keyDown(window, { key: '1', code: 'Digit1', ctrlKey: true });
        expect(screen.getByTestId('workspaces-page')).toBeTruthy();
    });

    it('Ctrl+, открывает настройки, Escape закрывает их', async () => {
        render(App, { props: appProps() });

        await fireEvent.keyDown(window, { key: ',', code: 'Comma', ctrlKey: true });
        expect(screen.getByTestId('settings-page')).toBeTruthy();

        await fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
        expect(screen.getByTestId('settings-page').closest('.hidden')).toBeTruthy();
    });

    it('комбинация работает на русской раскладке: сравнение идёт по коду клавиши', async () => {
        render(App, { props: appProps() });

        // Символ «б» на той же физической клавише, что и «,».
        await fireEvent.keyDown(window, { key: 'б', code: 'Comma', ctrlKey: true });
        expect(screen.getByTestId('settings-page')).toBeTruthy();
    });

    it('Escape закрывает настройки и из поля ввода: закрытие слоя разрешено в поле', async () => {
        render(App, { props: appProps() });

        await fireEvent.click(screen.getByTestId('nav-settings'));
        const field = document.querySelector('input');
        expect(field).toBeTruthy();
        await fireEvent.keyDown(field as HTMLInputElement, { key: 'Escape', code: 'Escape' });

        expect(screen.getByTestId('settings-page').closest('.hidden')).toBeTruthy();
    });

    it('Ctrl+B переключает панель открытых книг рабочего места', async () => {
        render(App, { props: { ...appProps(), initialRegistry: registryWithTab() } });
        await fireEvent.click(screen.getByTestId('workspace-open'));
        await waitFor(() => expect(screen.getByTestId('workplace-tab-page')).toBeTruthy());

        // Панель закрыта по умолчанию: клавиша открывает её, повторное нажатие — закрывает.
        expect(screen.queryByTestId('open-books-panel')).toBeNull();
        await fireEvent.keyDown(window, { key: 'b', code: 'KeyB', ctrlKey: true });
        expect(screen.getByTestId('open-books-panel')).toBeTruthy();
        await fireEvent.keyDown(window, { key: 'b', code: 'KeyB', ctrlKey: true });
        expect(screen.queryByTestId('open-books-panel')).toBeNull();
    });

    it('Escape закрывает панель поиска по книге', async () => {
        render(App, { props: { ...appProps(), initialRegistry: registryWithTab() } });
        await fireEvent.click(screen.getByTestId('workspace-open'));
        await waitFor(() => expect(screen.getByTestId('workplace-tab-page')).toBeTruthy());

        await fireEvent.keyDown(window, { key: 'f', code: 'KeyF', ctrlKey: true });
        expect(screen.getByTestId('reader-search')).toBeTruthy();

        await fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
        expect(screen.queryByTestId('reader-search')).toBeNull();
    });
});
