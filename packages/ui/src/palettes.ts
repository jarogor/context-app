/** Палитры оформления: реестр доступных наборов токенов.
 *
 * Владелец шва оформления — дизайн-система: палитра — это пара наборов токенов
 * (светлый и тёмный), а активную пару выбирают атрибуты на корне документа:
 * `data-palette` задаёт палитру, `data-theme` — светлую или тёмную сторону.
 * Модуль не знает о компонентах; реестр используют оболочка (переключатель в
 * шапке) и настройки приложения.
 */

import { t } from '@context/i18n';

/** Идентификатор палитры оформления. */
export type PaletteId = 'linen' | 'frost' | 'amber' | 'mist';

/** Палитра оформления: идентификатор и человекочитаемое название. */
export interface Palette {
  /** Машинный идентификатор — значение атрибута `data-palette`. */
  id: PaletteId;
  /** Человекочитаемое название для интерфейса. */
  title: string;
  /** Короткое пояснение характера палитры для выбора в настройках. */
  description: string;
}

/** Палитра по умолчанию — спокойный «Туман». */
export const DEFAULT_PALETTE: PaletteId = 'mist';

/** Реестр палитр дизайн-системы. */
export const PALETTES: readonly Palette[] = [
  {
    id: 'mist',
    get title() {
      return t('app.palette.mist');
    },
    get description() {
      return t('app.palette.mist.description');
    },
  },
  {
    id: 'linen',
    get title() {
      return t('app.palette.linen');
    },
    get description() {
      return t('app.palette.linen.description');
    },
  },
  {
    id: 'frost',
    get title() {
      return t('app.palette.frost');
    },
    get description() {
      return t('app.palette.frost.description');
    },
  },
  {
    id: 'amber',
    get title() {
      return t('app.palette.amber');
    },
    get description() {
      return t('app.palette.amber.description');
    },
  },
];

/** Проверка, что значение — известный идентификатор палитры. */
export function isPaletteId(value: unknown): value is PaletteId {
  return PALETTES.some((palette) => palette.id === value);
}

/** Прежние идентификаторы палитр: сохранённое старое значение приводится к текущему.
 *
 * Идентификатор палитры попадает в настройки и в зеркало оформления, поэтому
 * переименование не должно сбрасывать выбор пользователя: файл прежней версии
 * читается новой программой.
 */
const LEGACY_IDS: Record<string, PaletteId> = {
  cobalt: 'frost',
  gruvbox: 'amber',
};

/** Приведение произвольного значения к известному идентификатору палитры.
 *
 * Неизвестное или отсутствующее значение трактуется как палитра по умолчанию,
 * чтобы некорректные данные не оставляли интерфейс без оформления; прежний
 * идентификатор палитры приводится к её новому имени.
 */
export function normalizePaletteId(value: unknown): PaletteId {
  if (typeof value === 'string' && value in LEGACY_IDS) {
    return LEGACY_IDS[value];
  }
  return isPaletteId(value) ? value : DEFAULT_PALETTE;
}

/** Применение палитры к корню документа.
 *
 * Устанавливает атрибут `data-palette`; сторона темы (светлая/тёмная) задаётся
 * отдельно атрибутом `data-theme` модулем `theme.ts`.
 */
export function applyPalette(palette: unknown, root: HTMLElement = document.documentElement): void {
  root.dataset.palette = normalizePaletteId(palette);
}
