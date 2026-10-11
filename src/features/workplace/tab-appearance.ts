/** Единый вид оформления вкладки для всех поверхностей рабочего места.
 *
 * Панель вкладок (верхняя строка) и панель открытых книг показывают вкладку
 * одинаково: одну и ту же подпись, иконку и цвет. Модуль держит чистые функции
 * этого вида, чтобы два места не расходились, и не зависит от Svelte и DOM.
 */

import { NOTE_COLOR_SWATCHES } from '../notes/model';
import type { TabColor, WorkspaceTab } from './workplace';

/** Базовая доля цвета в заливке вкладки, в процентах.
 *
 * Смешивание с фоном поверхности даёт приглушённый оттенок: вкладка выглядит
 * выбранным цветом, но не затемняет подпись и не спорит с активным состоянием,
 * как сплошная заливка насыщенным цветом.
 */
const TAB_FILL_PERCENT = 20;

/** Доля цвета в заливке активной вкладки относительно базовой. */
const TAB_FILL_ACTIVE_FACTOR = 1.6;

/** Эффективная подпись вкладки: пользовательское имя перекрывает название книги.
 *
 * Незаданное имя оставляет название книги — оформление дополняет вид, а не
 * заменяет его.
 */
export function tabLabel(tab: Pick<WorkspaceTab, 'name' | 'title'>): string {
  return tab.name?.trim() || tab.title;
}

/** CSS-фон заливки вкладки; отсутствует, если цвет не задан.
 *
 * Цвет вкладки показывается заливкой всей вкладки приглушённым оттенком, а не
 * акцентной полосой по краю. Оттенок получается смешиванием акцента цвета с
 * фоном поверхности (`base`) — тем же приёмом, что и мягкие тона дизайн-системы
 * (`--primary-soft`). Активная вкладка заливается чуть плотнее, чтобы цветная
 * вкладка оставалась отличимой от активной.
 */
export function tabColorFill(
  color: TabColor | undefined,
  base = 'var(--card)',
  active = false,
): string | undefined {
  if (!color) {
    return undefined;
  }
  const percent = Math.round(TAB_FILL_PERCENT * (active ? TAB_FILL_ACTIVE_FACTOR : 1));
  return `color-mix(in oklab, ${NOTE_COLOR_SWATCHES[color]} ${percent}%, ${base})`;
}

/** Подсказка вкладки: подпись и, при наличии, описание на отдельной строке.
 *
 * На панели вкладок описание не помещается в подпись, поэтому доступно только
 * здесь — при наведении на вкладку.
 */
export function tabTooltip(tab: Pick<WorkspaceTab, 'name' | 'title' | 'description'>): string {
  const label = tabLabel(tab);
  const description = tab.description?.trim();
  return description ? `${label}\n${description}` : label;
}
