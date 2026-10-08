/** Загрузка начального состояния приложения до первого рендера.
 *
 * Рабочее место — точка входа приложения, поэтому реестр рабочих мест и сведения
 * об активной библиотеке загружаются **до** монтирования оболочки. Тогда при
 * первом рендере список рабочих мест уже готов: нет промежутка, в котором
 * показывается стартовая страница или пустой список, и нельзя случайно нажать
 * то, что ещё не загрузилось. Ошибка загрузки — отдельное состояние: она не
 * выглядит как «рабочих мест нет».
 *
 * Стадия бутстрапа — единственное место для всего, что требует загрузки. Данные
 * встроенных поверхностей, которые иначе грузились бы лениво при первом
 * обращении (декларации настроек), тоже читаются здесь: к первому кадру всё
 * готово, и открытие раздела не вызывает подвисания.
 *
 * Модуль чист от Svelte и пригоден для тестов.
 */

import type { NormalizedDeclaration } from '../settings/settings';
import { loadSettingsUi } from '../settings/settings';
import {
  applyAppPalette,
  applyAppReaderTheme,
  applyAppThemeTracked,
  loadReaderTheme,
  loadThemePalette,
  loadThemePreference,
} from '../appearance/theme';
import {
  DEFAULT_PALETTE,
  DEFAULT_READER_THEME,
  type PaletteId,
  type ReaderThemeId,
  type ThemePreference,
} from '@texture/ui';
import {
  listNotifications,
  loadTechnicalVisibleDefault,
  type NotificationEntry,
} from '../notifications/notifications';
import {
  loadActivationPending,
  loadStoreCatalog,
  type PluginEntry,
  type Store,
} from '../store/plugin-store';
import { listAllSets, type NoteSet } from '../notes/notes';
import { invokeCommand } from '../../shared/app-bridge';
import { activeLibrary } from '../../shared/base-plugin';

/** Активная библиотека для шапки. */
export interface ActiveLibrary {
    /** Человекочитаемое имя провайдера. */
    provider_name?: string;
    /** Путь библиотеки. */
    path?: string;
}

/** Загруженное начальное состояние приложения. */
export interface BootstrapState {
    /** Снимок реестра рабочих мест из ядра (нормализует вызывающий). */
    registry: unknown;
    /** Активная библиотека или null, когда библиотека не открыта. */
    activeLibrary: ActiveLibrary | null;
    /** Оформление: применённые тема и палитра, загруженные до первого рендера. */
    appearance: AppearanceBootstrap;
    /** Декларации интерфейса настроек, загруженные до первого рендера. */
    settings: SettingsBootstrap;
    /** Журнал уведомлений и настройки его показа, загруженные до первого рендера. */
    notifications: NotificationsBootstrap;
    /** Каталог плагинов и сторов, загруженный до первого рендера. */
    store: StoreBootstrap;
    /** Реестр наборов заметок, загруженный до первого рендера. */
    notesLibrary: NotesLibraryBootstrap;
}

/** Оформление, прочитанное и применённое на бутстрапе. */
export interface AppearanceBootstrap {
    /** Предпочтение темы: светлая, тёмная или системная. */
    theme: ThemePreference;
    /** Активная палитра оформления. */
    palette: PaletteId;
    /** Тема области чтения (светлая или тёмная), независимая от интерфейса. */
    readerTheme: ReaderThemeId;
}

/** Декларации интерфейса настроек и ошибка их загрузки на бутстрапе. */
export interface SettingsBootstrap {
    /** Нормализованные декларации пространства «секция настроек». */
    declarations: NormalizedDeclaration[];
    /** Ошибка загрузки или несовместимой версии схемы, иначе пустая строка. */
    error: string;
}

/** Журнал уведомлений и настройки его показа на бутстрапе. */
export interface NotificationsBootstrap {
    /** Записи журнала. */
    entries: NotificationEntry[];
    /** Показывать ли технические записи по умолчанию. */
    technicalVisible: boolean;
    /** Ошибка загрузки журнала, иначе пустая строка. */
    error: string;
}

/** Каталог плагинов и сторов на бутстрапе. */
export interface StoreBootstrap {
    /** Перечень отключаемых плагинов. */
    plugins: PluginEntry[];
    /** Реестр подключённых сторов. */
    stores: Store[];
    /** Есть ли неприменённые изменения активности плагинов. */
    activationPending: boolean;
    /** Ошибка загрузки каталога, иначе пустая строка. */
    error: string;
}

/** Реестр наборов заметок на бутстрапе. */
export interface NotesLibraryBootstrap {
    /** Наборы заметок всех книг (агрегат `list_all_sets`). */
    sets: NoteSet[];
    /** Ошибка загрузки реестра, иначе пустая строка. */
    error: string;
}

/** Загрузка начального состояния приложения: реестр, библиотека, поверхности.
 *
 * Сведения о библиотеке необязательны — при ошибке она считается не открытой;
 * ошибка реестра рабочих мест пробрасывается, потому что от неё зависит
 * отображение точки входа. Данные встроенных поверхностей (декларации настроек,
 * журнал уведомлений, каталог плагинов и сторов) тоже необязательны: их ошибка
 * не должна мешать входу в приложение.
 */
export async function loadBootstrap(): Promise<BootstrapState> {
    const [registry, library, appearance, settings, notifications, store, notesLibrary] =
        await Promise.all([
            invokeCommand('get_workspaces', {}),
            loadActiveLibrary(),
            applyAppearance(),
            loadSettingsBootstrap(),
            loadNotificationsBootstrap(),
            loadStoreBootstrap(),
            loadNotesLibraryBootstrap(),
        ]);
    return {
        registry,
        activeLibrary: library,
        appearance,
        settings,
        notifications,
        store,
        notesLibrary,
    };
}

/** Чтение и применение оформления до первого кадра.
 *
 * Тема, палитра и тема области чтения читаются параллельно; ошибка чтения
 * каждой оставляет значение по умолчанию (системная тема, палитра по умолчанию,
 * светлая область чтения) и не прерывает вход.
 */
async function applyAppearance(): Promise<AppearanceBootstrap> {
    const [theme, palette, readerTheme] = await Promise.all([
        loadThemePreference().catch(() => 'system' as ThemePreference),
        loadThemePalette().catch(() => DEFAULT_PALETTE),
        loadReaderTheme().catch(() => DEFAULT_READER_THEME),
    ]);
    applyAppThemeTracked(theme);
    applyAppPalette(palette);
    applyAppReaderTheme(readerTheme);
    return { theme, palette, readerTheme };
}

/** Загрузка деклараций настроек; ошибка даёт пустое пространство с диагностикой. */
async function loadSettingsBootstrap(): Promise<SettingsBootstrap> {
    try {
        return await loadSettingsUi();
    } catch (error) {
        return { declarations: [], error: String(error) };
    }
}

/** Загрузка журнала уведомлений; ошибка даёт пустой журнал с диагностикой. */
async function loadNotificationsBootstrap(): Promise<NotificationsBootstrap> {
    let entries: NotificationEntry[] = [];
    let technicalVisible = false;
    let error = '';
    try {
        entries = await listNotifications();
    } catch (cause) {
        error = String(cause);
    }
    try {
        const value = await loadTechnicalVisibleDefault();
        if (value !== null) {
            technicalVisible = value;
        }
    } catch {
        // Отсутствие секции настроек не мешает панели уведомлений.
    }
    return { entries, technicalVisible, error };
}

/** Загрузка каталога плагинов и сторов; ошибка даёт пустой каталог с диагностикой. */
async function loadStoreBootstrap(): Promise<StoreBootstrap> {
    let plugins: PluginEntry[] = [];
    let stores: Store[] = [];
    let activationPending = false;
    let error = '';
    try {
        const catalog = await loadStoreCatalog();
        plugins = catalog.plugins;
        stores = catalog.stores;
    } catch (cause) {
        error = String(cause);
    }
    try {
        activationPending = await loadActivationPending();
    } catch {
        // Отсутствие признака не мешает работе страницы.
    }
    return { plugins, stores, activationPending, error };
}

/** Загрузка сведений об активной библиотеке; ошибка даёт «не открыта». */
async function loadActiveLibrary(): Promise<ActiveLibrary | null> {
    try {
        const result = await activeLibrary();
        return result as ActiveLibrary | null;
    } catch {
        return null;
    }
}

/** Загрузка реестра наборов заметок; ошибка даёт пустой реестр с диагностикой. */
async function loadNotesLibraryBootstrap(): Promise<NotesLibraryBootstrap> {
    try {
        return { sets: await listAllSets(), error: '' };
    } catch (cause) {
        return { sets: [], error: String(cause) };
    }
}
