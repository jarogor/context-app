/** Тема области чтения: оформление поверхности книги, отдельное от интерфейса.
 *
 * Область чтения — изолированный документ (встроенное чтение EPUB и песочница
 * плагина рабочего места) и не наследует CSS оболочки. Поэтому значения темы
 * задаются здесь как данные, а не CSS-токенами оболочки: встроенное чтение
 * встраивает их в документ книги, а хост передаёт их плагину сообщением.
 *
 * Тема области чтения переиспользует реестр палитр дизайн-системы и выбирает
 * сторону (светлую или тёмную) независимо от темы интерфейса. Модуль чист от
 * Svelte и DOM: только данные и нормализация.
 */

import type { PaletteId } from './palettes';

/** Сторона темы области чтения. */
export type ReaderThemeId = 'light' | 'dark';

/** Значение темы области чтения по умолчанию — светлая. */
export const DEFAULT_READER_THEME: ReaderThemeId = 'light';

/** Все допустимые значения темы области чтения. */
export const READER_THEMES = ['light', 'dark'] as const;

/** Токены оформления поверхности чтения. */
export interface ReaderThemeTokens {
  /** Фон области чтения. */
  background: string;
  /** Цвет текста книги. */
  text: string;
  /** Цвет вторичного текста. */
  muted: string;
  /** Цвет ссылок. */
  link: string;
  /** Базовый цвет выделения текста: синеватый, в тон палитре. */
  selection: string;
}

/** Идентификаторы цветов заметок, общие для всех поверхностей. */
export const READER_NOTE_COLOR_IDS = [
  'yellow',
  'green',
  'blue',
  'red',
  'purple',
  'black',
] as const;

/** Идентификатор цвета заметки. */
export type ReaderNoteColorId = (typeof READER_NOTE_COLOR_IDS)[number];

/** Мягкие тона заметок: подсветка цитаты, заливка фигуры, фон карточки, метка. */
export type ReaderNoteTones = Record<ReaderNoteColorId, string>;

/** Проверка, что значение — известная тема области чтения. */
export function isReaderThemeId(value: unknown): value is ReaderThemeId {
  return value === 'light' || value === 'dark';
}

/** Приведение произвольного значения к теме области чтения.
 *
 * Неизвестное или отсутствующее значение трактуется как светлая тема, чтобы
 * некорректные данные не оставляли область чтения без оформления.
 */
export function normalizeReaderThemeId(value: unknown): ReaderThemeId {
  return isReaderThemeId(value) ? value : DEFAULT_READER_THEME;
}

/** Установка темы области чтения на корень области содержимого.
 *
 * Устанавливает атрибут `data-reader-theme` (по аналогии с `data-theme`
 * интерфейса). Значения набора выбираются правилами документа по этому атрибуту.
 */
export function applyReaderTheme(
  id: unknown,
  root: HTMLElement = document.documentElement,
): void {
  root.dataset.readerTheme = normalizeReaderThemeId(id);
}

/** Токены поверхности чтения для палитры и стороны. */
export function readerThemeTokens(
  palette: PaletteId,
  id: ReaderThemeId,
): ReaderThemeTokens {
  return id === 'dark' ? DARK_READER_TOKENS[palette] : LIGHT_READER_TOKENS[palette];
}

/** Светлые тона заметок: прежний набор, рассчитанный на светлую поверхность. */
const LIGHT_NOTE_TONES: ReaderNoteTones = {
  yellow: '#fde68a',
  green: '#bbf7d0',
  blue: '#bfdbfe',
  red: '#fecaca',
  purple: '#ddd6fe',
  black: '#d1d5db',
};

/** Тёмные тона заметок палитры Gruvbox.
 *
 * Полупрозрачные акценты Gruvbox: на тёмном фоне книги дают приглушённую
 * цветную подложку, поверх которой светлый текст остаётся читаемым; при
 * умножении на белой странице PDF дают светлый цветной оттенок, не скрывающий
 * текст. Заметно отличаются от светлого набора и различимы между собой.
 */
const GRUVBOX_DARK_NOTE_TONES: ReaderNoteTones = {
  yellow: 'rgba(250, 189, 47, 0.35)',
  green: 'rgba(184, 187, 38, 0.4)',
  blue: 'rgba(131, 165, 152, 0.45)',
  red: 'rgba(251, 73, 52, 0.35)',
  purple: 'rgba(211, 134, 155, 0.45)',
  black: 'rgba(168, 153, 132, 0.45)',
};

/** Тёмные тона заметок палитры Mist: насыщенные базовые цвета при низкой
 * прозрачности — тот же приём, что и у Gruvbox. */
const MIST_DARK_NOTE_TONES: ReaderNoteTones = {
  yellow: 'rgba(234, 179, 8, 0.35)',
  green: 'rgba(34, 197, 94, 0.35)',
  blue: 'rgba(59, 130, 246, 0.4)',
  red: 'rgba(239, 68, 68, 0.35)',
  purple: 'rgba(168, 85, 247, 0.4)',
  black: 'rgba(148, 163, 184, 0.45)',
};

/** Мягкие тона заметок для палитры и стороны темы области чтения. */
export function readerThemeNoteTones(
  palette: PaletteId,
  id: ReaderThemeId,
): ReaderNoteTones {
  if (id !== 'dark') {
    return LIGHT_NOTE_TONES;
  }
  return palette === 'mist' ? MIST_DARK_NOTE_TONES : GRUVBOX_DARK_NOTE_TONES;
}

/** Цвета перекраски страницы книги в тёмной теме.
 *
 * PDF — изображение листа: чтобы он не оставался белым, растр перекрашивается
 * по яркости. Куда уходит белая бумага (`paper`) и чёрный текст (`ink`) задаёт
 * палитра: у Gruvbox бумага тёплая, у Mist — холодная, поэтому и страница
 * сохраняет оттенок темы. Текст мягче чистого белого — так контраст ниже.
 */
export interface ReaderPageColors {
  /** Тёмная «бумага»: куда уходит белый фон страницы. */
  paper: string;
  /** Светлый «текст»: куда уходит чёрный текст страницы. */
  ink: string;
}

/** Тёплая бумага и мягкий текст Gruvbox для страницы в тёмной теме. */
const GRUVBOX_DARK_PAGE: ReaderPageColors = {
  paper: '#33302d',
  ink: '#d5c4a1',
};

/** Холодная бумага и мягкий текст Mist для страницы в тёмной теме. */
const MIST_DARK_PAGE: ReaderPageColors = {
  paper: '#282d31',
  ink: '#ccd2d6',
};

/** Цвета перекраски страницы по палитре (для тёмной стороны темы). */
export function readerPageColors(palette: PaletteId): ReaderPageColors {
  return palette === 'mist' ? MIST_DARK_PAGE : GRUVBOX_DARK_PAGE;
}

/** Светлые токены поверхности чтения по палитрам. */
const LIGHT_READER_TOKENS: Record<PaletteId, ReaderThemeTokens> = {
  gruvbox: {
    background: '#fbf1c7',
    text: '#3c3836',
    muted: '#7c6f64',
    link: '#076678',
    // Выделение в тон тёплой Gruvbox: приглушённый стально-синий, а не
    // стерильный системный синий. В PDF ложится умножением на светлую страницу.
    selection: 'rgba(96, 140, 180, 0.35)',
  },
  mist: {
    background: '#ffffff',
    text: '#1c2125',
    muted: '#6b7280',
    link: '#2563eb',
    // Выделение Mist — привычный синеватый цвет.
    selection: 'rgba(59, 130, 246, 0.32)',
  },
};

/** Тёмные токены поверхности чтения по палитрам. */
const DARK_READER_TOKENS: Record<PaletteId, ReaderThemeTokens> = {
  gruvbox: {
    background: '#282828',
    text: '#ebdbb2',
    muted: '#a89984',
    link: '#83a598',
    // На тёмной странице заливка ложится осветлением: цвет светлее и чуть
    // плотнее, чтобы выделение читалось на тёмной бумаге и не уходило в фиолет.
    selection: 'rgba(120, 160, 195, 0.33)',
  },
  mist: {
    background: '#16191c',
    text: '#f1f3f4',
    muted: '#8b949b',
    link: '#7aa2d6',
    selection: 'rgba(96, 165, 250, 0.33)',
  },
};
