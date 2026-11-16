/** Оформление библиотеки в списке и карточке: подпись, иконка и цвет.
 *
 * Оформление библиотеки повторяет вид вкладки рабочего места: пользовательское
 * название перекрывает имя папки, иконка стоит перед названием, а цвет
 * показывается небольшим знаком — на кнопке меню списка и на карточке. Модуль
 * держит чистые функции этого вида и не зависит от Svelte и DOM.
 *
 * Цвета берутся из общего реестра дизайн-системы: тот же цвет получает значок
 * библиотеки и вкладки, поэтому «синяя» библиотека и «синяя» вкладка выглядят
 * одинаково.
 */

import {
  ACCENT_COLORS,
  ACCENT_COLOR_SWATCHES,
  accentFill,
  accentMark,
  TAB_ICON_NAMES,
} from '@context/ui';
import type { AccentMarkStyle, AccentStrength } from '@context/ui';
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

/** Пара «заливка и подпись» знака библиотеки; отсутствует без цвета.
 *
 * Строка списка не заливается цветом: одинаковые строки должны выглядеть
 * одинаково, иначе выбранная теряется среди цветных. Цвет остаётся на небольшом
 * знаке — кнопке меню строки и подписи карточки.
 */
export function libraryColorMark(color: LibraryColor | undefined): AccentMarkStyle | undefined {
  return accentMark(color);
}

/** CSS-фон шапки карточки библиотеки; отсутствует, если цвет не задан.
 *
 * Карточка показывает одну запись и стоит отдельно от списка, поэтому её шапка
 * по-прежнему заливается цветом: заливка не мешает узнаванию списка, а подпись
 * и значок берут свою пару чернил. Ступени те же, что у карточки вкладки:
 * невыбранная запись — тихая, выбранная — плотная.
 */
export function libraryColorFill(
  color: LibraryColor | undefined,
  options: { strength?: AccentStrength; selected?: boolean } = {},
): string | undefined {
  return accentFill(color, {
    strength: options.strength ?? (options.selected ? 'active' : 'tint'),
  });
}
