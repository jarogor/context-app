/** Встроенное оглавление PDF: дерево закладок документа.
 *
 * В PDF оглавление хранится не в тексте, а в структуре `Outlines`: узлы с
 * названием и целью перехода. Цель бывает явной (`[ref, ...]`), именованной
 * (`getDestination`) или внешней ссылкой. Здесь дерево приводится к общему виду
 * закладки — название и номер страницы, — чтобы оболочка рисовала его одной
 * панелью для всех форматов.
 */
import type { PdfDocument } from './engine';

/** Узел оглавления pdf.js в объёме, нужном для перехода. */
interface OutlineNode {
  /** Название пункта. */
  title?: string;
  /** Цель перехода: имя, явный массив или `null`. */
  dest?: unknown;
  /** Внешний адрес ссылки. */
  url?: string | null;
  /** Вложенные пункты. */
  items?: OutlineNode[];
}

/** Встроенная закладка файла в общем виде. */
export interface ViewerBookmark {
  /** Название пункта. */
  title: string;
  /** Страница перехода (1-based) или `null`. */
  page: number | null;
  /** Вложенные пункты. */
  children: ViewerBookmark[];
}

/** Предел числа узлов оглавления, которые разбираются. */
const BOOKMARK_LIMIT = 2000;

/** Разрешение цели перехода в номер страницы с единицы. */
async function destinationPage(
  doc: PdfDocument,
  dest: unknown,
): Promise<number | null> {
  let value = dest;
  if (typeof value === 'string') {
    try {
      value = await doc.getDestination(value);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  const ref = value[0];
  if (typeof ref === 'number') {
    return Number.isFinite(ref) ? Math.trunc(ref) + 1 : null;
  }
  if (ref && typeof ref === 'object') {
    try {
      const index = await doc.getPageIndex(ref as never);
      return Number.isFinite(index) ? index + 1 : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Дерево оглавления документа в порядке показа.
 *
 * Узлы без цели остаются заголовками разделов: по ним нельзя перейти, но они
 * держат вложенные пункты. Ошибка чтения оглавления даёт пустой список, а не
 * срыв открытия книги.
 */
export async function readBookmarks(doc: PdfDocument): Promise<ViewerBookmark[]> {
  let outline: OutlineNode[] = [];
  try {
    outline = ((await doc.getOutline()) ?? []) as OutlineNode[];
  } catch {
    return [];
  }
  let budget = BOOKMARK_LIMIT;

  /** Разбор узла оглавления с учётом бюджета. */
  async function node(source: OutlineNode): Promise<ViewerBookmark | null> {
    if (budget <= 0) {
      return null;
    }
    budget -= 1;
    const title = String(source.title ?? '').trim();
    const page = source.dest ? await destinationPage(doc, source.dest) : null;
    const children: ViewerBookmark[] = [];
    for (const child of source.items ?? []) {
      const parsed = await node(child);
      if (parsed) {
        children.push(parsed);
      }
    }
    if (!title && page === null && children.length === 0) {
      return null;
    }
    return { title, page, children };
  }

  const result: ViewerBookmark[] = [];
  for (const item of outline) {
    const parsed = await node(item);
    if (parsed) {
      result.push(parsed);
    }
  }
  return result;
}
