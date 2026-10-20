/** Состояние инструментов, правки и контекстного меню заметок.
 *
 * Прежний единый файл держал эти переменные в области модуля. Здесь они собраны
 * в один объект: модуль отрисовки читает черновики правки, а модуль операций
 * ими управляет, не образуя циклических зависимостей.
 */
import type { NoteAnchor, NoteType, ShapeGeometry, ViewerNote } from './types';

/** Тяга перемещения заметки: заметка, исходное место и точка захвата. */
export interface MoveDrag {
  /** Перемещаемая заметка. */
  note: ViewerNote;
  /** Исходный якорь заметки. */
  anchor: NoteAnchor;
  /** Исходная геометрия фигуры (если есть). */
  geometry: ShapeGeometry | null;
  /** Координата захвата по X. */
  startX?: number;
  /** Координата захвата по Y. */
  startY?: number;
  /** Ширина страницы на момент захвата. */
  width?: number;
  /** Высота страницы на момент захвата. */
  height?: number;
  /** Идентификатор указателя тяги. */
  pointerId?: number;
  /** Черновик нового якоря во время тяги. */
  draftAnchor?: NoteAnchor;
  /** Черновик новой геометрии во время тяги. */
  draftGeometry?: string;
}

/** Тяга границы цитаты в DjVu: прямоугольники выделения и край. */
export interface ResizeDrag {
  /** Правимая заметка. */
  note: ViewerNote;
  /** Исходный якорь заметки. */
  anchor: NoteAnchor;
  /** Тянутый край: начало или конец. */
  edge: 'start' | 'end';
  /** Страница цитаты (после восстановления кареток). */
  pageEl?: HTMLElement;
  /** Каретка начала выделения. */
  startCaret?: import('./types').Caret;
  /** Каретка конца выделения. */
  endCaret?: import('./types').Caret;
  /** Черновик прямоугольников во время тяги. */
  draft?: import('./types').Rect[];
  /** Черновик текста цитаты во время тяги. */
  draftQuote?: string;
  /** Идентификатор указателя тяги. */
  pointerId?: number;
}

/** Протяжка фигуры: раздел, начало и текущая точка в долях страницы. */
export interface ShapeDrag {
  /** Страница протяжки. */
  pageEl: HTMLElement;
  /** Начальная точка в долях страницы. */
  start: { x: number; y: number };
  /** Текущая точка в долях страницы. */
  current: { x: number; y: number };
  /** Рамка предпросмотра фигуры. */
  preview: HTMLElement;
  /** Идентификатор указателя протяжки. */
  pointerId: number;
}

/** Режим правки заметки: перемещение или сдвиг границ цитаты. */
export interface EditingMode {
  /** Идентификатор правимой заметки. */
  noteId: string;
  /** Режим правки. */
  mode: 'move' | 'resize';
}

/** Контекстное меню заметки: заметка, страница и её элемент. */
export interface NoteMenuState {
  /** Идентификатор заметки. */
  noteId: string;
  /** Тип заметки. */
  noteType: NoteType;
}

/** Общее состояние инструментов и правки заметок. */
export interface EditorState {
  /** Тяга перемещения заметки. */
  moveDrag: MoveDrag | null;
  /** Тяга границы цитаты. */
  resizeDrag: ResizeDrag | null;
  /** Протяжка фигуры. */
  shapeDrag: ShapeDrag | null;
  /** Режим правки заметки. */
  editing: EditingMode | null;
  /** Контекстное меню заметки. */
  noteMenu: NoteMenuState | null;
  /** Элемент направляющих перемещения. */
  moveGuide: HTMLElement | null;
  /** Подавление выбора заметки сразу после завершения правки. */
  clickSuppress: boolean;
}

/** Состояние инструментов и правки заметок. */
export const editor: EditorState = {
  moveDrag: null,
  resizeDrag: null,
  shapeDrag: null,
  editing: null,
  noteMenu: null,
  moveGuide: null,
  clickSuppress: false,
};
