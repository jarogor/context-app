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
 * Один набор на все области выбора. Образец узнаваем по самому цвету, поэтому
 * взят в самой звонкой точке своего тона, а не «средним» оттенком.
 */
export const ACCENT_COLOR_SWATCHES: Record<AccentColor, string> = {
  yellow: '#f7cd00',
  green: '#00c650',
  blue: '#0072dd',
  red: '#e00010',
  purple: '#9e11ff',
};

/** Ступень силы цвета в заливке объекта. */
export type AccentStrength = 'tint' | 'soft' | 'active';

/** Готовые цвета заливки по ступеням и стороне темы.
 *
 * Цвет не смешивается с подложкой: смешение подмешивало тон темы и искажало
 * сам цвет — красный уходил в розовый, зелёный в бирюзовый, жёлтый в серый.
 *
 * Ступени заданы прямыми значениями OKLCH, но записаны в hex:
 *   - светлая сторона: неактивная — пастель с заметной насыщенностью, плотная —
 *     глубокий насыщенный цвет;
 *   - тёмная сторона: неактивная — глубокая цветная, плотная — яркая.
 * Жёлтый и зелёный всюду остаются светлыми: на низкой светлоте они уходят в
 * оливковый и болотный, то есть перестают выглядеть собой.
 */
export const ACCENT_FILL_COLORS: Record<
  'light' | 'dark',
  Record<AccentColor, Record<AccentStrength, string>>
> = {
  light: {
    yellow: { tint: '#fee777', soft: '#f1d101', active: '#d4b800' },
    green: { tint: '#93f8a3', soft: '#25ee67', active: '#13c050' },
    blue: { tint: '#afd2ff', soft: '#82b9ff', active: '#0070d9' },
    red: { tint: '#ffc0b6', soft: '#ff978a', active: '#de0f15' },
    purple: { tint: '#d6b9ff', soft: '#c89eff', active: '#9c1efa' },
  },
  dark: {
    yellow: { tint: '#d3c01d', soft: '#ead745', active: '#fbed83' },
    green: { tint: '#279f48', soft: '#00c34e', active: '#15e35f' },
    blue: { tint: '#0757a8', soft: '#0e6dd0', active: '#1585f9' },
    red: { tint: '#9b0e0f', soft: '#c6010d', active: '#f3362f' },
    purple: { tint: '#7116b7', soft: '#8f20e5', active: '#ab58ff' },
  },
};

/** Готовые цвета подписи на заливке: у каждого цвета своя.
 *
 * Подпись выбирается по контрасту с самой заливкой, а не по стороне темы:
 * жёлтый светел по природе и требует тёмных чернил даже в тёмном наборе, а
 * насыщенный синий — светлых. Один цвет подписи на тему давал нечитаемый текст
 * на половине заливок.
 */
export const ACCENT_INK_COLORS: Record<
  'light' | 'dark',
  Record<AccentColor, Record<AccentStrength, string>>
> = {
  light: {
    yellow: { tint: '#1c1608', soft: '#1c1608', active: '#1c1608' },
    green: { tint: '#1c1608', soft: '#1c1608', active: '#1c1608' },
    blue: { tint: '#1c1608', soft: '#1c1608', active: '#fffdf6' },
    red: { tint: '#1c1608', soft: '#1c1608', active: '#fffdf6' },
    purple: { tint: '#1c1608', soft: '#1c1608', active: '#fffdf6' },
  },
  dark: {
    yellow: { tint: '#1c1608', soft: '#1c1608', active: '#1c1608' },
    green: { tint: '#1c1608', soft: '#1c1608', active: '#1c1608' },
    blue: { tint: '#fffdf6', soft: '#fffdf6', active: '#1c1608' },
    red: { tint: '#fffdf6', soft: '#fffdf6', active: '#1c1608' },
    purple: { tint: '#fffdf6', soft: '#fffdf6', active: '#1c1608' },
  },
};

/** Доля цвета в цветной обводке, в процентах. */
const ACCENT_LINE_PERCENT = 28;

/** Доля цвета в слабой обводке, в процентах.
 *
 * Слабая обводка нужна невыбранному объекту: он уже отличается заливкой, и
 * яркий контур делал бы его заметнее выбранного.
 */
const ACCENT_LINE_WEAK_PERCENT = 14;

/** CSS-фон с цветом объекта по ступени; отсутствует без цвета.
 *
 * Значение готовое и своё у каждой стороны темы, поэтому объект остаётся собой
 * на любой палитре: цвет не подмешивает фон и не глохнет рядом с ним.
 * Сторону выбирает токен палитры, объявленный в `tokens.css`.
 */
export function accentFill(
  color: AccentColor | undefined,
  options: { strength?: AccentStrength } = {},
): string | undefined {
  if (!color) {
    return undefined;
  }
  const strength = options.strength ?? 'tint';
  return `var(--accent-fill-${color}-${strength}, ${ACCENT_FILL_COLORS.light[color][strength]})`;
}

/** CSS-цвет подписи на заливке объекта; отсутствует без цвета.
 *
 * Значение готовое, своё для каждого цвета и ступени: подпись должна читаться
 * на самой заливке, а не подчиняться стороне темы.
 */
export function accentText(
  color: AccentColor | undefined,
  options: { strength?: AccentStrength } = {},
): string | undefined {
  if (!color) {
    return undefined;
  }
  const strength = options.strength ?? 'tint';
  return `var(--accent-ink-${color}-${strength}, ${ACCENT_INK_COLORS.light[color][strength]})`;
}

/** CSS-цвет обводки объекта с примесью его цвета; отсутствует без цвета.
 *
 * Обводка не равна заливке: она смешивается с общей линией темы, поэтому
 * цветной контур заметен, но не превращается в яркую рамку. `strong` — обводка
 * выбранного объекта; невыбранный получает слабую, чтобы не спорить с выбором.
 */
export function accentLine(
  color: AccentColor | undefined,
  options: { base?: string; strong?: boolean } = {},
): string | undefined {
  if (!color) {
    return undefined;
  }
  const base = options.base ?? 'var(--muted)';
  const percent = options.strong === false ? ACCENT_LINE_WEAK_PERCENT : ACCENT_LINE_PERCENT;
  return `color-mix(in oklab, ${ACCENT_COLOR_SWATCHES[color]} ${percent}%, ${base})`;
}
