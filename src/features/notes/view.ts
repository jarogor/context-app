/** Представление заметок для интерфейса: имя, содержимое, место, порядок.
 *
 * Модуль чист от Svelte и обращений к мосту: превращает модель заметки в
 * готовые к показу строки и сортирует список по ходу текста книги.
 */

import { isPageAnchor, isPointAnchor, parseAnchor } from '../reader/reader/anchor';
import { t } from '@context/i18n';
import { shapeKindLabel, type Note } from './model';

/** Имя заметки: пользовательское название, затем содержимое по типу, иначе номер.
 *
 * Название, заданное пользователем, имеет приоритет над содержимым: заметка
 * узнаётся по смыслу, а не по началу цитаты. Без названия имя берётся из цитаты,
 * текста карточки или подписи вида фигуры. Пустое содержимое даёт номер заметки.
 */
export function noteName(note: Note, index: number): string {
  const title = note.title.trim();
  if (title) {
    return title.length > 80 ? `${title.slice(0, 80)}…` : title;
  }
  if (note.type === 'shape') {
    return shapeKindLabel(note.shape);
  }
  const content = (note.type === 'text' ? note.text : note.quote).trim();
  if (!content) {
    return t('app.note.name', { index: index + 1 });
  }
  return content.length > 80 ? `${content.slice(0, 80)}…` : content;
}

/** Содержимое заметки для списка: цитата, текст карточки или вид фигуры.
 *
 * Имя заметки может быть перекрыто пользовательским названием, поэтому
 * содержимое выводится отдельной строкой и позволяет сопоставить запись с
 * фрагментом книги. Для фигуры содержимого нет — показывается её вид.
 */
export function notePreview(note: Note): string {
  if (note.type === 'shape') {
    return '';
  }
  const content = (note.type === 'text' ? note.text : note.quote).trim();
  return content.length > 120 ? `${content.slice(0, 120)}…` : content;
}

/** Отображаемое место заметки: страница либо доля позиции. */
export function notePlace(note: Note): string {
  if (note.page !== null) {
    return t('app.note.page', { page: note.page });
  }
  if (note.percent !== null) {
    return `${note.percent.toFixed(2)} %`;
  }
  return '';
}

/** Заметка-цитата в объёме списка. */
export interface NoteListItem {
  /** Заметка-цитата. */
  note: Note;
  /** Отображаемое имя заметки (название или содержимое). */
  name: string;
  /** Начало содержимого заметки (цитата, текст или вид фигуры). */
  preview: string;
  /** Отображаемое место заметки. */
  place: string;
  /** Дата создания заметки (Unix, мс). */
  createdAtMillis: number;
}

/** Сравнимое место заметки без якоря: страница, иначе доля позиции в книге. */
function fallbackLocation(note: Note): number {
  if (note.page !== null) {
    return note.page;
  }
  if (note.percent !== null) {
    return note.percent;
  }
  return Number.POSITIVE_INFINITY;
}

/** Сравнение заметок по ходу текста книги, затем по времени создания.
 *
 * Порядок отражает расположение в книге: заметка, созданная позже, но стоящая
 * выше по тексту, идёт раньше. Якорь даёт точную позицию: для текстового якоря —
 * глава и смещение символов, для страничного — номер страницы, для якоря точки —
 * глава и доля вертикали. Без якоря опорой служат страница или доля позиции.
 */
function byPosition(left: Note, right: Note): number {
  const a = parseAnchor(left.anchor);
  const b = parseAnchor(right.anchor);
  if (a && b) {
    if (isPageAnchor(a) && isPageAnchor(b)) {
      const leftPage = a.page ?? 0;
      const rightPage = b.page ?? 0;
      if (leftPage !== rightPage) {
        return leftPage - rightPage;
      }
    } else if (isPointAnchor(a) && isPointAnchor(b)) {
      if (a.chapter !== b.chapter) {
        return a.chapter - b.chapter;
      }
      const leftY = a.y ?? 0;
      const rightY = b.y ?? 0;
      if (leftY !== rightY) {
        return leftY - rightY;
      }
    } else if (isPageAnchor(a) || isPageAnchor(b) || isPointAnchor(a) || isPointAnchor(b)) {
      // Якорь страницы или точки сопоставим с прочими лишь по месту книги.
      const difference = fallbackLocation(left) - fallbackLocation(right);
      if (difference !== 0) {
        return difference;
      }
    } else {
      if (a.chapter !== b.chapter) {
        return a.chapter - b.chapter;
      }
      if (a.start !== b.start) {
        return a.start - b.start;
      }
    }
  } else if (a || b) {
    // Заметки без якоря не имеют точного места — показываем их в конце.
    return a ? -1 : 1;
  } else {
    const difference = fallbackLocation(left) - fallbackLocation(right);
    if (difference !== 0) {
      return difference;
    }
  }
  return left.createdAtMillis - right.createdAtMillis;
}

/** Элементы списка заметок-цитат: имя, место и дата.
 *
 * Порядок отражает ход контента (глава и смещение в тексте, иначе страница или
 * доля позиции), а не очерёдность добавления: заметка, созданная позже, но
 * расположенная выше в книге, идёт раньше. Дата остаётся для понимания
 * хронологии.
 */
export function noteList(notes: Note[]): NoteListItem[] {
  return [...notes].sort(byPosition).map((note, index) => ({
    note,
    name: noteName(note, index),
    preview: notePreview(note),
    place: notePlace(note),
    createdAtMillis: note.createdAtMillis,
  }));
}
