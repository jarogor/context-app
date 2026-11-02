/** Общее состояние модуля рисования.
 *
 * Прежний единый файл держал переменные в области модуля; здесь то же состояние
 * собрано в один объект, чтобы модули могли читать и менять его явно.
 */
import type { PageColors } from './types';
import type { ViewerBinding } from './hotkeys';
import type { DjVuDocument, DjVuModule } from './engine';
import { createPageColors } from './theme';

/** Натуральный размер страницы при масштабе 1, в CSS-пикселях. */
export interface PageSize {
  /** Ширина. */
  width: number;
  /** Высота. */
  height: number;
}

/** Результат отрисовки страницы в карте `rendered`. */
export interface RenderedEntry {
  /** Канвас отрисованной страницы. */
  canvas: HTMLCanvasElement;
  /** Невидимый текстовый слой. */
  textLayer: HTMLDivElement;
  /** Геометрия канваса: окно и плотность. */
  info: CanvasInfo;
  /** Отпечаток раскраски, под который сделан растр. */
  paint: string;
}

/** Геометрия канваса: положение и размер окна и плотность растра. */
export interface CanvasInfo {
  /** Смещение по X от левого края страницы, CSS px. */
  x: number;
  /** Смещение по Y от верхнего края страницы, CSS px. */
  y: number;
  /** Ширина окна, CSS px. */
  width: number;
  /** Высота окна, CSS px. */
  height: number;
  /** Плотность растра. */
  ratio: number;
}

/** Состояние модуля рисования. */
export interface ViewerState {
  /** Загруженный модуль движка DjVu (после инициализации). */
  module: DjVuModule | null;
  /** Документ DjVu текущей книги. */
  doc: DjVuDocument | null;
  /** Байты открытой книги: из них собирается отдельный документ миниатюр. */
  bytes: Uint8Array | null;
  /** Общее число страниц. */
  pageCount: number;
  /** Текущий масштаб в процентах. */
  zoom: number;
  /** Начальный масштаб вкладки. */
  initialZoom: number;
  /** Заметки книги. */
  notes: import('./types').ViewerNote[];
  /** Активный инструмент создания заметок. */
  tool: import('./types').ViewerTool;
  /** Известные натуральные размеры страниц; неизвестные берут размер по умолчанию. */
  naturalSizes: (PageSize | undefined)[];
  /** Размер страницы по умолчанию (первая прочитанная страница). */
  defaultSize: PageSize;
  /** Живые страницы виртуального окна: номер (1-based) → элемент. */
  pages: Map<number, HTMLElement>;
  /** Смещения верхов страниц от начала списка (0-based: `offsets[i]` — перед страницей `i+1`). */
  offsets: number[];
  /** Общая высота списка страниц, CSS px. */
  totalHeight: number;
  /** Первая страница виртуального окна (1-based). */
  windowStart: number;
  /** Последняя страница виртуального окна (1-based). */
  windowEnd: number;
  /** Распорка до окна страниц. */
  spacerTop: HTMLElement | null;
  /** Распорка после окна страниц. */
  spacerBottom: HTMLElement | null;
  /** Отрисованные страницы: элемент страницы → её запись. */
  rendered: Map<HTMLElement, RenderedEntry>;
  /** Страницы, отрисовка которых уже идёт. */
  pending: Set<HTMLElement>;
  /** Поколение отрисовки: смена масштаба отменяет запланированные страницы. */
  renderToken: number;
  /** Сторона темы области чтения. */
  readerTheme: 'light' | 'dark';
  /** Отпечаток раскраски страниц. */
  paintKey: string;
  /** Действующие цвета перекраски страницы. */
  pageColors: PageColors;
  /** Опорная страница окна (для удержания места при масштабе). */
  currentPage: number;
  /** Выполняется ли планирование пересчёта окон. */
  windowScheduled: boolean;
  /** Идёт ли планирование обновления текущей страницы после прокрутки. */
  scrollScheduled: boolean;
  /** Последняя учтённая плотность экрана. */
  lastRatio: number;
  /** Последняя учтённая ширина области чтения. */
  lastViewerWidth: number;
  /** Последняя учтённая высота области чтения. */
  lastViewerHeight: number;
  /** Привязки клавиш, присланные приложением (общий реестр приложения). */
  bindings: ViewerBinding[];
}

/** Состояние модуля рисования. */
export const state: ViewerState = {
  module: null,
  doc: null,
  bytes: null,
  pageCount: 0,
  zoom: 100,
  initialZoom: 100,
  notes: [],
  tool: { type: 'quote', shape: 'line', color: 'yellow' },
  naturalSizes: [],
  defaultSize: { width: 612, height: 792 },
  pages: new Map(),
  offsets: [0],
  totalHeight: 0,
  windowStart: 1,
  windowEnd: 0,
  spacerTop: null,
  spacerBottom: null,
  rendered: new Map(),
  pending: new Set(),
  renderToken: 0,
  readerTheme: 'light',
  paintKey: '',
  pageColors: createPageColors(null),
  currentPage: 1,
  windowScheduled: false,
  scrollScheduled: false,
  lastRatio: 1,
  lastViewerWidth: 0,
  lastViewerHeight: 0,
  bindings: [],
};
