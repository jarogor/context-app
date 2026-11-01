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
 * встроенных областей, которые иначе грузились бы лениво при первом
 * обращении (декларации настроек), тоже читаются здесь: к первому кадру всё
 * готово, и открытие раздела не вызывает подвисания.
 *
 * Модуль чист от Svelte и пригоден для тестов.
 */

import type { NormalizedDeclaration } from '../settings/settings';
import { loadSettingsUi } from '../settings/settings';
import {
  applyAppPalette,
  applyAppReaderFont,
  applyAppReaderTheme,
  applyAppThemeTracked,
  loadReaderFont,
  loadReaderTheme,
  loadThemePalette,
  loadThemePreference,
  persistBootAppearance,
} from '../appearance/theme';
import { applyAppLocale, loadInterfaceLocale } from '../appearance/locale';
import { DEFAULT_LOCALE, t, type Locale } from '@context/i18n';
import {
  DEFAULT_PALETTE,
  DEFAULT_READER_FONT,
  DEFAULT_READER_THEME,
  type PaletteId,
  type ReaderFontId,
  type ReaderThemeId,
  type ThemePreference,
} from '@context/ui';
import { listNotifications, type NotificationEntry } from '../notifications/notifications';
import {
  addStore as addStoreEntry,
  loadActivationPending,
  loadStoreCatalog,
  type PluginEntry,
  type Store,
} from '../store/plugin-store';
import { DEFAULT_OPEN_TABS_LIMIT } from '../workplace/workplace';
import { loadOpenTabsLimit } from '../workplace/open-tabs-limit';
import { loadCovers } from '../library/covers';
import { loadUpdateStatus, type UpdateBootstrap } from '../update/update';
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
    /** Лимит числа открытых вкладок рабочего места (значение по умолчанию при ошибке). */
    openTabsLimit: number;
    /** Состояние обновлений, прочитанное до первого рендера. */
    update: UpdateBootstrap;
}

/** Оформление, прочитанное и применённое на бутстрапе. */
export interface AppearanceBootstrap {
    /** Предпочтение темы: светлая, тёмная или системная. */
    theme: ThemePreference;
    /** Активная палитра оформления. */
    palette: PaletteId;
    /** Тема области чтения (светлая или тёмная), независимая от интерфейса. */
    readerTheme: ReaderThemeId;
    /** Гарнитура книги: с засечками или без. */
    readerFont: ReaderFontId;
    /** Язык интерфейса, применённый до первого рендера. */
    locale: Locale;
}

/** Декларации интерфейса настроек и ошибка их загрузки на бутстрапе. */
export interface SettingsBootstrap {
    /** Нормализованные декларации пространства «секция настроек». */
    declarations: NormalizedDeclaration[];
    /** Ошибка загрузки или несовместимой версии схемы, иначе пустая строка. */
    error: string;
}

/** Журнал уведомлений на бутстрапе. */
export interface NotificationsBootstrap {
    /** Записи журнала. */
    entries: NotificationEntry[];
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

/** Загрузка начального состояния приложения: реестр, библиотека, области.
 *
 * Сведения о библиотеке необязательны — при ошибке она считается не открытой;
 * ошибка реестра рабочих мест пробрасывается, потому что от неё зависит
 * отображение точки входа. Данные встроенных областей (декларации настроек,
 * журнал уведомлений, каталог плагинов и сторов) тоже необязательны: их ошибка
 * не должна мешать входу в приложение.
 *
 * Реестр заметок и форматы читалки на этой стадии НЕ читаются: они зависят от
 * объёма пользовательских данных и от плагинов чтения, которые не нужны первому
 * кадру. Их загружают области при соответствующем действии пользователя.
 */
export async function loadBootstrap(): Promise<BootstrapState> {
    const [registry, library, appearance, settings, notifications, store, openTabsLimit, update] =
        await Promise.all([
            invokeCommand('get_workspaces', {}),
            loadActiveLibrary(),
            applyAppearance(),
            loadSettingsBootstrap(),
            loadNotificationsBootstrap(),
            loadStoreBootstrap(),
            loadOpenTabsLimit().catch(() => DEFAULT_OPEN_TABS_LIMIT),
            loadUpdateBootstrap(),
        ]);
    // Обложки книг рабочих мест готовятся до первого кадра: список рисуется с
    // ними сразу и не дорисовывает их по одной. Извлечение кэшируется в ядре,
    // поэтому повторный запуск читает готовые обложки.
    await loadWorkspaceCovers(registry).catch(() => {});
    await ensureUpdatePlace(store, update).catch(() => {});
    return {
        registry,
        activeLibrary: library,
        appearance,
        settings,
        notifications,
        store,
        openTabsLimit,
        update,
    };
}

/** Пути книг всех вкладок рабочих мест из непрозрачного реестра. */
function workspaceBookPaths(registry: unknown): string[] {
    const record = (registry ?? {}) as { workspaces?: unknown };
    const workspaces = Array.isArray(record.workspaces) ? record.workspaces : [];
    const paths: string[] = [];
    for (const item of workspaces) {
        const tabs = (item as { tabs?: unknown })?.tabs;
        if (!Array.isArray(tabs)) {
            continue;
        }
        for (const tab of tabs) {
            const path = String((tab as { path?: unknown })?.path ?? '').trim();
            if (path && !paths.includes(path)) {
                paths.push(path);
            }
        }
    }
    return paths;
}

/** Загрузка обложек книг рабочих мест в кэш оболочки до первого рендера. */
async function loadWorkspaceCovers(registry: unknown): Promise<void> {
    await loadCovers(workspaceBookPaths(registry));
}

/** Регистрация встроенного адреса обновлений среди мест обновления. */
async function ensureUpdatePlace(
    store: StoreBootstrap,
    update: UpdateBootstrap,
): Promise<void> {
    const source = update.status?.config.source;
    if (!source) {
        return;
    }
    if (store.stores.some((item) => item.kind === source.kind && item.location === source.location)) {
        return;
    }
    const title =
        source.kind === 'network'
            ? (() => {
                  try {
                      return new URL(source.location).host;
                  } catch {
                      return t('app.store.updatesFor');
                  }
              })()
            : source.location.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ||
              t('app.store.updatesFor');
    await addStoreEntry({
        id: `updates-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-${source.location.length}`,
        kind: source.kind,
        title,
        location: source.location,
    });
    store.stores = (await loadStoreCatalog()).stores;
}

/** Чтение и применение оформления до первого кадра.
 *
 * Тема, палитра и тема области чтения читаются параллельно; ошибка чтения
 * каждой оставляет значение по умолчанию (системная тема, палитра по умолчанию,
 * светлая область чтения) и не прерывает вход.
 */
async function applyAppearance(): Promise<AppearanceBootstrap> {
    const [theme, palette, readerTheme, readerFont, locale] = await Promise.all([
        loadThemePreference().catch(() => 'system' as ThemePreference),
        loadThemePalette().catch(() => DEFAULT_PALETTE),
        loadReaderTheme().catch(() => DEFAULT_READER_THEME),
        loadReaderFont().catch(() => DEFAULT_READER_FONT),
        loadInterfaceLocale().catch(() => DEFAULT_LOCALE),
    ]);
    applyAppThemeTracked(theme);
    applyAppPalette(palette);
    applyAppReaderTheme(readerTheme);
    applyAppReaderFont(readerFont);
    // Язык применяется до первого кадра: экран загрузки и оболочка читают одни
    // и те же словари, и подмена языка не видна пользователю.
    applyAppLocale(locale);
    // Зеркало оформления для статичного экрана загрузки следующего запуска.
    persistBootAppearance({ theme, palette });
    return { theme, palette, readerTheme, readerFont, locale };
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
    try {
        return { entries: await listNotifications(), error: '' };
    } catch (cause) {
        return { entries: [], error: String(cause) };
    }
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

/** Загрузка состояния обновлений; ошибка не мешает входу в приложение. */
async function loadUpdateBootstrap(): Promise<UpdateBootstrap> {
    try {
        return { status: await loadUpdateStatus(), error: '' };
    } catch (cause) {
        return { status: null, error: String(cause) };
    }
}
