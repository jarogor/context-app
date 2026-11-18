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
 * Один набор на все области выбора. Образец — сам цвет в узнаваемой точке того же
 * тона (OKLCH 88°/145°/252°/25°/318°), что и заливка, но насыщеннее: по нему
 * сразу видно, какой это цвет, а не его выцветшая копия.
 */
export const ACCENT_COLOR_SWATCHES: Record<AccentColor, string> = {
  yellow: '#f8c506',
  green: '#56bf00',
  blue: '#007ce4',
  red: '#df4729',
  purple: '#6938cc',
};

/** Ступень силы цвета в заливке объекта. */
export type AccentStrength = 'tint' | 'soft' | 'active';

/** Готовые цвета заливки по ступеням и стороне темы.
 *
 * Заливка — сам цвет, а не его примесь к фону: насыщенность держится в полосе
 * C 0.04–0.24, поэтому красный остаётся красным, жёлтый — жёлтым, а синий,
 * зелёный и фиолетовый различимы между собой. Приглушённые значения давали
 * обратное: красный уходил в бледно-бордовый, жёлтый — в светло-коричневый, а
 * синий с зелёным и красный с фиолетовым становились почти неразличимы.
 *
 * Ступени разводятся светлотой: в светлой стороне от лёгкого оттенка к плотному
 * цвету, в тёмной — от глубокого к насыщенному. Жёлтый в тёмной стороне остаётся
 * золотым: на низкой светлоте он неизбежно становится коричневым, каким и
 * выглядел раньше.
 */
export const ACCENT_FILL_COLORS: Record<
  'light' | 'dark',
  Record<AccentColor, Record<AccentStrength, string>>
> = {
  light: {
    yellow: { tint: '#ffecba', soft: '#fed047', active: '#f2c10d' },
    green: { tint: '#c5ffaa', soft: '#91f259', active: '#79e134' },
    blue: { tint: '#bddafc', soft: '#9ac8fe', active: '#76b5fe' },
    red: { tint: '#fdd3ca', soft: '#f9bbad', active: '#ff9a84' },
    purple: { tint: '#e0daff', soft: '#cdc3ff', active: '#b7a7fe' },
  },
  dark: {
    yellow: { tint: '#c4a651', soft: '#e1b942', active: '#face4e' },
    green: { tint: '#2d5118', soft: '#356a0e', active: '#3b7d01' },
    blue: { tint: '#194779', soft: '#1b5c9f', active: '#106dc5' },
    red: { tint: '#782819', soft: '#9d301b', active: '#be351a' },
    purple: { tint: '#4a3387', soft: '#6040af', active: '#744cd4' },
  },
};

/** Готовые цвета подписи на заливке: пара «цвет и ступень» задаёт её сама.
 *
 * Подпись выбрана по контрасту с заливкой, а не по стороне темы: жёлтый светел
 * по природе и требует тёмных чернил даже в тёмной стороне, а глубокие зелёный,
 * синий, красный и фиолетовый — светлых. Контраст каждой пары не ниже 4.6, и на
 * одной заливке подпись всегда одна: строка списка, карточка и вкладка одного
 * элемента подписаны одинаково.
 */
export const ACCENT_INK_COLORS: Record<
  'light' | 'dark',
  Record<AccentColor, Record<AccentStrength, string>>
> = {
  light: {
    yellow: { tint: '#23180a', soft: '#23180a', active: '#23180a' },
    green: { tint: '#23180a', soft: '#23180a', active: '#23180a' },
    blue: { tint: '#23180a', soft: '#23180a', active: '#23180a' },
    red: { tint: '#23180a', soft: '#23180a', active: '#23180a' },
    purple: { tint: '#23180a', soft: '#23180a', active: '#23180a' },
  },
  dark: {
    yellow: { tint: '#23180a', soft: '#23180a', active: '#23180a' },
    green: { tint: '#f7f3ec', soft: '#f7f3ec', active: '#f7f3ec' },
    blue: { tint: '#f7f3ec', soft: '#f7f3ec', active: '#f7f3ec' },
    red: { tint: '#f7f3ec', soft: '#f7f3ec', active: '#f7f3ec' },
    purple: { tint: '#f7f3ec', soft: '#f7f3ec', active: '#f7f3ec' },
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

/** Готовая пара «заливка и подпись» для небольшой цветной метки.
 *
 * Метка — номер вкладки или кнопка меню — это плашка, а не окрашенный текст:
 * текст малого кегля требует контраста 4.5, и подобрать его можно только у
 * тёмных, приглушённых оттенков, где жёлтый становится коричневым. Плашка берёт
 * цвет заливки и его собственную подпись, поэтому цвет остаётся собой во всех
 * восьми наборах и читается сразу.
 */
export interface AccentMarkStyle {
  /** Фон плашки. */
  fill: string;
  /** Цвет подписи на плашке. */
  ink: string;
}

/** Пара «заливка и подпись» метки по цвету и силе; отсутствует без цвета.
 *
 * Метка — небольшая цветная плашка: она берёт готовую пару заливки и подписи,
 * поэтому цвет остаётся собой, а текст на плашке читается. Сила задаёт разницу
 * между состояниями: активный элемент несёт плотную ступень, неактивный —
 * тихую, и цветной знак не режет глаз среди спокойных соседей.
 */
export function accentMark(
  color: AccentColor | undefined,
  options: { strength?: AccentStrength } = {},
): AccentMarkStyle | undefined {
  if (!color) {
    return undefined;
  }
  const strength = options.strength ?? 'soft';
  return {
    fill: `var(--accent-fill-${color}-${strength}, ${ACCENT_FILL_COLORS.light[color][strength]})`,
    ink: `var(--accent-ink-${color}-${strength}, ${ACCENT_INK_COLORS.light[color][strength]})`,
  };
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
