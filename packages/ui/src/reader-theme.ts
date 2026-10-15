/** Тема области чтения: оформление чтения книги, отдельное от интерфейса.
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

/** Токены оформления области чтения. */
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
  /** Цвет вертикальных меток по краям активного выделения. */
  selectionEdge: string;
  /** Толщина вертикальных меток выделения, в пикселях. */
  selectionEdgeWidth: number;
}

/** Идентификаторы цветов заметок, общие для всех областей. */
export const READER_NOTE_COLOR_IDS = [
  'yellow',
  'green',
  'blue',
  'red',
  'purple',
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

/** Токены области чтения для палитры и стороны. */
export function readerThemeTokens(
  palette: PaletteId,
  id: ReaderThemeId,
): ReaderThemeTokens {
  return id === 'dark' ? DARK_READER_TOKENS[palette] : LIGHT_READER_TOKENS[palette];
}

/** Светлые тона заметок: насыщенные, но среднесветлые оттенки.
 *
 * Пастельные 200-е тона были слишком выбелены и читались «не собой»: зелёный
 * уходил в бирюзу, красный в розовый, фиолетовый в лаванду. Здесь каждый цвет
 * задан в своём оттенке с достаточной насыщенностью, но остаётся достаточно
 * светлым, чтобы тёмный текст книги читался поверх подсветки.
 */
const LIGHT_NOTE_TONES: ReaderNoteTones = {
  yellow: '#f2cd52',
  green: '#82d991',
  blue: '#84adf0',
  red: '#ef817b',
  purple: '#bba0e8',
};

/** Тёмные тона заметок палитры Gruvbox.
 *
 * Приглушённые цвета с верными оттенками, полупрозрачные: на тёмном фоне книги
 * дают спокойную цветную подложку, поверх которой светлый текст остаётся
 * читаемым; при осветлении на тёмной странице PDF не «вспыхивают». Оттенки не
 * берутся из акцентов Gruvbox (там зелёный жёлто-зелёный, синий бирюзовый, а
 * фиолетовый розовый): заметка должна выглядеть цветом, который выбрал
 * пользователь.
 */
const GRUVBOX_DARK_NOTE_TONES: ReaderNoteTones = {
  yellow: 'rgba(214, 158, 46, 0.4)',
  green: 'rgba(104, 168, 74, 0.45)',
  blue: 'rgba(69, 118, 176, 0.5)',
  red: 'rgba(198, 64, 58, 0.4)',
  purple: 'rgba(150, 96, 196, 0.45)',
};

/** Тёмные тона заметок палитры Mist: те же верные оттенки, приглушённые
 * полупрозрачностью — тот же приём, что и у Gruvbox. */
const MIST_DARK_NOTE_TONES: ReaderNoteTones = {
  yellow: 'rgba(202, 150, 40, 0.4)',
  green: 'rgba(74, 158, 96, 0.45)',
  blue: 'rgba(70, 120, 190, 0.5)',
  red: 'rgba(206, 70, 70, 0.4)',
  purple: 'rgba(146, 96, 190, 0.45)',
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

/** Каналы цвета: компоненты 0..255 и прозрачность 0..1. */
interface ColorChannels {
  /** Красный канал. */
  red: number;
  /** Зелёный канал. */
  green: number;
  /** Синий канал. */
  blue: number;
  /** Прозрачность. */
  alpha: number;
}

/** Разбор цвета `#rrggbb` или `rgb()/rgba()` в каналы; `null` — неизвестный формат. */
function parseColorChannels(value: string): ColorChannels | null {
  const trimmed = value.trim();
  const hex = trimmed.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const number = Number.parseInt(hex[1], 16);
    return { red: (number >> 16) & 255, green: (number >> 8) & 255, blue: number & 255, alpha: 1 };
  }
  const rgb = trimmed.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i,
  );
  if (!rgb) {
    return null;
  }
  return {
    red: Number(rgb[1]),
    green: Number(rgb[2]),
    blue: Number(rgb[3]),
    alpha: rgb[4] ? Number(rgb[4]) : 1,
  };
}

/** Непрозрачный эквивалент тона поверх фона.
 *
 * Полупрозрачный тон, положенный на сплошной фон области чтения, даёт тот же
 * видимый цвет, что и смешение вручную. Для подсветки заметки в EPUB это
 * важно: её фон рисуется перенесёнными кусками, которые при дробном масштабе
 * перекрываются, а наложение полупрозрачных слоёв складывало бы альфу и давало
 * тёмную полосу на стыке. Непрозрачный цвет такой шов не показывает.
 */
export function blendNoteToneOverBackground(tone: string, background: string): string {
  const foreground = parseColorChannels(tone);
  const backdrop = parseColorChannels(background);
  if (!foreground || !backdrop) {
    return tone;
  }
  const mix = (back: number, front: number): number =>
    Math.round(foreground.alpha * front + (1 - foreground.alpha) * back);
  return `rgb(${mix(backdrop.red, foreground.red)}, ${mix(backdrop.green, foreground.green)}, ${mix(backdrop.blue, foreground.blue)})`;
}

/** Непрозрачные тона заметок для сплошного фона области чтения.
 *
 * Используются только подсветкой цитаты в EPUB (см. `blendNoteToneOverBackground`);
 * карточки, фигуры и PDF сохраняют исходные полупрозрачные тона.
 */
export function solidNoteTones(tones: ReaderNoteTones, background: string): ReaderNoteTones {
  const solid = {} as ReaderNoteTones;
  for (const color of READER_NOTE_COLOR_IDS) {
    solid[color] = blendNoteToneOverBackground(tones[color], background);
  }
  return solid;
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

/** Светлые токены области чтения по палитрам. */
const LIGHT_READER_TOKENS: Record<PaletteId, ReaderThemeTokens> = {
  gruvbox: {
    background: '#fbf1c7',
    text: '#3c3836',
    muted: '#7c6f64',
    link: '#076678',
    // Выделение в тон тёплой Gruvbox: приглушённый стально-синий, а не
    // стерильный системный синий. В PDF ложится умножением на светлую страницу.
    selection: 'rgba(96, 140, 180, 0.35)',
    // Метки по краям живого выделения: тот же синий, но плотнее фоновой заливки,
    // чтобы признак читался без опоры только на цвет.
    selectionEdge: 'rgba(60, 100, 145, 0.9)',
    selectionEdgeWidth: 1,
  },
  mist: {
    background: '#ffffff',
    text: '#1c2125',
    muted: '#6b7280',
    link: '#2563eb',
    // Выделение Mist — привычный синеватый цвет.
    selection: 'rgba(59, 130, 246, 0.32)',
    selectionEdge: 'rgba(37, 99, 235, 0.9)',
    selectionEdgeWidth: 1,
  },
};

/** Тёмные токены области чтения по палитрам. */
const DARK_READER_TOKENS: Record<PaletteId, ReaderThemeTokens> = {
  gruvbox: {
    background: '#282828',
    text: '#ebdbb2',
    muted: '#a89984',
    link: '#83a598',
    // На тёмной странице заливка ложится осветлением: цвет светлее и чуть
    // плотнее, чтобы выделение читалось на тёмной бумаге и не уходило в фиолет.
    selection: 'rgba(120, 160, 195, 0.33)',
    selectionEdge: 'rgba(150, 190, 220, 0.9)',
    selectionEdgeWidth: 1,
  },
  mist: {
    background: '#16191c',
    text: '#f1f3f4',
    muted: '#8b949b',
    link: '#7aa2d6',
    selection: 'rgba(96, 165, 250, 0.33)',
    selectionEdge: 'rgba(147, 197, 253, 0.9)',
    selectionEdgeWidth: 1,
  },
};
