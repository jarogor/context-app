/** Цвета оформления сущностей: вкладки, библиотеки и другие объекты интерфейса.
 *
 * Один набор идентификаторов и образцов на всё приложение: палитра выбора
 * цвета, заливка и обводка берутся отсюда, поэтому цветная вкладка и цветная
 * карточка выглядят одинаково. Модуль чист от Svelte и DOM: только данные и
 * вычисление CSS-значений.
 *
 * Сила цвета задаётся не местом, а именованной ступенью (`tint`, `soft`,
 * `active`). Так новая область выбирает роль цвета, а не подбирает проценты по
 * месту, и оттенки остаются согласованными во всём интерфейсе.
 */

/** Идентификаторы цветов оформления, общие для всех областей. */
export const ACCENT_COLORS = ['yellow', 'green', 'blue', 'red', 'purple'] as const;

/** Идентификатор цвета оформления. */
export type AccentColor = (typeof ACCENT_COLORS)[number];

/** Насыщенные акценты палитры: образцы выбора цвета (панель, меню, список).
 *
 * Один набор на все области выбора: насыщенные базовые цвета, чтобы образец
 * был узнаваем. Заливка и обводка объекта берут этот же цвет и смешивают его с
 * поверхностью, а не подбирают оттенок заново.
 */
export const ACCENT_COLOR_SWATCHES: Record<AccentColor, string> = {
  yellow: '#eab308',
  green: '#16a34a',
  blue: '#2563eb',
  red: '#dc2626',
  purple: '#9333ea',
};

/** Ступень силы цвета в заливке поверхности. */
export type AccentStrength = 'tint' | 'soft' | 'active';

/** Доля цвета в заливке ступени, в процентах.
 *
 * Ступени намеренно приглушённые: цвет читается оттенком, а подпись остаётся
 * контрастной. Ярче всех `active`, но и она ниже половины — насыщенная заливка
 * заставила бы текст спорить с фоном.
 */
const ACCENT_FILL_PERCENTS: Record<AccentStrength, number> = {
  tint: 6,
  soft: 12,
  active: 20,
};

/** Доля цвета в цветной обводке, в процентах. */
const ACCENT_LINE_PERCENT = 45;

/** CSS-фон поверхности с примесью цвета объекта; отсутствует без цвета.
 *
 * `base` — поверхность, на которой лежит объект (карточка, полоса вкладок,
 * фон неактивной вкладки): цвет смешивается с ней, поэтому объект выглядит
 * частью своего окружения, а не наклейкой.
 */
export function accentFill(
  color: AccentColor | undefined,
  options: { base?: string; strength?: AccentStrength } = {},
): string | undefined {
  if (!color) {
    return undefined;
  }
  const base = options.base ?? 'var(--card)';
  const strength = options.strength ?? 'tint';
  return `color-mix(in oklab, ${ACCENT_COLOR_SWATCHES[color]} ${ACCENT_FILL_PERCENTS[strength]}%, ${base})`;
}

/** CSS-цвет обводки объекта с примесью его цвета; отсутствует без цвета.
 *
 * Обводка не равна заливке: она смешивается с общей линией темы, поэтому
 * цветной контур заметен, но не превращается в яркую рамку.
 */
export function accentLine(
  color: AccentColor | undefined,
  base = 'var(--border)',
): string | undefined {
  if (!color) {
    return undefined;
  }
  return `color-mix(in oklab, ${ACCENT_COLOR_SWATCHES[color]} ${ACCENT_LINE_PERCENT}%, ${base})`;
}
