/** Тема области чтения: мягкие тона заметок и перекраска страницы.
 *
 * Приложение присылает тему сообщением `reader-theme`: сторону (светлая или
 * тёмная), токены области, мягкие тона заметок и цвета перекраски страницы.
 * Светлая сторона только раскладывает значения в CSS-переменные, тёмная ещё и
 * перекрашивает растр страницы — без повторного чтения файла.
 */
import type { PageColors, Rgb } from './types';

/** Мягкие тона заметок по умолчанию: светлая сторона темы области чтения. */
export const NOTE_COLOR_FALLBACKS: Record<string, string> = {
  yellow: '#f2cd52',
  green: '#82d991',
  blue: '#84adf0',
  red: '#ef817b',
  purple: '#bba0e8',
};

/** Действующие мягкие тона заметок по идентификаторам цвета. */
export const noteTones: Record<string, string> = { ...NOTE_COLOR_FALLBACKS };

/** Цвет подсветки заметки; неизвестный идентификатор даёт жёлтый. */
export function noteColor(color: string | undefined): string {
  return (color && noteTones[color]) || noteTones.yellow;
}

/** Токены области чтения из сообщения приложения. */
export interface ReaderThemeTokens {
  /** Фон области чтения. */
  background?: string;
  /** Цвет текста книги. */
  text?: string;
  /** Вторичный цвет текста. */
  muted?: string;
  /** Цвет ссылок. */
  link?: string;
  /** Цвет заливки выделения. */
  selection?: string;
  /** Цвет вертикальных меток выделения. */
  selectionEdge?: string;
  /** Толщина меток выделения в пикселях. */
  selectionEdgeWidth?: number;
}

/** Значение темы области чтения, присланное приложением. */
export interface ReaderThemeInput {
  /** Сторона темы. */
  id?: string;
  /** Токены области. */
  tokens?: ReaderThemeTokens;
  /** Мягкие тона заметок. */
  notes?: Record<string, string>;
  /** Цвета перекраски страницы. */
  page?: { paper?: string; ink?: string };
}

/** Результат применения темы: сторона и отпечаток раскраски страниц. */
export interface AppliedTheme {
  /** Сторона темы. */
  theme: 'light' | 'dark';
  /** Отпечаток раскраски страниц. */
  paintKey: string;
  /** Цвета перекраски страницы. */
  pageColors: PageColors;
}

/**
 * Применение темы области чтения, присланной приложением.
 *
 * На корень ставится атрибут стороны, значения раскладываются в CSS-переменные:
 * фон вокруг страниц берёт `--reader-background`, заметки — мягкие тона
 * `--note-*`. Тёмная сторона дополнительно перекрашивает растр страницы, поэтому
 * при её смене страницы перерисовываются без повторного чтения файла.
 */
export function applyReaderTheme(value: ReaderThemeInput | null | undefined): AppliedTheme {
  const theme: 'light' | 'dark' = value && value.id === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.readerTheme = theme;
  const tokens = (value && value.tokens) || {};
  const tones = (value && value.notes) || {};
  const rootStyle = document.documentElement.style;
  // Цвета перекраски страницы: бумага и текст задаются темой (палитрой), поэтому
  // страница не уходит в нейтральный чёрный, а сохраняет оттенок.
  const pageColors = createPageColors(value && value.page);
  const paintKey = theme + '|' + pageColors.paperCss + '|' + pageColors.inkCss;
  rootStyle.setProperty('--reader-background', tokens.background || '#ffffff');
  rootStyle.setProperty('--reader-foreground', tokens.text || '#1f2937');
  rootStyle.setProperty('--reader-muted-foreground', tokens.muted || '#6b7280');
  rootStyle.setProperty('--reader-link', tokens.link || '#2563eb');
  rootStyle.setProperty(
    '--reader-selection',
    tokens.selection || 'rgba(37, 99, 235, 0.35)',
  );
  rootStyle.setProperty(
    '--reader-selection-edge',
    tokens.selectionEdge || 'rgba(37, 99, 235, 0.9)',
  );
  rootStyle.setProperty(
    '--reader-selection-edge-width',
    String(tokens.selectionEdgeWidth || 2) + 'px',
  );
  // Фон неотрисованной страницы совпадает с перекрашенной бумагой, иначе при
  // перерисовке мелькал бы светлый прямоугольник.
  rootStyle.setProperty(
    '--page-background',
    theme === 'dark' ? pageColors.paperCss : '#ffffff',
  );
  for (const color of Object.keys(NOTE_COLOR_FALLBACKS)) {
    const tone = tones[color] || NOTE_COLOR_FALLBACKS[color];
    noteTones[color] = tone;
    rootStyle.setProperty('--note-' + color, tone);
  }
  return { theme, paintKey, pageColors };
}


/** Разбор цвета вида `#rrggbb`; неподходящее значение даёт null. */
export function parseHexColor(value: unknown): Rgb | null {
  if (typeof value !== 'string') {
    return null;
  }
  const match = /^#?([0-9a-f]{6})$/i.exec(value.trim());
  if (!match) {
    return null;
  }
  const number = Number.parseInt(match[1], 16);
  return { r: (number >> 16) & 255, g: (number >> 8) & 255, b: number & 255 };
}

/** Сборка целей перекраски из присланного значения темы.
 *
 * Задаются темой; без них берётся нейтральная тёмная бумага, чтобы страница всё
 * равно не осталась белой.
 */
export function createPageColors(value: { paper?: string; ink?: string } | null | undefined): PageColors {
  const paper = parseHexColor(value && value.paper) || { r: 0x3f, g: 0x3b, b: 0x38 };
  const ink = parseHexColor(value && value.ink) || { r: 0xd5, g: 0xc4, b: 0xa1 };
  return {
    paper,
    ink,
    paperCss: `rgb(${paper.r}, ${paper.g}, ${paper.b})`,
    inkCss: `rgb(${ink.r}, ${ink.g}, ${ink.b})`,
  };
}

/** Ограничение значения канала диапазоном 0–255. */
export function clampByte(value: number): number {
  if (value <= 0) {
    return 0;
  }
  if (value >= 255) {
    return 255;
  }
  return value;
}

/**
 * Перекраска пикселей растра под тёмную тему.
 *
 * Тёмный текст страницы уходит в светлый цвет темы (`ink`), белая бумага — в
 * тёмный цвет темы (`paper`): цвет страницы следует палитре, а не нейтральному
 * чёрному. Каждый канал движется пропорционально своей яркости линейно между
 * точками «чёрный → ink» и «белый → paper», поэтому цветной оттенок содержимого
 * сохраняется (графика и иллюстрации темнеют, но остаются узнаваемыми).
 */
export function recolorImageData(data: Uint8ClampedArray, colors: PageColors): void {
  const { paper, ink } = colors;
  for (let offset = 0; offset < data.length; offset += 4) {
    const luminance =
      0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
    // Доли близости пикселя к чёрному (0) и к белому (255).
    const inkWeight = 1 - luminance / 255;
    const paperWeight = luminance / 255;
    // Оттенок пикселя: насколько каналы отличаются от его яркости.
    data[offset] = clampByte(
      ink.r * inkWeight + paper.r * paperWeight + (data[offset] - luminance),
    );
    data[offset + 1] = clampByte(
      ink.g * inkWeight + paper.g * paperWeight + (data[offset + 1] - luminance),
    );
    data[offset + 2] = clampByte(
      ink.b * inkWeight + paper.b * paperWeight + (data[offset + 2] - luminance),
    );
  }
}

/** Перекраска растра страницы под тему области чтения. */
export function recolorCanvas(canvas: HTMLCanvasElement, theme: 'light' | 'dark', colors: PageColors): void {
  if (theme !== 'dark') {
    return;
  }
  const context = canvas.getContext('2d');
  if (!context || !canvas.width || !canvas.height) {
    return;
  }
  let image;
  try {
    image = context.getImageData(0, 0, canvas.width, canvas.height);
  } catch (error) {
    // Песочница может запретить чтение пикселей: тогда страница остаётся как
    // есть, но тема не ломает отрисовку.
    return;
  }
  recolorImageData(image.data, colors);
  context.putImageData(image, 0, 0);
}
