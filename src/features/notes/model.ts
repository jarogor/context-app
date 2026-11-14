/** Модель заметок: типы, цвета, названия и нормализация ответов плагина.
 *
 * Заметка — это **цитата**: выделенный в тексте книги фрагмент с непрозрачным
 * якорем, точно восстанавливающим выделение. Книга ведёт несколько именованных
 * наборов заметок. Модуль чист от Svelte и обращений к мосту: только данные.
 */

import { t } from '@context/i18n';
import {
  ACCENT_COLORS,
  ACCENT_COLOR_SWATCHES,
  DEFAULT_PALETTE,
  DEFAULT_READER_THEME,
  readerThemeNoteTones,
  type PaletteId,
  type ReaderThemeId,
} from '@context/ui';

/** Идентификатор активной библиотеки в ключе книги. */
const NO_LIBRARY = 'no-library';
/** Имя набора заметок, который книга заводит по умолчанию.
 *
 * Перевод берётся из словаря: имя набора сохраняется в хранилище как есть, но
 * создаётся уже на языке интерфейса, выбранном в момент создания.
 */
export function defaultSetName(): string {
  return t('app.note.defaultSet');
}

/** Цвет подсветки заметки по умолчанию. */
export const DEFAULT_NOTE_COLOR = 'yellow';

/** Доступные цвета подсветки заметки.
 *
 * Идентификаторы общие для интерфейса: тот же набор выбирает цвет вкладки,
 * библиотеки и любой другой сущности с оформлением, поэтому список цветов не
 * расходится между областями.
 */
export const NOTE_COLORS = ACCENT_COLORS;

/** Идентификатор цвета подсветки заметки. */
export type NoteColor = (typeof NOTE_COLORS)[number];

/** Названия цветов подсветки для интерфейса на активном языке. */
export function noteColorLabel(color: NoteColor): string {
  return t(`app.note.color.${color}`);
}

/** Насыщенные акценты палитры: образцы выбора цвета (панель, меню, список).
 *
 * Один набор на все области выбора: насыщенные базовые цвета, чтобы образец
 * был узнаваем. Сам вид заметки на странице и её метка в списке берут мягкий тон
 * (`NOTE_COLOR_HIGHLIGHTS`), а не этот акцент.
 */
export const NOTE_COLOR_SWATCHES: Record<NoteColor, string> = ACCENT_COLOR_SWATCHES;

/** Мягкие тона заметок: фон цитаты, заливка фигуры и карточки, метка списка.
 *
 * Один набор на все типы и области: заметка видна, но не затемняет текст.
 * Тот же тон используется и как цвет карточки, и как метка в списке, поэтому
 * жёлтая заметка выглядит жёлтой одинаково везде — и в книге, и в списке.
 *
 * Значения заданы дизайн-системой (`@context/ui`) по палитре и стороне темы
 * области чтения: цвет заметки следует выбранной теме, как и оформление чтения книги.
 */
export function noteHighlights(
  readerTheme: ReaderThemeId = DEFAULT_READER_THEME,
  palette: PaletteId = DEFAULT_PALETTE,
): Record<NoteColor, string> {
  return readerThemeNoteTones(palette, readerTheme);
}

/** Мягкие тона заметок светлой стороны: значения по умолчанию для совместимости. */
export const NOTE_COLOR_HIGHLIGHTS: Record<NoteColor, string> = noteHighlights();

/** Цвет метки заметки в списке: он совпадает с её видом на странице.
 *
 * Заметка любого типа показывается мягким тоном (подсветка цитаты, заливка
 * фигуры, фон карточки), поэтому и метка в списке мягкая — жёлтая заметка
 * одинакова в списке и в книге. Тон берётся из темы области чтения.
 */
export function noteMarkerColor(
  note: { color: NoteColor },
  readerTheme: ReaderThemeId = DEFAULT_READER_THEME,
  palette: PaletteId = DEFAULT_PALETTE,
): string {
  return noteHighlights(readerTheme, palette)[note.color];
}

/** Тип заметки по умолчанию: цитата. */
export const DEFAULT_NOTE_TYPE = 'quote';

/** Известные типы заметок. */
export const NOTE_TYPES = ['quote', 'text', 'shape'] as const;

/** Тип заметки: цитата, текстовая карточка или фигура. */
export type NoteType = (typeof NOTE_TYPES)[number];

/** Названия типов заметок для интерфейса на активном языке. */
export function noteTypeLabel(type: NoteType): string {
  return t(`app.note.type.${type}`);
}

/** Вид фигуры по умолчанию: линия. */
export const DEFAULT_SHAPE_KIND = 'line';

/** Известные виды фигур. */
export const SHAPE_KINDS = ['line', 'rectangle', 'ellipse'] as const;

/** Вид геометрической фигуры. */
export type ShapeKind = (typeof SHAPE_KINDS)[number];

/** Активный инструмент создания заметок: тип, вид фигуры и цвет. */
export interface NoteTool {
  /** Тип создаваемой заметки. */
  type: NoteType;
  /** Вид фигуры для типа `shape`. */
  shape: ShapeKind;
  /** Цвет создаваемой заметки. */
  color: NoteColor;
}

/** Инструмент заметок по умолчанию: цитата жёлтого цвета. */
export const DEFAULT_NOTE_TOOL: NoteTool = {
  type: DEFAULT_NOTE_TYPE,
  shape: DEFAULT_SHAPE_KIND,
  color: DEFAULT_NOTE_COLOR,
};

/** Типы заметок, доступные **текучему** режиму чтения.
 *
 * Текучий режим — встроенное текстовое чтение разметки (EPUB, позже FB2 и
 * подобные): поток текста перестраивается при смене размера области и масштаба,
 * поэтому точки и геометрия заметок неустойчивы. Здесь надёжна только цитата,
 * привязанная текстовыми смещениями.
 */
export const FLOWING_NOTE_TYPES: readonly NoteType[] = ['quote'];

/** Доступные типы заметок по режиму чтения: страничный — все три, текучий — цитата. */
export function allowedNoteTypes(paged: boolean): readonly NoteType[] {
  return paged ? NOTE_TYPES : FLOWING_NOTE_TYPES;
}

/** Приведение инструмента к доступным типам режима.
 *
 * Если активный тип недоступен (например, при переключении на текучий формат с
 * инструмента «фигура»), инструмент становится цитатой; выбранный цвет и вид
 * фигуры сохраняются.
 */
export function normalizeNoteTool(tool: NoteTool, types: readonly NoteType[]): NoteTool {
  if (types.includes(tool.type)) {
    return tool;
  }
  return { ...tool, type: DEFAULT_NOTE_TYPE };
}

/** Сброс типа инструмента на «цитату» после создания заметки.
 *
 * Пользователь сам выбирает кнопку «текст» или «фигура», ставит заметку — и
 * возвращается к цитате, чтобы следующая заметка по умолчанию снова была
 * цитатой. Выбранный цвет и вид фигуры сохраняются: их пользователь задал явно.
 */
export function resetToolTypeAfterCreate(tool: NoteTool): NoteTool {
  if (tool.type === DEFAULT_NOTE_TYPE) {
    return tool;
  }
  return { ...tool, type: DEFAULT_NOTE_TYPE };
}

/** Русские названия видов фигур для интерфейса.
 *
 * Названия короткие: список вида фигуры в панели чтения равен ширине самого
 * длинного варианта, а длинное «Прямоугольник» растягивало его и вытесняло
 * соседние инструменты. «Рамка» — то же действие: обвести область по контуру.
 */
export function shapeKindLabel(kind: ShapeKind): string {
  return t(`app.note.shape.${kind}`);
}

/** Приведение значения к доступному цвету; неизвестное даёт цвет по умолчанию. */
export function normalizeColor(value: unknown): NoteColor {
  const candidate = String(value ?? '').trim();
  return (NOTE_COLORS as readonly string[]).includes(candidate)
    ? (candidate as NoteColor)
    : DEFAULT_NOTE_COLOR;
}

/** Приведение значения к известному типу; неизвестное даёт цитату. */
export function normalizeType(value: unknown): NoteType {
  const candidate = String(value ?? '').trim();
  return (NOTE_TYPES as readonly string[]).includes(candidate)
    ? (candidate as NoteType)
    : DEFAULT_NOTE_TYPE;
}

/** Приведение значения к известному виду фигуры; неизвестное даёт линию. */
export function normalizeShapeKind(value: unknown): ShapeKind {
  const candidate = String(value ?? '').trim();
  return (SHAPE_KINDS as readonly string[]).includes(candidate)
    ? (candidate as ShapeKind)
    : DEFAULT_SHAPE_KIND;
}

/** Заметка к книге: цитата, текстовая карточка или фигура. */
export interface Note {
  /** Идентификатор заметки. */
  id: string;
  /** Тип заметки. */
  type: NoteType;
  /** Непрозрачный якорь места в книге. */
  anchor: string;
  /** Выделенный текст цитаты. */
  quote: string;
  /** Метка главы или раздела места в книге. */
  chapter: string;
  /** Пользовательское название заметки; пустое, если не задано. */
  title: string;
  /** Пользовательский комментарий к заметке; пустой, если не задан. */
  comment: string;
  /** Цвет подсветки заметки. */
  color: NoteColor;
  /** Доля позиции выделения в книге в процентах. */
  percent: number | null;
  /** Номер страницы для страничных форматов; может отсутствовать. */
  page: number | null;
  /** Текст текстовой карточки. */
  text: string;
  /** Вид фигуры для заметки типа `shape`. */
  shape: ShapeKind;
  /** Непрозрачная геометрия фигуры. */
  geometry: string;
  /** Время создания (Unix, мс). */
  createdAtMillis: number;
  /** Время последнего изменения (Unix, мс). */
  updatedAtMillis: number;
}

/** Набор заметок книги вместе с заметками.
 *
 * Тот же тип используется и в реестре: агрегат `list_all_sets` отдаёт наборы всех
 * книг целиком, поэтому отдельного «агрегатного» типа нет.
 */
export interface NoteSet {
  /** Идентификатор набора. */
  id: string;
  /** Ключ книги, которой принадлежит набор. */
  bookKey: string;
  /** Отображаемое имя книги; пустое, если не задано. */
  bookTitle: string;
  /** Человекочитаемое имя набора. */
  name: string;
  /** Время создания (Unix, мс). */
  createdAtMillis: number;
  /** Заметки набора. */
  notes: Note[];
}

/** Краткое описание набора в списке. */
export interface NoteSetSummary {
  /** Идентификатор набора. */
  id: string;
  /** Ключ книги. */
  bookKey: string;
  /** Отображаемое имя книги; пустое, если не задано. */
  bookTitle: string;
  /** Человекочитаемое имя набора. */
  name: string;
  /** Число заметок в наборе. */
  noteCount: number;
}

/** Ключ книги по пути к её файлу (вложению вкладки).
 *
 * Пока нет стабильной идентификации книги (`book-identity`), ключ формирует
 * оболочка. Единый ключ для всех вкладок одной книги сохраняет заметки общими,
 * а рабочее место при этом не знает, откуда книга.
 */
export function bookKey(path: string | null): string {
  const value = (path ?? '').trim();
  return value || NO_LIBRARY;
}

/** Число из значения или значение по умолчанию. */
function toNumber(value: unknown, fallback: number): number {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

/** Необязательное число: отсутствие и нечисло дают null. */
function toOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

/** Нормализация заметки из ответа плагина. */
export function normalizeNote(value: unknown): Note {
  const record = (value ?? {}) as Record<string, unknown>;
  return {
    id: String(record.id ?? ''),
    type: normalizeType(record.type),
    anchor: String(record.anchor ?? ''),
    quote: String(record.quote ?? ''),
    chapter: String(record.chapter ?? ''),
    title: String(record.title ?? ''),
    comment: String(record.comment ?? ''),
    color: normalizeColor(record.color),
    percent: toOptionalNumber(record.percent),
    page: toOptionalNumber(record.page),
    text: String(record.text ?? ''),
    shape: normalizeShapeKind(record.shape),
    geometry: String(record.geometry ?? ''),
    createdAtMillis: toNumber(record.created_at_millis, 0),
    updatedAtMillis: toNumber(record.updated_at_millis, 0),
  };
}

/** Нормализация набора с заметками из ответа плагина. */
export function normalizeSet(value: unknown): NoteSet {
  const record = (value ?? {}) as Record<string, unknown>;
  const notes = Array.isArray(record.notes) ? record.notes.map(normalizeNote) : [];
  return {
    id: String(record.id ?? ''),
    bookKey: String(record.book_key ?? ''),
    bookTitle: String(record.book_title ?? ''),
    name: String(record.name ?? ''),
    createdAtMillis: toNumber(record.created_at_millis, 0),
    notes,
  };
}

/** Нормализация краткого описания набора. */
export function normalizeSetSummary(value: unknown): NoteSetSummary {
  const record = (value ?? {}) as Record<string, unknown>;
  return {
    id: String(record.id ?? ''),
    bookKey: String(record.book_key ?? ''),
    bookTitle: String(record.book_title ?? ''),
    name: String(record.name ?? ''),
    noteCount: toNumber(record.note_count, 0),
  };
}
