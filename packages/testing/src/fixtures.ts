import type { MockBridgeConfig } from './mock-bridge';
import { emitMockEvent } from './mock-bridge';

/** Идентификатор тестового generic-провайдера. */
const LIBRARY_ID = 'a692624f-1fa0-49a2-9015-9cb7361f9d47';
/** Идентификатор тестового Calibre-провайдера. */
const CALIBRE_ID = 'f7c8b139-887f-4a2f-84e8-fdcc89635a79';
/** Идентификатор тестового extension-плагина, установленного пользователем. */
const INSTALLED_ID = 'e6ddd2e8-a62c-4350-b431-2bb4f2cb8d5c';
/** Крошечное PNG-изображение в base64 (1×1). */
const TINY_PNG =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/** Поля секции настроек тестового окружения. */
const SETTINGS_FIELDS: Record<
    string,
    Array<{
        key: string;
        title: string;
        type: string;
        default: unknown;
        description?: string;
        options?: Array<{ value: string; title: string }>;
    }>
> = {
    'app.general': [
        {
            key: 'startup.welcome_notification',
            title: 'Приветственное уведомление',
            type: 'boolean',
            default: true,
        },
        {
            key: 'diagnostics.log_level',
            title: 'Порог технических логов',
            type: 'select',
            default: 'info',
            options: [
                { value: 'info', title: 'Информация' },
                { value: 'trace', title: 'Всё' },
            ],
        },
        {
            key: 'appearance.theme',
            title: 'Тема оформления',
            type: 'select',
            default: 'system',
            options: [
                { value: 'light', title: 'Светлая' },
                { value: 'dark', title: 'Тёмная' },
                { value: 'system', title: 'Как в системе' },
            ],
        },
        {
            key: 'appearance.palette',
            title: 'Палитра оформления',
            type: 'select',
            default: 'gruvbox',
            options: [
                { value: 'gruvbox', title: 'Gruvbox' },
                { value: 'mist', title: 'Mist' },
            ],
        },
        {
            key: 'reader.theme',
            title: 'Тема области чтения',
            type: 'select',
            default: 'light',
            options: [
                { value: 'light', title: 'Светлая' },
                { value: 'dark', title: 'Тёмная' },
            ],
        },
        {
            key: 'window.open_tabs_limit',
            title: 'Лимит открытых вкладок',
            type: 'number',
            default: 50,
            description:
                'Наибольшее число одновременно открытых вкладок рабочего места. Слишком большое значение может привести к непредсказуемым последствиям.',
        },
    ],
};

/** Изменяемое состояние настроек в моке: значения переживают интенты. */
const SETTINGS_VALUES: Record<string, Record<string, unknown>> = {
    'app.general': {
        'startup.welcome_notification': true,
        'diagnostics.log_level': 'info',
        'appearance.theme': 'system',
        'appearance.palette': 'gruvbox',
        'reader.theme': 'light',
        'window.open_tabs_limit': 50,
    },
};

/** Стартовые записи журнала уведомлений мока. */
const BASE_JOURNAL_ENTRIES: Array<Record<string, unknown>> = [
    {
        id: 1,
        timestamp: 1_700_000_000_000,
        level: 'User',
        severity: 'info',
        message: 'Библиотека открыта',
        source: 'app',
        details: {},
        read: true,
    },
    {
        id: 2,
        timestamp: 1_700_000_001_000,
        level: 'Technical',
        severity: 'warn',
        message: 'Плагин пропущен',
        source: 'core',
        details: {},
        read: false,
    },
    {
        id: 3,
        timestamp: 1_700_000_002_000,
        level: 'Technical',
        severity: 'error',
        message: 'Ошибка вызова плагина',
        source: 'core',
        details: {},
        read: true,
    },
];

/** Изменяемый журнал уведомлений в моке: публикации переживают чтения. */
const MOCK_JOURNAL: Array<Record<string, unknown>> = [];

/** Записи журнала уведомлений: стартовые примеры и опубликованные записи. */
function mockJournalEntries(): Array<Record<string, unknown>> {
    return [...BASE_JOURNAL_ENTRIES, ...MOCK_JOURNAL];
}

/** Секции настроек с текущими значениями для opaque-операций. */
function settingsSections(): unknown[] {
    return Object.entries(SETTINGS_FIELDS).map(([id, fields]) => ({
        id,
        owner: 'app',
        kind: 'app',
        title: 'Общие',
        description: 'Общие параметры приложения',
        fields,
        values: { ...SETTINGS_VALUES[id] },
    }));
}

/** Декларации секций настроек деревом `ui-schema`. */
function settingsSpaces(): unknown[] {
    return Object.entries(SETTINGS_FIELDS).map(([id, fields]) => ({
        space: 'settings.section',
        id,
        title: 'Общие',
        description: 'Общие параметры приложения',
        nodes: [
            { type: 'Heading', props: { text: 'Общие', level: 2 } },
            { type: 'Text', props: { text: 'Общие параметры приложения' } },
            ...fields.map((field) => {
                const value = SETTINGS_VALUES[id][field.key];
                if (field.type === 'boolean') {
                    return {
                        type: 'Checkbox',
                        props: { name: field.key, label: field.title, checked: value === true },
                        on: { change: 'save' },
                    };
                }
                if (field.type === 'select') {
                    return {
                        type: 'Select',
                        props: {
                            name: field.key,
                            label: field.title,
                            value: String(value ?? ''),
                            options: field.options ?? [],
                        },
                        on: { change: 'save' },
                    };
                }
                return {
                    type: 'Input',
                    props: { name: field.key, label: field.title, value: String(value ?? '') },
                };
            }),
            {
                type: 'Button',
                props: { label: 'Сохранить', variant: 'secondary' },
                on: { click: 'save' },
            },
        ],
    }));
}

/** Ответ базового плагина на opaque-операцию в браузерных тестах. */
function baseOperation(payload: unknown): unknown {
    const message = (payload ?? {}) as {
        capability?: string;
        operation?: string;
        payload?: {
            space?: string;
            id?: string;
            action?: string;
            values?: Record<string, unknown>;
        };
    };
    if (message.capability === 'settings.store@1' && message.operation === 'list') {
        return { sections: settingsSections() };
    }
    if (message.capability === 'settings.store@1' && message.operation === 'get') {
        return { values: {} };
    }
    if (message.capability === 'settings.store@1' && message.operation === 'set') {
        const request = (message.payload ?? {}) as {
            section?: string;
            values?: Record<string, unknown>;
        };
        const section = request.section ?? '';
        if (section in SETTINGS_VALUES) {
            Object.assign(SETTINGS_VALUES[section], request.values ?? {});
            emitMockEvent('settings:changed', {
                section,
                values: { ...SETTINGS_VALUES[section] },
            });
            return { values: { ...SETTINGS_VALUES[section] } };
        }
        return { values: {} };
    }
    if (message.capability === 'settings.store@1' && message.operation === 'ui') {
        return { version: 1, spaces: settingsSpaces() };
    }
    if (message.capability === 'settings.store@1' && message.operation === 'intent') {
        const request = message.payload ?? {};
        const id = request.id ?? '';
        if (request.space === 'settings.section' && id in SETTINGS_VALUES) {
            Object.assign(SETTINGS_VALUES[id], request.values ?? {});
            emitMockEvent('settings:changed', {
                section: id,
                values: { ...SETTINGS_VALUES[id] },
            });
        }
        return { version: 1, spaces: settingsSpaces() };
    }
    if (message.capability === 'plugin-store@1' && message.operation === 'list') {
        return { plugins: [] };
    }
    if (message.capability === 'plugin-store@1' && message.operation === 'plugins') {
        return {
            plugins: [
                {
                    id: CALIBRE_ID,
                    name: 'calibre',
                    kind: 'source',
                    description: 'Плагин библиотеки Calibre',
                    enabled: true,
                    removable: false,
                },
                {
                    id: INSTALLED_ID,
                    name: 'installed-plugin',
                    kind: 'extension',
                    description: 'Установленный пользователем плагин',
                    enabled: false,
                    removable: true,
                },
                {
                    id: 'b1f2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5e',
                    name: 'demo',
                    kind: 'extension',
                    description: 'Образец: минимальный extension-плагин',
                    enabled: true,
                    removable: false,
                    sample: true,
                },
                {
                    id: 'c1a7e0d4-2b3f-4c5a-9d6e-7f8a9b0c1d2e',
                    name: 'workplace-demo',
                    kind: 'workplace',
                    description: 'Образец плагина рабочего места',
                    enabled: true,
                    removable: false,
                    sample: true,
                },
            ],
        };
    }
    if (message.capability === 'plugin-store@1' && message.operation === 'set_enabled') {
        return { enabled: true };
    }
    if (message.capability === 'plugin-store@1' && message.operation === 'stores_list') {
        return { stores: [] };
    }
    if (message.capability === 'plugin-store@1' && message.operation === 'stores_add') {
        return { stores: [] };
    }
    if (message.capability === 'notifications.journal@1' && message.operation === 'list') {
        return { entries: mockJournalEntries() };
    }
    if (message.capability === 'notifications.journal@1' && message.operation === 'publish') {
        const record = (message.payload ?? {}) as {
            level?: string;
            severity?: string;
            message?: string;
            source?: string;
            details?: Record<string, unknown>;
        };
        MOCK_JOURNAL.push({
            // Идентификаторы продолжают нумерацию стартовых записей, чтобы ключ
            // записи в ленте уведомлений оставался уникальным.
            id: BASE_JOURNAL_ENTRIES.length + MOCK_JOURNAL.length + 1,
            timestamp: 1_700_000_003_000 + MOCK_JOURNAL.length,
            level: record.level === 'technical' ? 'Technical' : 'User',
            severity: record.severity ?? 'info',
            message: record.message ?? '',
            source: record.source ?? 'core',
            details: record.details ?? {},
            read: false,
        });
        emitMockEvent('notifications:added', MOCK_JOURNAL[MOCK_JOURNAL.length - 1]);
        return { ok: true };
    }
    if (message.capability === 'notifications.journal@1' && message.operation === 'mark_all_read') {
        return { ok: true };
    }
    if (message.capability === 'notifications.journal@1' && message.operation === 'clear') {
        return { ok: true };
    }
    if (message.capability === 'notes.store@1') {
        return notesOperation(message.operation, (payload as { payload?: unknown }).payload);
    }
    return { sections: [], entries: [], plugins: [], stores: [] };
}

/** Набор заметок в мок-хранилище. */
interface MockNoteSet {
    /** Идентификатор набора. */
    id: string;
    /** Ключ книги. */
    bookKey: string;
    /** Отображаемое имя книги; может отсутствовать. */
    bookTitle: string;
    /** Имя набора. */
    name: string;
    /** Заметки набора. */
    notes: Array<Record<string, unknown>>;
}

/** Ключ мок-хранилища заметок в localStorage. */
const NOTES_STORAGE_KEY = 'texture-notes';
/** Ключ мок-хранилища активного набора по книгам. */
const NOTES_ACTIVE_STORAGE_KEY = 'texture-notes-active';

/** Все наборы заметок мок-хранилища. */
function loadMockNotes(): MockNoteSet[] {
    try {
        const raw = window.localStorage.getItem(NOTES_STORAGE_KEY);
        const sets = raw ? (JSON.parse(raw) as MockNoteSet[]) : [];
        // Наборы прежнего формата не несли отображаемого имени книги.
        return sets.map((set) => ({ ...set, bookTitle: set.bookTitle ?? '' }));
    } catch {
        return [];
    }
}

/** Сохранение наборов заметок мок-хранилища. */
function saveMockNotes(sets: MockNoteSet[]): void {
    try {
        window.localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(sets));
    } catch {
        // Отсутствие localStorage не мешает операции.
    }
}

/** Активный набор по книгам мок-хранилища. */
function loadMockActive(): Record<string, string> {
    try {
        const raw = window.localStorage.getItem(NOTES_ACTIVE_STORAGE_KEY);
        return raw ? (JSON.parse(raw) as Record<string, string>) : {};
    } catch {
        return {};
    }
}

/** Сохранение активного набора по книгам мок-хранилища. */
function saveMockActive(active: Record<string, string>): void {
    try {
        window.localStorage.setItem(NOTES_ACTIVE_STORAGE_KEY, JSON.stringify(active));
    } catch {
        // Отсутствие localStorage не мешает операции.
    }
}

/** Ответ базового плагина заметок для браузерных тестов. */
function notesOperation(operation: string | undefined, payload: unknown): unknown {
    const sets = loadMockNotes();
    const body = (payload ?? {}) as {
        book_key?: string;
        book_title?: string;
        set_id?: string;
        note_id?: string;
        name?: string;
        note?: Record<string, unknown>;
        patch?: Record<string, unknown>;
    };
    if (operation === 'list_sets') {
        return {
            sets: sets
                .filter((set) => set.bookKey === body.book_key)
                .map((set) => ({
                    id: set.id,
                    book_key: set.bookKey,
                    book_title: set.bookTitle,
                    name: set.name,
                    note_count: set.notes.length,
                })),
            active_set_id: loadMockActive()[body.book_key ?? ''] ?? null,
        };
    }
    if (operation === 'list_all_sets') {
        return {
            sets: sets.map((set) => ({
                id: set.id,
                book_key: set.bookKey,
                book_title: set.bookTitle,
                name: set.name,
                notes: set.notes,
            })),
        };
    }
    if (operation === 'set_active') {
        const active = loadMockActive();
        active[body.book_key ?? ''] = body.set_id ?? '';
        saveMockActive(active);
        return { ok: true };
    }
    if (operation === 'get_set') {
        const set = sets.find((item) => item.id === body.set_id);
        return { set: set ?? null };
    }
    if (operation === 'create_set') {
        // Идентификатор не переиспользуется после удаления: счётчик берётся из
        // уже выданных номеров, а не из текущей длины списка.
        const issued = sets
            .map((set) => Number(/^ns-mock-(\d+)$/.exec(set.id)?.[1] ?? 0))
            .reduce((max, value) => Math.max(max, value), 0);
        const created: MockNoteSet = {
            id: `ns-mock-${issued + 1}`,
            bookKey: body.book_key ?? '',
            bookTitle: body.book_title ?? '',
            name: body.name ?? '',
            notes: [],
        };
        sets.push(created);
        saveMockNotes(sets);
        const active = loadMockActive();
        active[created.bookKey] = created.id;
        saveMockActive(active);
        emitMockEvent('notes:changed', { book_key: created.bookKey, set_id: created.id });
        return { set: created };
    }
    if (operation === 'rename_set') {
        const set = sets.find((item) => item.id === body.set_id);
        if (set) {
            set.name = body.name ?? set.name;
            saveMockNotes(sets);
            emitMockEvent('notes:changed', { book_key: set.bookKey, set_id: set.id });
        }
        return { set: set ?? null };
    }
    if (operation === 'delete_set') {
        const removed = sets.find((item) => item.id === body.set_id);
        saveMockNotes(sets.filter((item) => item.id !== body.set_id));
        if (removed) {
            const active = loadMockActive();
            if (active[removed.bookKey] === removed.id) {
                delete active[removed.bookKey];
                saveMockActive(active);
            }
            emitMockEvent('notes:changed', { book_key: removed.bookKey, set_id: removed.id });
        }
        return { ok: true };
    }
    if (operation === 'add_note') {
        const set = sets.find((item) => item.id === body.set_id);
        if (set) {
            set.notes.push({
                id: `note-mock-${set.notes.length + 1}`,
                type: String(body.note?.type ?? 'quote'),
                anchor: String(body.note?.anchor ?? ''),
                quote: String(body.note?.quote ?? ''),
                chapter: String(body.note?.chapter ?? ''),
                title: String(body.note?.title ?? ''),
                comment: String(body.note?.comment ?? ''),
                color: String(body.note?.color ?? 'yellow'),
                percent: body.note?.percent ?? null,
                page: body.note?.page ?? null,
                text: String(body.note?.text ?? ''),
                shape: String(body.note?.shape ?? 'line'),
                geometry: String(body.note?.geometry ?? ''),
                created_at_millis: 1_700_000_000_000,
                updated_at_millis: 1_700_000_000_000,
            });
            saveMockNotes(sets);
            emitMockEvent('notes:changed', { book_key: set.bookKey, set_id: set.id });
        }
        return { set: set ?? null };
    }
    if (operation === 'update_note') {
        const set = sets.find((item) => item.id === body.set_id);
        const note = set?.notes.find((item) => item.id === body.note_id);
        if (note && body.patch) {
            Object.assign(note, body.patch);
            note.updated_at_millis = 1_700_000_001_000;
            saveMockNotes(sets);
            if (set) {
                emitMockEvent('notes:changed', { book_key: set.bookKey, set_id: set.id });
            }
        }
        return { set: set ?? null };
    }
    if (operation === 'delete_note') {
        const set = sets.find((item) => item.id === body.set_id);
        if (set) {
            set.notes = set.notes.filter((item) => item.id !== body.note_id);
            saveMockNotes(sets);
            emitMockEvent('notes:changed', { book_key: set.bookKey, set_id: set.id });
        }
        return { set: set ?? null };
    }
    return {};
}

/** Ответ session-плагина на opaque-операцию в браузерных тестах. */
function pluginOperation(payload: unknown): unknown {
    const message = (payload ?? {}) as {
        operation?: string;
        payload?: { query?: string; book_id?: string };
    };
    const books = [
        {
            id: 'demo-1',
            title: 'Демо-книга',
            authors: ['Тестовый автор'],
            files: [{ kind: 'book', path: 'demo-1.epub', format: 'epub' }],
        },
        {
            id: 'demo-2',
            title: 'Вторая книга',
            authors: [],
            files: [{ kind: 'book', path: 'demo-2.fb2', format: 'fb2' }],
        },
        {
            id: 'demo-3',
            title: 'Третья книга',
            authors: ['Ещё автор'],
            files: [{ kind: 'book', path: 'demo-3.epub', format: 'epub' }],
        },
    ];
    if (message.operation === 'list' || message.operation === 'search') {
        const query = message.payload?.query?.toLowerCase() ?? '';
        const filtered = query
            ? books.filter(
                  (book) =>
                      book.title.toLowerCase().includes(query) ||
                      book.authors.some((author) => author.toLowerCase().includes(query)),
              )
            : books;
        return { catalog: { books: filtered } };
    }
    if (message.operation === 'cover') {
        return message.payload?.book_id === 'demo-1'
            ? { data: TINY_PNG, format: 'png' }
            : { data: null };
    }
    if (message.operation === 'content') {
        const paragraphs = Array.from(
            { length: 60 },
            (_, index) => `<p>Абзац ${index + 1}. Текст для проверки прокрутки книги.</p>`,
        ).join('');
        return {
            title: 'Демо-книга',
            authors: ['Тестовый автор'],
            chapters: [
                {
                    title: 'Глава 1',
                    html: `<h1>Глава 1</h1><p>Первый абзац книги.</p>${paragraphs}`,
                },
                { title: 'Глава 2', html: '<h2>Глава 2</h2><p>Второй абзац книги.</p>' },
            ],
        };
    }
    return {};
}

/** Демонстрационное содержимое книги для чтения по пути в браузерных тестах. */
function demoContent(): unknown {
    const paragraphs = Array.from(
        { length: 60 },
        (_, index) => `<p>Абзац ${index + 1}. Текст для проверки прокрутки книги.</p>`,
    ).join('');
    return {
        title: 'Демо-книга',
        authors: ['Тестовый автор'],
        chapters: [
            {
                title: 'Глава 1',
                html: `<h1>Глава 1</h1><p>Первый абзац книги.</p>${paragraphs}`,
            },
            { title: 'Глава 2', html: '<h2>Глава 2</h2><p>Второй абзац книги.</p>' },
        ],
    };
}

/** Конфигурация мока по умолчанию для браузерных тестов. */
export function defaultMockConfig(): MockBridgeConfig {
    return {
        dialogResult: null,
        handlers: {
            invoke_base_plugin_operation: baseOperation,
            invoke_plugin_operation: pluginOperation,
            reader_content: () => demoContent(),
            reader_formats: () => ['demo'],
            reader_plugin_for_format: () => null,
            reader_open_external: () => ({ opened: true }),
            reader_book_chunk: (payload: unknown) => {
                const value = (payload ?? {}) as { path?: string };
                const bytes = value.path ? `file:${value.path}` : '';
                const encoded = btoa(bytes);
                return { chunk: encoded, next: bytes.length, total: bytes.length, done: true };
            },
            reader_forget_book: () => ({ forgotten: true }),
            reader_viewer_files: () => [
                { path: 'index.html', mime: 'text/html' },
                { path: 'viewer.mjs', mime: 'text/javascript' },
            ],
            reader_viewer_file: (payload: unknown) => {
                const value = (payload ?? {}) as { path?: string };
                return { path: value.path ?? '', data: btoa(`asset:${value.path ?? ''}`) };
            },
            select_source_library: () => ({ provider: LIBRARY_ID, provider_name: 'library' }),
            active_library: () => null,
            theme_preference: () => SETTINGS_VALUES['app.general']['appearance.theme'],
            theme_palette: () => SETTINGS_VALUES['app.general']['appearance.palette'],
            reader_theme: () => SETTINGS_VALUES['app.general']['reader.theme'],
            window_open_tabs_limit: () => SETTINGS_VALUES['app.general']['window.open_tabs_limit'],
            show_window: () => null,
            app_info: () => ({
                name: 'Текстура',
                version: '0.1.0',
                paths: [
                    {
                        key: 'app_state',
                        title: 'Служебное состояние приложения',
                        path: '/home/user/.texture/app-state',
                        note: 'Реестры приложения',
                    },
                    {
                        key: 'wasm_cache',
                        title: 'Кэш компиляции WASM',
                        path: '/home/user/.texture/app-state/wasm-cache',
                        note: 'Скомпилированные модули плагинов',
                    },
                ],
            }),
            plugin_activation_pending: () => ({ pending: false }),
            get_workspaces: () => ({
                workspaces: [
                    {
                        id: 'ws-default',
                        name: 'Рабочее место',
                        created_at_millis: 1_700_000_000_000,
                        tabs: [],
                        active_tab_id: null,
                    },
                ],
                active_workspace_id: 'ws-default',
            }),
            save_workspaces: () => ({ ok: true }),
            library_history_list: () => ({
                entries: [
                    {
                        path: '/demo-library',
                        provider: LIBRARY_ID,
                        provider_name: 'library',
                        added_at_millis: 1_700_000_000_000,
                        available: true,
                    },
                ],
            }),
            library_history_forget: () => ({ forgotten: true }),
        },
    };
}
