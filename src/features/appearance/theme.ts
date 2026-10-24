/** Оформление оболочки: чтение предпочтения и применение к документу.
 *
 * Логика оформления (тип предпочтения, разрешение в светлую/тёмную и реестр
 * палитр) принадлежит дизайн-системе `@context/ui`. Оболочка лишь читает
 * сохранённые значения из ядра, применяет их и реагирует на изменение настроек.
 * Модуль чист от Svelte и пригоден для тестов.
 */

import {
  applyPalette,
  applyReaderFont,
  applyReaderTheme,
  applyTheme,
  normalizePaletteId,
  normalizeReaderFontId,
  normalizeReaderThemeId,
  normalizeThemePreference,
  type PaletteId,
  type ReaderFontId,
  type ReaderThemeId,
  type ThemePreference,
  type UnsubscribeTheme,
} from '@context/ui';
import { invokeCommand } from '../../shared/app-bridge';

/** Секция настроек приложения, изменение которой может сменить оформление. */
export const APP_SETTINGS_SECTION = 'app.general';

/** Ключ значения темы в секции настроек приложения. */
export const THEME_SETTING_KEY = 'appearance.theme';

/** Ключ значения палитры в секции настроек приложения. */
export const PALETTE_SETTING_KEY = 'appearance.palette';

/** Ключ темы области чтения в секции настроек приложения. */
export const READER_THEME_SETTING_KEY = 'reader.theme';

/** Ключ гарнитуры книги в секции настроек приложения. */
export const READER_FONT_SETTING_KEY = 'reader.font';

/** Чтение сохранённого предпочтения темы из ядра.
 *
 * Неизвестное или отсутствующее значение приводится к `system`; ошибку чтения
 * вызывающий обрабатывает сам.
 */
export async function loadThemePreference(): Promise<ThemePreference> {
  const value = await invokeCommand('theme_preference', {});
  return normalizeThemePreference(value);
}

/** Чтение сохранённой палитры оформления из ядра.
 *
 * Неизвестное или отсутствующее значение приводится к палитре по умолчанию;
 * ошибку чтения вызывающий обрабатывает сам.
 */
export async function loadThemePalette(): Promise<PaletteId> {
  const value = await invokeCommand('theme_palette', {});
  return normalizePaletteId(value);
}

/** Чтение сохранённой темы области чтения из ядра.
 *
 * Неизвестное или отсутствующее значение приводится к светлой теме; ошибку
 * чтения вызывающий обрабатывает сам.
 */
export async function loadReaderTheme(): Promise<ReaderThemeId> {
  const value = await invokeCommand('reader_theme', {});
  return normalizeReaderThemeId(value);
}

/** Чтение сохранённой гарнитуры книги из ядра.
 *
 * Неизвестное или отсутствующее значение приводится к шрифту с засечками.
 */
export async function loadReaderFont(): Promise<ReaderFontId> {
  const value = await invokeCommand('reader_font', {});
  return normalizeReaderFontId(value);
}

/** Ключ сохранённого оформления для статичного экрана загрузки до бандла.
 *
 * Значение читает `index.html` до загрузки бандла: там нет ни дизайн-системы,
 * ни токенов, поэтому цвета и сторону темы берут из этого ключа, чтобы экран
 * загрузки сразу совпал с выбранным оформлением, а не показывал чужой набор.
 */
export const BOOT_APPEARANCE_KEY = 'context.appearance';

/** Оформление, пригодное для экрана загрузки до бандла. */
export interface BootAppearance {
  /** Предпочтение темы. */
  theme: ThemePreference;
  /** Активная палитра. */
  palette: PaletteId;
}

/** Чтение сохранённого оформления экрана загрузки; `null` — данных нет. */
export function readBootAppearance(): BootAppearance | null {
  try {
    const raw = localStorage.getItem(BOOT_APPEARANCE_KEY);
    if (!raw) {
      return null;
    }
    const value = JSON.parse(raw) as { theme?: unknown; palette?: unknown };
    return {
      theme: normalizeThemePreference(value.theme),
      palette: normalizePaletteId(value.palette),
    };
  } catch {
    return null;
  }
}

/** Сохранение оформления для экрана загрузки следующего запуска. */
export function persistBootAppearance(value: BootAppearance): void {
  try {
    localStorage.setItem(
      BOOT_APPEARANCE_KEY,
      JSON.stringify({ theme: value.theme, palette: value.palette }),
    );
  } catch {
    // Недоступное хранилище не мешает применению оформления в текущей сессии.
  }
}

/** Применение предпочтения темы к документу.
 *
 * Возвращает функцию снятия подписки на тему операционной системы (для
 * `system`); вызывающий хранит её и снимает перед повторным применением.
 */
export function applyAppTheme(
  preference: unknown,
  root?: HTMLElement,
  media?: MediaQueryList,
): UnsubscribeTheme {
  return applyTheme(normalizeThemePreference(preference), root, media);
}

/** Активная подписка на тему операционной системы. */
let currentUnsubscribe: UnsubscribeTheme | null = null;

/** Применение темы с заменой прежней подписки.
 *
 * Тема применяется в нескольких местах (бутстрап, реакция на изменение
 * настроек). Хранение единственной подписки гарантирует, что переключение
 * предпочтения не оставит лишних слушателей темы ОС.
 */
export function applyAppThemeTracked(preference: unknown): void {
  currentUnsubscribe?.();
  currentUnsubscribe = applyAppTheme(preference);
}

/** Применение палитры оформления к документу. */
export function applyAppPalette(palette: unknown, root?: HTMLElement): void {
  applyPalette(normalizePaletteId(palette), root);
}

/** Применение темы области чтения к корню документа.
 *
 * Сторона темы области чтения независима от темы интерфейса и выставляется
 * отдельным атрибутом `data-reader-theme`; компоненты о ней не знают.
 */
export function applyAppReaderTheme(theme: unknown, root?: HTMLElement): void {
  applyReaderTheme(normalizeReaderThemeId(theme), root);
}

/** Применение гарнитуры книги к корню области содержимого. */
export function applyAppReaderFont(font: unknown, root?: HTMLElement): void {
  applyReaderFont(normalizeReaderFontId(font), root);
}

/** Извлечение темы из события `settings:changed`.
 *
 * Возвращает предпочтение только для секции приложения; для других секций или
 * при отсутствии значения — `null`, чтобы оболочка не трогала тему зря.
 */
export function themeFromSettingsEvent(payload: unknown): ThemePreference | null {
  const values = appSettingsValues(payload);
  if (values === null) {
    return null;
  }
  const value = values[THEME_SETTING_KEY];
  return value === undefined ? null : normalizeThemePreference(value);
}

/** Извлечение палитры из события `settings:changed`.
 *
 * Возвращает палитру только для секции приложения; для других секций или при
 * отсутствии значения — `null`.
 */
export function paletteFromSettingsEvent(payload: unknown): PaletteId | null {
  const values = appSettingsValues(payload);
  if (values === null) {
    return null;
  }
  const value = values[PALETTE_SETTING_KEY];
  return value === undefined ? null : normalizePaletteId(value);
}

/** Извлечение темы области чтения из события `settings:changed`.
 *
 * Возвращает тему только для секции приложения; для других секций или при
 * отсутствии значения — `null`, чтобы оболочка не меняла область чтения зря.
 */
export function readerThemeFromSettingsEvent(payload: unknown): ReaderThemeId | null {
  const values = appSettingsValues(payload);
  if (values === null) {
    return null;
  }
  const value = values[READER_THEME_SETTING_KEY];
  return value === undefined ? null : normalizeReaderThemeId(value);
}

/** Извлечение гарнитуры книги из события `settings:changed`.
 *
 * Возвращает гарнитуру только для секции приложения; для других секций или при
 * отсутствии значения — `null`, чтобы оболочка не меняла шрифт книги зря.
 */
export function readerFontFromSettingsEvent(payload: unknown): ReaderFontId | null {
  const values = appSettingsValues(payload);
  if (values === null) {
    return null;
  }
  const value = values[READER_FONT_SETTING_KEY];
  return value === undefined ? null : normalizeReaderFontId(value);
}

/** Значения секции приложения из события `settings:changed` или `null`. */
function appSettingsValues(payload: unknown): Record<string, unknown> | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const event = payload as { section?: unknown; values?: Record<string, unknown> };
  if (event.section !== APP_SETTINGS_SECTION) {
    return null;
  }
  return event.values ?? {};
}
