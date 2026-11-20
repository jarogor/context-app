/** Режим интерфейса и масштаб шкалы: настройки пользователя.
 *
 * Режимов два — узкий («Планшет»: смартфон и планшет) и «Десктоп». Третий
 * вариант, `auto`, следует ширине окна и потому не является третьим режимом:
 * он лишь отменяет принудительный выбор.
 *
 * Масштаб — множитель шкалы в процентах (80–140%). Он меняет отступы, кегли,
 * радиусы и ширины панелей, а не только текст, поэтому выставляется переменной
 * `--ui-scale` на корне документа.
 *
 * Значения живут в секции настроек приложения (`interface.mode`,
 * `interface.scale`) и читаются ядром. Модуль чист от Svelte: оболочка читает их
 * на бутстрапе, применяет и обновляет по событию `settings:changed`.
 */

import { invokeCommand } from '../../shared/app-bridge';
import { APP_SETTINGS_SECTION } from './theme';

/** Выбор пользователя: следовать ширине окна или задать режим принудительно. */
export type InterfaceMode = 'auto' | 'tablet' | 'desktop';

/** Действующий режим раскладки — без варианта `auto`. */
export type ResolvedInterfaceMode = 'tablet' | 'desktop';

/** Ключ выбора режима в секции настроек приложения. */
export const INTERFACE_MODE_SETTING_KEY = 'interface.mode';

/** Ключ масштаба в секции настроек приложения. */
export const INTERFACE_SCALE_SETTING_KEY = 'interface.scale';

/** Режим по умолчанию: следует ширине окна. */
export const DEFAULT_INTERFACE_MODE: InterfaceMode = 'auto';

/** Масштаб по умолчанию, процентов. */
export const DEFAULT_INTERFACE_SCALE = 100;

/**
 * Ступени масштаба, процентов.
 *
 * Шкала прогрессивная: в середине шаг 10, к краям он растёт. Между ступенями
 * произвольных значений нет — масштаб меняется заметно, а не по проценту, и
 * каждая ступень проверена на раскладке.
 */
export const INTERFACE_SCALE_STEPS = [70, 80, 90, 100, 110, 125, 150, 175, 200] as const;

/** Приведение выбора режима к допустимому значению. */
export function normalizeInterfaceMode(value: unknown): InterfaceMode {
  return value === 'tablet' || value === 'desktop' ? value : DEFAULT_INTERFACE_MODE;
}

/**
 * Приведение масштаба к ближайшей ступени шкалы.
 *
 * Ступень — единственное допустимое значение: масштаб между ступенями не
 * выбирается, поэтому он приводится к ближайшей, а не зажимается в границы.
 */
export function normalizeInterfaceScale(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(parsed)) {
    return DEFAULT_INTERFACE_SCALE;
  }
  return INTERFACE_SCALE_STEPS.reduce((nearest, step) =>
    Math.abs(step - parsed) < Math.abs(nearest - parsed) ? step : nearest,
  );
}

/** Множитель шкалы для переменной `--ui-scale`. */
export function interfaceScaleFactor(percent: number): number {
  return normalizeInterfaceScale(percent) / 100;
}

/** Чтение выбора режима из ядра. */
export async function loadInterfaceMode(): Promise<InterfaceMode> {
  const value = await invokeCommand('interface_mode', {});
  return normalizeInterfaceMode(value);
}

/** Чтение масштаба из ядра.
 *
 * Ядро отдаёт ступень строкой (`"100"`), поэтому значение приводится к числу
 * до нормализации.
 */
export async function loadInterfaceScale(): Promise<number> {
  const value = await invokeCommand('interface_scale', {});
  return normalizeInterfaceScale(value);
}

/** Извлечение выбора режима из события `settings:changed`. */
export function interfaceModeFromSettingsEvent(payload: unknown): InterfaceMode | null {
  const values = settingsValues(payload);
  if (!values) {
    return null;
  }
  const value = values[INTERFACE_MODE_SETTING_KEY];
  return value === undefined ? null : normalizeInterfaceMode(value);
}

/** Извлечение масштаба из события `settings:changed`. */
export function interfaceScaleFromSettingsEvent(payload: unknown): number | null {
  const values = settingsValues(payload);
  if (!values) {
    return null;
  }
  const value = values[INTERFACE_SCALE_SETTING_KEY];
  return value === undefined ? null : normalizeInterfaceScale(value);
}

/** Значения секции приложения из события настроек; `null` — чужая секция. */
function settingsValues(payload: unknown): Record<string, unknown> | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const event = payload as { section?: unknown; values?: Record<string, unknown> };
  if (event.section !== APP_SETTINGS_SECTION) {
    return null;
  }
  return event.values ?? null;
}

/**
 * Применение действующего режима к документу.
 *
 * Режим ставится атрибутом `data-ui-mode`: он выбирает раскладку и не зависит от
 * фактической ширины окна — принудительный выбор должен работать и на чужой
 * ширине.
 */
export function applyInterfaceMode(
  mode: ResolvedInterfaceMode,
  root: HTMLElement = document.documentElement,
): void {
  root.dataset.uiMode = mode;
}

/**
 * Применение масштаба к документу.
 *
 * Меняется одна переменная `--ui-scale`: из неё построена вся шкала токенов,
 * поэтому отдельные элементы пересчитывать не нужно.
 */
export function applyInterfaceScale(
  percent: number,
  root: HTMLElement = document.documentElement,
): void {
  root.style.setProperty('--ui-scale', String(interfaceScaleFactor(percent)));
}
