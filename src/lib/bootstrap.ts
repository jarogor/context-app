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

import type { NormalizedDeclaration } from './settings';
import { loadSettingsUi } from './settings';
import { applyAppThemeTracked, loadThemePreference } from './theme';
import {
  listNotifications,
  loadTechnicalVisibleDefault,
  type NotificationEntry,
} from './notifications';
import {
  loadActivationPending,
  loadStoreCatalog,
  type PluginEntry,
  type Store,
} from './plugin-store';
import { invokeCommand } from './app-bridge';

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
    /** Декларации интерфейса настроек, загруженные до первого рендера. */
    settings: SettingsBootstrap;
    /** Журнал уведомлений и настройки его показа, загруженные до первого рендера. */
    notifications: NotificationsBootstrap;
    /** Каталог плагинов и сторов, загруженный до первого рендера. */
    store: StoreBootstrap;
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

/** Загрузка начального состояния приложения: реестр, библиотека, поверхности.
 *
 * Сведения о библиотеке необязательны — при ошибке она считается не открытой;
 * ошибка реестра рабочих мест пробрасывается, потому что от неё зависит
 * отображение точки входа. Данные встроенных поверхностей (декларации настроек,
 * журнал уведомлений, каталог плагинов и сторов) тоже необязательны: их ошибка
 * не должна мешать входу в приложение.
 */
export async function loadBootstrap(): Promise<BootstrapState> {
    const [registry, library, settings, notifications, store] = await Promise.all([
        invokeCommand('get_workspaces', {}),
        loadActiveLibrary(),
        loadSettingsBootstrap(),
        loadNotificationsBootstrap(),
        loadStoreBootstrap(),
    ]);
    // Тема применяется до первого кадра: чтение ошибок не прерывает вход.
    await applyThemePreference();
    return { registry, activeLibrary: library, settings, notifications, store };
}

/** Чтение и применение сохранённой темы; ошибка оставляет системную тему. */
async function applyThemePreference(): Promise<void> {
    try {
        applyAppThemeTracked(await loadThemePreference());
    } catch {
        applyAppThemeTracked('system');
    }
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
        const result = (await invokeCommand('active_library', {})) as ActiveLibrary | null;
        return result?.path ? result : null;
    } catch {
        return null;
    }
}
