/** Общее состояние модуля рисования.
 *
 * Прежний единый файл держал переменные в области модуля; здесь то же состояние
 * собрано в один объект, чтобы модули могли читать и менять его явно.
 */
import type { PageColors } from './types';
import type { ViewerBinding } from './hotkeys';
import type { PdfDocument } from './engine';
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
  /** Документ pdf.js текущей книги. */
  doc: PdfDocument | null;
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
  /** Натуральные размеры страниц при масштабе 1. */
  naturalSizes: PageSize[];
  /** Отрисованные страницы: элемент страницы → её запись. */
  rendered: Map<HTMLElement, RenderedEntry>;
  /** Страницы, отрисовка которых уже идёт. */
  pending: Set<HTMLElement>;
  /** Поколение рендера: смена масштаба отменяет незавершённые отрисовки. */
  renderEpoch: number;
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
  /** Наблюдатель видимости страниц. */
  observer: IntersectionObserver | null;
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
  doc: null,
  pageCount: 0,
  zoom: 100,
  initialZoom: 100,
  notes: [],
  tool: { type: 'quote', shape: 'line', color: 'yellow' },
  naturalSizes: [],
  rendered: new Map(),
  pending: new Set(),
  renderEpoch: 0,
  readerTheme: 'light',
  paintKey: '',
  pageColors: createPageColors(null),
  currentPage: 1,
  windowScheduled: false,
  observer: null,
  scrollScheduled: false,
  lastRatio: 1,
  lastViewerWidth: 0,
  lastViewerHeight: 0,
  bindings: [],
};
