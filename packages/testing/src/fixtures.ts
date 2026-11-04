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

/** Кэш свойств файла в моке: путь → запись (живёт в пределах прогона). */
const READER_CACHE = new Map<
    string,
    { properties?: unknown; annotations?: unknown; thumbs?: Record<string, string> }
>();

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
            key: 'appearance.language',
            title: 'app.settings.app.general.appearance.language.label',
            type: 'select',
            default: 'ru',
            description: 'app.settings.app.general.appearance.language.description',
            options: [
                {
                    value: 'ru',
                    title: 'app.settings.app.general.appearance.language.option.ru',
                },
                {
                    value: 'en',
                    title: 'app.settings.app.general.appearance.language.option.en',
                },
            ],
        },
        {
            key: 'appearance.theme',
            title: 'app.settings.app.general.appearance.theme.label',
            type: 'select',
            default: 'system',
            description: 'app.settings.app.general.appearance.theme.description',
            options: [
                {
                    value: 'light',
                    title: 'app.settings.app.general.appearance.theme.option.light',
                },
                {
                    value: 'dark',
                    title: 'app.settings.app.general.appearance.theme.option.dark',
                },
                {
                    value: 'system',
                    title: 'app.settings.app.general.appearance.theme.option.system',
                },
            ],
        },
        {
            key: 'appearance.palette',
            title: 'app.settings.app.general.appearance.palette.label',
            type: 'select',
            default: 'linen',
            description: 'app.settings.app.general.appearance.palette.description',
            options: [
                {
                    value: 'linen',
                    title: 'app.settings.app.general.appearance.palette.option.linen',
                },
                {
                    value: 'cobalt',
                    title: 'app.settings.app.general.appearance.palette.option.cobalt',
                },
            ],
        },
        {
            key: 'window.open_tabs_limit',
            title: 'app.settings.app.general.window.open_tabs_limit.label',
            type: 'number',
            default: 50,
            description: 'app.settings.app.general.window.open_tabs_limit.description',
        },
    ],
};

/** Изменяемое состояние настроек в моке: значения переживают интенты. */
const SETTINGS_VALUES: Record<string, Record<string, unknown>> = {
    'app.general': {
        'appearance.theme': 'system',
        'appearance.palette': 'linen',
        'appearance.language': 'ru',
        'reader.theme': 'light',
        'reader.font': 'serif',
        'window.open_tabs_limit': 50,
    },
};

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
        title: 'app.settings.app.general.title',
        description: 'app.settings.app.general.description',
        nodes: fields.map((field) => {
            const value = SETTINGS_VALUES[id][field.key];
            if (field.type === 'boolean') {
                return {
                    type: 'Checkbox',
                    props: {
                        name: field.key,
                        label: field.title,
                        checked: value === true,
                        ...(field.description ? { description: field.description } : {}),
                    },
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
                        ...(field.description ? { description: field.description } : {}),
                    },
                };
            }
            return {
                type: 'Input',
                props: {
                    name: field.key,
                    label: field.title,
                    value: String(value ?? ''),
                    ...(field.description ? { description: field.description } : {}),
                },
            };
        }),
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
    if (message.capability === 'settings.store@1' && message.operation === 'save') {
        const request = (message.payload ?? {}) as {
            sections?: Array<{ section?: string; values?: Record<string, unknown> }>;
        };
        for (const record of request.sections ?? []) {
            const section = record.section ?? '';
            if (section in SETTINGS_VALUES) {
                Object.assign(SETTINGS_VALUES[section], record.values ?? {});
                emitMockEvent('settings:changed', {
                    section,
                    values: { ...SETTINGS_VALUES[section] },
                });
            }
        }
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
                    name: 'books-source-calibre',
                    version: '0.1.0',
                    kind: 'books',
                    description: 'Плагин источника книг Calibre',
                    enabled: true,
                    removable: false,
                },
                {
                    id: INSTALLED_ID,
                    name: 'installed-plugin',
                    version: '0.1.0',
                    kind: 'extension',
                    description: 'Установленный пользователем плагин',
                    enabled: false,
                    removable: true,
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
    if (message.capability === 'plugin-store@1' && message.operation === 'available') {
        return { supported: true, packages: [] };
    }
    if (message.capability === 'plugin-store@1' && message.operation === 'updates') {
        return { updates: [] };
    }
    if (message.capability === 'plugin-store@1' && message.operation === 'install_from_store') {
        return { plugin: { id: INSTALLED_ID, name: 'installed-plugin', version: '0.1.0' } };
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
const NOTES_STORAGE_KEY = 'context-notes';
/** Ключ мок-хранилища активного набора по книгам. */
const NOTES_ACTIVE_STORAGE_KEY = 'context-notes-active';

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

/** Каталоги модулей рисования, известные моку.
 *
 * Адреса файлов повторяют раскладку ресурсов плагинов; dev-сервер отдаёт их
 * как статику проекта.
 */
const VIEWER_PLUGINS: Record<string, string[]> = {
    'format-epub': ['index.html', 'viewer.js'],
    'format-fb2': ['index.html', 'viewer.js'],
};

/** Точка входа модуля рисования плагина для мока.
 *
 * Точка входа читается так же, как файлы: по адресу развёрнутого ресурса.
 * Она нужна синхронно, а мок отдаёт данные асинхронно, поэтому содержимое
 * приходит заглушкой, а модуль подключается файлами (см. `viewerFile`).
 */
function viewerEntry(pluginId: string): string {
    return (
        '<!doctype html><html lang="ru"><head><meta charset="utf-8">' +
        `<title>${pluginId}</title></head><body>` +
        '<div id="viewer"><div id="chapters"></div></div>' +
        '<div id="status">Ожидание книги…</div>' +
        // Загрузка бандла — обычным скриптом: модульный `import` в песочнице
        // `srcdoc` не исполняется в браузерном прогоне.
        "<script>import(contextViewerUrl('./viewer.js'));</script>" +
        '</body></html>'
    );
}

/** Список файлов модуля рисования плагина для мока. */
function viewerFiles(pluginId: string): Array<{ path: string; mime: string }> {
    return (VIEWER_PLUGINS[pluginId] ?? []).map((path) => ({
        path,
        mime: path.endsWith('.html') ? 'text/html' : 'text/javascript',
    }));
}

/** Кэш прочитанных файлов модулей рисования: путь → base64. */
const VIEWER_FILE_CACHE = new Map<string, string>();

/** Содержимое файла модуля рисования плагина в base64 для мока.
 *
 * Мок работает в браузере и читать диск не может, поэтому берёт собранный
 * ресурс по адресу его раскладки: dev-сервер отдаёт каталог проекта как
 * статику. Так браузерный тест проверяет настоящий модуль плагина, а не
 * подделку.
 */
async function viewerFile(
    pluginId: string,
    path: string,
): Promise<{ path: string; data: string }> {
    const url = `/src-tauri/resources/plugins/${pluginId}/viewer/${path}`;
    const cached = VIEWER_FILE_CACHE.get(url);
    if (cached !== undefined) {
        return { path, data: cached };
    }
    const response = await fetch(url);
    if (!response.ok) {
        return { path, data: '' };
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = '';
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    const data = btoa(binary);
    VIEWER_FILE_CACHE.set(url, data);
    return { path, data };
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
            // Запись события интерфейса в журнал диагностики: мок принимает её
            // без файла, проверки интерфейса сторож не читает.
            app_log: () => null,
            invoke_plugin_operation: pluginOperation,
            reader_content: () => demoContent(),
            // Обложка книги из самого файла: у демонстрационного EPUB она есть,
            // поэтому список рабочих мест показывает картинку, а не заглушку.
            reader_cover: (payload: unknown) => {
                const path = (payload as { path?: string } | null)?.path ?? '';
                return path.toLowerCase().endsWith('.epub')
                    ? { data: TINY_PNG, format: 'png' }
                    : { data: null };
            },
            reader_formats: () => ['epub', 'fb2'],
            // Читатель выбирается по плагину формата: EPUB и FB2 обслуживают
            // собственные плагины, как и страничные форматы.
            reader_plugin_for_format: (payload: unknown) => {
                const format = (payload as { format?: string } | null)?.format ?? '';
                // EPUB и FB2 — текучие книги: плагин получает разобранные главы,
                // а страничные форматы — байты файла.
                if (format === 'epub') {
                    return { plugin_id: 'format-epub', flowing: true };
                }
                if (format === 'fb2') {
                    return { plugin_id: 'format-fb2', flowing: true };
                }
                return null;
            },
            reader_open_external: () => ({ opened: true }),
            // Обложки книг рабочего места приходят одним вызовом: путь → данные.
            workspace_covers: (payload: unknown) => {
                const paths = ((payload as { paths?: unknown } | null)?.paths ?? []) as string[];
                const covers: Record<string, unknown> = {};
                for (const path of paths) {
                    covers[path] = path.toLowerCase().endsWith('.epub')
                        ? { data: TINY_PNG, format: 'png' }
                        : { data: null };
                }
                return covers;
            },
            reader_book_chunk: (payload: unknown) => {
                const value = (payload ?? {}) as { path?: string };
                const bytes = value.path ? `file:${value.path}` : '';
                const encoded = btoa(bytes);
                return { chunk: encoded, next: bytes.length, total: bytes.length, done: true };
            },
            reader_forget_book: () => ({ forgotten: true }),
            // Кэш свойств файла: мок держит записи в памяти одного прогона,
            // чтобы сценарий повторного открытия вкладки проверял именно кэш.
            reader_cache_load: (payload: unknown) => {
                const path = (payload as { path?: string } | null)?.path ?? '';
                return READER_CACHE.get(path) ?? null;
            },
            reader_cache_save: (payload: unknown) => {
                const value = (payload ?? {}) as {
                    path?: string;
                    properties?: unknown;
                    annotations?: unknown;
                    thumbs?: Array<{ page?: number; dataUrl?: string; width?: number; height?: number }>;
                };
                const path = value.path ?? '';
                const previous = READER_CACHE.get(path) ?? {};
                const thumbs: Record<string, string> = { ...previous.thumbs };
                for (const thumb of value.thumbs ?? []) {
                    if (thumb.page && thumb.dataUrl) {
                        thumbs[String(thumb.page)] = thumb.dataUrl;
                    }
                }
                READER_CACHE.set(path, {
                    properties: value.properties ?? previous.properties,
                    annotations: value.annotations ?? previous.annotations,
                    thumbs,
                });
                return true;
            },
            reader_cache_forget: (payload: unknown) => {
                READER_CACHE.delete((payload as { path?: string } | null)?.path ?? '');
                return true;
            },
            // Модуль рисования берётся из развёрнутых ресурсов плагина: их
            // отдаёт dev-сервер (каталог проекта), поэтому браузерный тест
            // проверяет настоящий плагин, а не подделку.
            reader_viewer: (payload: unknown) =>
                viewerEntry((payload as { pluginId?: string } | null)?.pluginId ?? ''),
            reader_viewer_files: (payload: unknown) =>
                viewerFiles((payload as { pluginId?: string } | null)?.pluginId ?? ''),
            reader_viewer_file: (payload: unknown) => {
                const value = (payload ?? {}) as { pluginId?: string; path?: string };
                return viewerFile(value.pluginId ?? '', value.path ?? '');
            },
            select_source_library: () => ({ provider: LIBRARY_ID, provider_name: 'books-source' }),
            active_library: () => null,
            theme_preference: () => SETTINGS_VALUES['app.general']['appearance.theme'],
            theme_palette: () => SETTINGS_VALUES['app.general']['appearance.palette'],
            interface_locale: () => SETTINGS_VALUES['app.general']['appearance.language'],
            reader_theme: () => SETTINGS_VALUES['app.general']['reader.theme'],
            reader_font: () => SETTINGS_VALUES['app.general']['reader.font'],
            window_open_tabs_limit: () => SETTINGS_VALUES['app.general']['window.open_tabs_limit'],
            show_window: () => null,
            app_title_set: () => null,
            app_name_set: () => null,
            support_report: () => ({
                file_name: 'context-report-test.txt',
                content: 'Отчёт «Контекст» для поддержки\n',
            }),
            support_report_save: () => '/tmp/context-report-test.txt',
            diagnostics_open_folder: () => null,
            open_folder: () => null,
            app_info: () => ({
                name: 'Контекст',
                version: '0.1.0',
                paths: [
                    {
                        key: 'app_data',
                        title: 'app.settings.data.title',
                        path: '/home/user/.context',
                        note: 'app.settings.data.note',
                    },
                    {
                        key: 'diagnostics',
                        title: 'app.settings.logs.title',
                        path: '/home/user/.context/app-state/diagnostics.log',
                        note: '',
                    },
                ],
            }),
            plugin_activation_pending: () => ({ pending: false }),
            update_status: () => ({
                current_version: '0.1.0',
                config: {
                    source: null,
                    check_on_startup: true,
                    skipped_version: null,
                },
                last_check: null,
            }),
            update_check: () => ({
                source: null,
                core: null,
                checked_at_millis: 0,
                errors: [],
            }),
            update_source_set: () => ({
                source: null,
                check_on_startup: true,
                skipped_version: null,
            }),
            update_source_clear: () => ({
                source: null,
                check_on_startup: true,
                skipped_version: null,
            }),
            update_check_on_startup_set: () => ({
                source: null,
                check_on_startup: true,
                skipped_version: null,
            }),
            update_apply: () => ({ version: '0.1.0', restart_required: false, log_path: '' }),
            update_skip: () => ({
                source: null,
                check_on_startup: true,
                skipped_version: null,
            }),
            update_restart: () => null,
            update_quit: () => null,
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
                        provider_name: 'books-source',
                        added_at_millis: 1_700_000_000_000,
                        available: true,
                    },
                ],
            }),
            library_history_forget: () => ({ forgotten: true }),
        },
    };
}
