/** Вид вкладки рабочего места.
 *
 * Панель вкладок (верхняя строка) и панель открытых книг показывают вкладку
 * одинаково: одну и ту же подпись и иконку, а пользовательский цвет — только
 * меткой номера. Модуль держит чистые функции этого вида, чтобы два места не
 * расходились, и не зависит от Svelte и DOM.
 *
 * Цвет берётся из общего реестра дизайн-системы: тот же цвет получает
 * библиотека и любая другая сущность с оформлением.
 */

import { accentMark, type AccentMarkStyle } from '@context/ui';
import type { TabColor, WorkspaceTab } from './workplace';

/** Эффективная подпись вкладки: пользовательское имя перекрывает название книги.
 *
 * Незаданное имя оставляет название книги — оформление дополняет вид, а не
 * заменяет его.
 */
export function tabLabel(tab: Pick<WorkspaceTab, 'name' | 'title'>): string {
  return tab.name?.trim() || tab.title;
}

/** Короткая метка формата книги: `EPUB`, `FB2`, `PDF`, `DJVU`.
 *
 * Формат показывается так же, как на странице книги — заглавными буквами.
 * Пустой или отсутствующий формат даёт `undefined`: пустая метка не должна
 * занимать место в строке.
 */
export function tabFormatLabel(tab: { format?: string }): string | undefined {
  const format = tab.format?.trim();
  return format ? format.toUpperCase() : undefined;
}

/** Метка вкладки в полосе: цвет и интенсивность зависят от активности.
 *
 * Активная вкладка несёт плотный цвет, неактивная — тот же цвет, но тише:
 * цветные номера у неактивных вкладок не должны резать глаз среди спокойной
 * полосы. У вкладки без пользовательского цвета метки нет: номер читается
 * приглушённой подписью.
 */
export function tabColorMark(
  color: TabColor | undefined,
  options: { active?: boolean } = {},
): AccentMarkStyle | undefined {
  return accentMark(color, { strength: options.active ? 'soft' : 'tint' });
}

/** Подсказка вкладки: пользовательское имя и название книги.
 *
 * Вкладка может быть переименована, поэтому подсказка **всегда** называет книгу:
 * иначе по имени вкладки нельзя понять, какая это книга. Имя и книга стоят в
 * одной строке в форме `Имя (Книга)`.
 */
export function tabTooltip(tab: Pick<WorkspaceTab, 'name' | 'title'>): string {
  const label = tabLabel(tab);
  // Пользовательское имя перекрывает название книги — книгу называем в скобках.
  if (tab.name?.trim() && tab.title?.trim() && tab.name.trim() !== tab.title.trim()) {
    return `${label} (${tab.title})`;
  }
  return tab.title?.trim() || label;
}
