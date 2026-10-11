import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App.svelte';
import { DEFAULT_PALETTE } from '@texture/ui';
import type { NotesLibraryBootstrap } from '../features/lifecycle/bootstrap';
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

/** Свойства оболочки с заданным реестром заметок. */
function appProps(notesLibrary: NotesLibraryBootstrap) {
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
        initialNotesLibrary: notesLibrary,
        initialOpenTabsLimit: 50,
    };
}

beforeEach(() => {
    notesChanged = undefined;
    settingsChanged = undefined;
    invoke.mockReset();
    listen.mockReset();
    invoke.mockImplementation(async () => null);
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
    it('открывается кнопкой-иконкой, показывает заголовок и реестр', async () => {
        render(App, {
            props: appProps({ sets: [], error: '' }),
        });

        await fireEvent.click(screen.getByLabelText('Реестр заметок'));

        expect(screen.getByText('Заметки')).toBeTruthy();
        expect(screen.getByTestId('notes-library')).toBeTruthy();
    });

    it('показывает данные, загруженные на бутстрапе, без запроса при открытии', async () => {
        render(App, {
            props: appProps({
                sets: [
                    {
                        id: 'ns-1',
                        bookKey: '/lib/a.epub',
                        bookTitle: 'Книга A',
                        name: 'Основные',
                        createdAtMillis: 1,
                        notes: [],
                    },
                ],
                error: '',
            }),
        });

        await fireEvent.click(screen.getByLabelText('Реестр заметок'));

        expect(screen.getByTestId('notes-library-book')).toBeTruthy();
        expect(screen.getByText('Книга A')).toBeTruthy();
    });

    it('перечитывает реестр по событию notes:changed', async () => {
        invoke.mockImplementation(async (command: string, args?: unknown) => {
            const payload = (args ?? {}) as { capability?: string; operation?: string };
            if (
                command === 'invoke_base_plugin_operation' &&
                payload.capability === 'notes.store@1' &&
                payload.operation === 'list_all_sets'
            ) {
                return { sets: [aggregateSet({ book_title: 'Обновлённая книга' })] };
            }
            return null;
        });

        render(App, { props: appProps({ sets: [], error: '' }) });
        await fireEvent.click(screen.getByLabelText('Реестр заметок'));
        await waitFor(() => expect(screen.getByTestId('notes-library')).toBeTruthy());
        expect(screen.getByTestId('notes-library-empty')).toBeTruthy();

        notesChanged?.({ book_key: '/lib/a.epub', set_id: 'ns-1' });

        await waitFor(() => expect(screen.getByText('Обновлённая книга')).toBeTruthy());
    });

    it('передаёт интенты перехода в реестр', async () => {
        render(App, {
            props: appProps({
                sets: [
                    {
                        id: 'ns-1',
                        bookKey: '/lib/a.epub',
                        bookTitle: 'Книга A',
                        name: 'Основные',
                        createdAtMillis: 1,
                        notes: [],
                    },
                ],
                error: '',
            }),
        });

        await fireEvent.click(screen.getByLabelText('Реестр заметок'));
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
                calls.push(args as Record<string, unknown>);
            }
            return null;
        });

        render(App, {
            props: {
                ...appProps({
                    sets: [
                        {
                            id: 'ns-1',
                            bookKey: '/lib/a.epub',
                            bookTitle: 'Книга A',
                            name: 'Основные',
                            createdAtMillis: 1,
                            notes: [],
                        },
                    ],
                    error: '',
                }),
                initialRegistry: registry,
            },
        });

        await fireEvent.click(screen.getByLabelText('Реестр заметок'));
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
            props: appProps({
                sets: [
                    {
                        id: 'ns-1',
                        bookKey: 'no-library',
                        bookTitle: 'Без книги',
                        name: 'Основные',
                        createdAtMillis: 1,
                        notes: [],
                    },
                ],
                error: '',
            }),
        });

        await fireEvent.click(screen.getByLabelText('Реестр заметок'));
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
        render(App, { props: appProps({ sets: [], error: '' }) });

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
        render(App, { props: { ...appProps({ sets: [], error: '' }), initialRegistry: registry } });
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

    it('настройки стоят у левого края перед логотипом', async () => {
        render(App, { props: appProps({ sets: [], error: '' }) });

        const header = document.querySelector('header') as HTMLElement;
        const children = Array.from(header.children);
        // Первый ребёнок шапки — кнопка настроек, второй — логотип.
        expect((children[0] as HTMLElement).getAttribute('aria-label')).toBe('Настройки');
        expect(children[1]?.textContent).toContain('Текстура');
    });

    it('правая группа идёт: настройки, рабочее место, библиотеки, заметки, тема, уведомления', async () => {
        render(App, { props: appProps({ sets: [], error: '' }) });

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
            'Настройки',
            'Рабочее место',
            'Библиотеки',
            'Реестр заметок',
            'Переключить тему',
            'Уведомления',
        ]);
    });
});
