/** Единый вид оформления вкладки для всех областей рабочего места.
 *
 * Панель вкладок (верхняя строка) и панель открытых книг показывают вкладку
 * одинаково: одну и ту же подпись, иконку и цвет. Модуль держит чистые функции
 * этого вида, чтобы два места не расходились, и не зависит от Svelte и DOM.
 *
 * Цвет берётся из общего реестра дизайн-системы: ту же заливку и обводку
 * получает библиотека и любая другая сущность с оформлением.
 */

import { accentFill, accentLine } from '@context/ui';
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

/** CSS-фон заливки вкладки; отсутствует, если цвет не задан.
 *
 * Цвет вкладки показывается заливкой всей вкладки приглушённым оттенком, а не
 * акцентной полосой по краю. Оттенок получается смешиванием акцента цвета с
 * фоном области (`base`) — тем же приёмом, что и мягкие тона дизайн-системы
 * (`--primary-soft`). Активная вкладка заливается плотнее неактивной, чтобы
 * цветная вкладка оставалась отличимой от активной.
 */
export function tabColorFill(
  color: TabColor | undefined,
  base = 'var(--card)',
  active = false,
): string | undefined {
  return accentFill(color, { base, strength: active ? 'active' : 'soft' });
}

/** CSS-фон неактивной цветной вкладки панели вкладок; отсутствует, если цвета нет.
 *
 * Отличие от нецветной вкладки слабое: доля цвета меньше базовой заливки, а
 * основа — общий фон неактивной вкладки (`--tab-idle-surface`), поэтому среди
 * плашек полосы цвет читается оттенком, а не насыщенной заливкой.
 */
export function tabIdleFill(color: TabColor | undefined): string | undefined {
  return accentFill(color, { base: 'var(--tab-idle-surface)', strength: 'tint' });
}

/** CSS-цвет обводки цветной вкладки; отсутствует, если цвета нет.
 *
 * Обводка — та же ступень цвета, что и заливка: цветная вкладка отличается от
 * нецветной и фоном, и контуром, поэтому выделение читается и на светлом фоне.
 */
export function tabColorLine(color: TabColor | undefined): string | undefined {
  return accentLine(color);
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
