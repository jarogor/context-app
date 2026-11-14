/** Оформление библиотеки в списке и карточке: подпись, иконка и цвет.
 *
 * Оформление библиотеки повторяет вид вкладки рабочего места: пользовательское
 * название перекрывает имя папки, иконка стоит перед названием, а цвет
 * показывается приглушённой заливкой и обводкой. Модуль держит чистые функции
 * этого вида и не зависит от Svelte и DOM.
 *
 * Цвета берутся из общего реестра дизайн-системы: заливка и обводка считаются
 * там же, где для вкладки, поэтому «синяя» библиотека и «синяя» вкладка
 * выглядят одинаково.
 */

import {
  ACCENT_COLORS,
  ACCENT_COLOR_SWATCHES,
  accentFill,
  accentLine,
  TAB_ICON_NAMES,
} from '@context/ui';
import type { NoteColor } from '../notes/model';

/** Допустимая библиотеке иконка: подмножество набора иконок дизайн-системы.
 *
 * Набор общий с вкладками: оформление библиотеки и вкладки выбирается одними и
 * теми же образцами, поэтому два списка иконок не расходятся.
 */
export type LibraryIcon = (typeof TAB_ICON_NAMES)[number];

/** Цвет оформления библиотеки: общая палитра выбора цвета. */
export type LibraryColor = NoteColor;

/** Идентификаторы допустимых иконок библиотеки. */
export const LIBRARY_ICONS = TAB_ICON_NAMES;

/** Идентификаторы допустимых цветов библиотеки. */
export const LIBRARY_COLORS = ACCENT_COLORS;

/** Образцы цветов библиотеки: насыщенные акценты общей палитры. */
export const LIBRARY_COLOR_SWATCHES = ACCENT_COLOR_SWATCHES;

/** Приведение значения к допустимой иконке библиотеки; неизвестное — «не задано». */
export function normalizeLibraryIcon(value: unknown): LibraryIcon | undefined {
  const candidate = String(value ?? '').trim();
  return (LIBRARY_ICONS as readonly string[]).includes(candidate)
    ? (candidate as LibraryIcon)
    : undefined;
}

/** Приведение значения к известному цвету библиотеки; неизвестное — «не задано». */
export function normalizeLibraryColor(value: unknown): LibraryColor | undefined {
  const candidate = String(value ?? '').trim();
  return (LIBRARY_COLORS as readonly string[]).includes(candidate)
    ? (candidate as LibraryColor)
    : undefined;
}

/** Необязательный текст оформления: пустая строка читается как «не задано». */
export function optionalLibraryText(value: unknown): string | undefined {
  const text = String(value ?? '').trim();
  return text ? text : undefined;
}

/** CSS-фон карточки или строки библиотеки; отсутствует, если цвет не задан.
 *
 * Заливка приглушена и смешивается с поверхностью, на которой лежит запись:
 * карточка читается цветом, но подпись на ней остаётся контрастной. Ступени те
 * же, что у вкладки: невыбранная запись — как неактивная вкладка, выбранная —
 * плотнее.
 */
export function libraryColorFill(
  color: LibraryColor | undefined,
  options: { base?: string; selected?: boolean } = {},
): string | undefined {
  return accentFill(color, {
    base: options.base,
    strength: options.selected ? 'active' : 'tint',
  });
}

/** CSS-цвет обводки библиотеки; отсутствует, если цвет не задан.
 *
 * Обводка меняется вместе с заливкой: цветная запись отличается не только
 * фоном, но и контуром. У невыбранной записи контур слабый (`strong: false`),
 * чтобы она не спорила с выбранной.
 */
export function libraryColorLine(
  color: LibraryColor | undefined,
  options: { strong?: boolean } = {},
): string | undefined {
  return accentLine(color, options);
}
