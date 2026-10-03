/** Палитры оформления: реестр доступных наборов токенов.
 *
 * Владелец шва оформления — дизайн-система: палитра — это пара наборов токенов
 * (светлый и тёмный), а активную пару выбирают атрибуты на корне документа:
 * `data-palette` задаёт палитру, `data-theme` — светлую или тёмную сторону.
 * Модуль не знает о компонентах; реестр используют оболочка (переключатель в
 * шапке) и настройки приложения.
 */

/** Идентификатор палитры оформления. */
export type PaletteId = 'gruvbox' | 'mist';

/** Палитра оформления: идентификатор и человекочитаемое название. */
export interface Palette {
  /** Машинный идентификатор — значение атрибута `data-palette`. */
  id: PaletteId;
  /** Человекочитаемое название для интерфейса. */
  title: string;
}

/** Палитра по умолчанию — официальная Gruvbox. */
export const DEFAULT_PALETTE: PaletteId = 'gruvbox';

/** Реестр палитр дизайн-системы. */
export const PALETTES: readonly Palette[] = [
  { id: 'gruvbox', title: 'Gruvbox' },
  { id: 'mist', title: 'Mist' },
];

/** Проверка, что значение — известный идентификатор палитры. */
export function isPaletteId(value: unknown): value is PaletteId {
  return PALETTES.some((palette) => palette.id === value);
}

/** Приведение произвольного значения к известному идентификатору палитры.
 *
 * Неизвестное или отсутствующее значение трактуется как палитра по умолчанию,
 * чтобы некорректные данные не оставляли интерфейс без оформления.
 */
export function normalizePaletteId(value: unknown): PaletteId {
  return isPaletteId(value) ? value : DEFAULT_PALETTE;
}

/** Применение палитры к корню документа.
 *
 * Устанавливает атрибут `data-palette`; сторона темы (светлая/тёмная) задаётся
 * отдельно атрибутом `data-theme` модулем `theme.ts`.
 */
export function applyPalette(
  palette: unknown,
  root: HTMLElement = document.documentElement,
): void {
  root.dataset.palette = normalizePaletteId(palette);
}
