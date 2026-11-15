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
 * Один набор на все области выбора. Образец — сам цвет в узнаваемой точке:
 * заливка элемента приглушена, поэтому образец должен показывать, какой это
 * цвет, а не повторять тихий оттенок заливки.
 */
export const ACCENT_COLOR_SWATCHES: Record<AccentColor, string> = {
  yellow: '#e8b923',
  green: '#4d9a5e',
  blue: '#4a7cb8',
  red: '#b5544e',
  purple: '#8b6aa8',
};

/** Ступень силы цвета в заливке объекта. */
export type AccentStrength = 'tint' | 'soft' | 'active';

/** Готовые цвета заливки по ступеням и стороне темы.
 *
 * Заливка — тот же цвет, но тихий: насыщенность низкая, поэтому элемент читается
 * своим цветом и не светится рядом со спокойной темой. Насыщенные значения
 * давали обратное: жёлтый выцветал в горчицу, зелёный — в бирюзу.
 *
 * Ступени разводятся светлотой и силой цвета:
 *   - светлая сторона: от пастели к заметному цвету;
 *   - тёмная сторона: от глубокого оттенка к светлому.
 * Поэтому выбранное заметно сильнее невыбранного, но ни одна ступень не
 * светится: насыщенность приглушена у всех.
 */
export const ACCENT_FILL_COLORS: Record<
  'light' | 'dark',
  Record<AccentColor, Record<AccentStrength, string>>
> = {
  light: {
    yellow: { tint: '#fbe8bb', soft: '#f0d38c', active: '#e7bd4f' },
    green: { tint: '#d2f0d1', soft: '#b1e1b2', active: '#8cd28e' },
    blue: { tint: '#d2e7ff', soft: '#afd5ff', active: '#8bc1fc' },
    red: { tint: '#ffddd9', soft: '#fbc3bd', active: '#f6a59e' },
    purple: { tint: '#f4dafc', soft: '#e7c1f3', active: '#d9a6e9' },
  },
  dark: {
    yellow: { tint: '#9c8347', soft: '#bfa157', active: '#e3c067' },
    green: { tint: '#234725', soft: '#366138', active: '#477a49' },
    blue: { tint: '#1d3f63', soft: '#2e5785', active: '#4071a7' },
    red: { tint: '#62322f', soft: '#834743', active: '#a55d58' },
    purple: { tint: '#51305c', soft: '#6e467a', active: '#8c5c9a' },
  },
};

/** Готовые цвета подписи на заливке: одна на цвет и сторону темы.
 *
 * Подпись закреплена за цветом, а не за местом: строка списка, карточка и
 * вкладка одного элемента подписаны одинаково. Пара «то тёмная, то светлая»
 * давала чёрный текст на строке и белый на карточке того же элемента.
 *
 * В светлой теме все заливки светлые и подпись тёмная. В тёмной — заливки
 * глубокие и подпись светлая; исключение — жёлтый: глубокий приглушённый жёлтый
 * неизбежно коричневый, поэтому он остаётся золотым с тёмной подписью.
 */
export const ACCENT_INK_COLORS: Record<
  'light' | 'dark',
  Record<AccentColor, Record<AccentStrength, string>>
> = {
  light: {
    yellow: { tint: '#1c1608', soft: '#1c1608', active: '#1c1608' },
    green: { tint: '#1c1608', soft: '#1c1608', active: '#1c1608' },
    blue: { tint: '#1c1608', soft: '#1c1608', active: '#1c1608' },
    red: { tint: '#1c1608', soft: '#1c1608', active: '#1c1608' },
    purple: { tint: '#1c1608', soft: '#1c1608', active: '#1c1608' },
  },
  dark: {
    yellow: { tint: '#1c1608', soft: '#1c1608', active: '#1c1608' },
    green: { tint: '#fffaf2', soft: '#fffaf2', active: '#fffaf2' },
    blue: { tint: '#fffaf2', soft: '#fffaf2', active: '#fffaf2' },
    red: { tint: '#fffaf2', soft: '#fffaf2', active: '#fffaf2' },
    purple: { tint: '#fffaf2', soft: '#fffaf2', active: '#fffaf2' },
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
