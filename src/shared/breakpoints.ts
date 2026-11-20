/**
 * Порог режима интерфейса и его выбор пользователем.
 *
 * Режимов два: узкий (смартфон и планшет) и десктопный. Граница одна —
 * `--breakpoint-large-tablet` (1024px), по ней же переключается раскладка
 * утилитами Tailwind (`large-tablet:` и `max-large-tablet:`).
 *
 * Пользователь выбирает режим в настройках (`interface.mode`): «Авто» следует
 * ширине окна, «Планшет» и «Десктоп» задают его принудительно. Выбор режима не
 * путать с масштабом: масштаб (`interface.scale`) растягивает шкалу и режим не
 * меняет.
 *
 * Медиазапрос не может взять значение из CSS-переменной, поэтому порог задан
 * здесь и совпадает с токеном `--breakpoint-large-tablet` в
 * `packages/ui/src/tokens.css`. При смене значения менять оба места.
 */

import type { InterfaceMode, ResolvedInterfaceMode } from '../features/appearance/interface-mode';

/** Смартфон: подступень плотности внутри узкого режима. */
export const PHONE_MAX_WIDTH = '(max-width: 29.99rem)';

/** Узкий режим: телефон и планшет, где панели занимают всю ширину области. */
export const NARROW_MAX_WIDTH = '(max-width: 63.99rem)';

/** Медиазапрос десктопного режима: от границы `large-tablet` и шире. */
export const WIDE_MIN_WIDTH = '(min-width: 64rem)';

/**
 * Режим, который следует из ширины окна.
 *
 * @param narrow Совпадает ли запрос `NARROW_MAX_WIDTH`.
 */
export function modeForWidth(narrow: boolean): ResolvedInterfaceMode {
  return narrow ? 'tablet' : 'desktop';
}

/**
 * Действующий режим с учётом выбора пользователя.
 *
 * `auto` следует ширине окна; остальные значения задают режим принудительно.
 * Принудительный выбор не меняет порог: он только отменяет автоматику, поэтому
 * те же медиазапросы продолжают работать по фактической ширине.
 *
 * @param preference Выбор пользователя.
 * @param windowMode Режим, следующий из ширины окна.
 */
export function resolveInterfaceMode(
  preference: InterfaceMode,
  windowMode: ResolvedInterfaceMode,
): ResolvedInterfaceMode {
  return preference === 'auto' ? windowMode : preference;
}
