/** Ссылки страницы PDF: оглавление и перекрёстные ссылки документа.
 *
 * В PDF оглавление и сноски — не текст, а **аннотации-ссылки**: прямоугольник на
 * странице и цель перехода. Растр и текстовый слой pdf.js их не рисуют, поэтому
 * до этого модуля клик по пункту содержания ничего не делал.
 *
 * Ссылка ведёт либо внутрь документа (страница или именованная цель), либо наружу
 * (URL). Внутренний переход выполняется здесь же прокруткой к странице; внешний
 * отдаётся приложению сообщением `open-link` — область книги живёт в песочнице и
 * сама браузером ссылки не открывает.
 */
import type { PdfDocument, PdfPage, PdfViewport } from './engine';
import { gotoPage } from './navigation';
import { post } from './protocol';

/** Класс слоя ссылок страницы. */
export const LINK_LAYER_CLASS = 'link-layer';
/** Класс одной ссылки. */
export const LINK_CLASS = 'page-link';

/** Вид аннотации-ссылки в pdf.js. */
const ANNOTATION_LINK = 2;

/** Аннотация-ссылка pdf.js в объёме, нужном для перехода. */
interface LinkAnnotation {
  /** Подтип аннотации: ссылки — `Link`. */
  subtype?: string;
  /** Вид аннотации в pdf.js (`AnnotationType.LINK`). */
  annotationType?: number;
  /** Прямоугольник аннотации в координатах страницы. */
  rect?: number[];
  /** Цель перехода внутри документа: имя или явный массив. */
  dest?: unknown;
  /** Внешний адрес ссылки. */
  url?: string;
  /** Непроверенный адрес: используется, если нет `url`. */
  unsafeUrl?: string;
  /** Подсказка ссылки. */
  title?: string;
}

/** Прямоугольник ссылки в пикселях окна страницы. */
interface LinkBox {
  /** Отступ слева. */
  left: number;
  /** Отступ сверху. */
  top: number;
  /** Ширина. */
  width: number;
  /** Высота. */
  height: number;
}

/** Признак аннотации-ссылки. */
function isLinkAnnotation(annotation: LinkAnnotation): boolean {
  return annotation.subtype === 'Link' || annotation.annotationType === ANNOTATION_LINK;
}

/** Разрешение цели перехода в номер страницы с единицы.
 *
 * Поддерживаются оба вида цели: явный массив (`[ref, ...]`) и именованная цель
 * (строка) — её разрешает документ через `getDestination`.
 */
async function resolveDestinationPage(
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
  let index: number | null = null;
  if (typeof ref === 'number') {
    // Прямой номер страницы (нумерация с нуля).
    index = ref;
  } else if (ref && typeof ref === 'object') {
    try {
      index = await doc.getPageIndex(ref as never);
    } catch {
      return null;
    }
  }
  if (index === null || !Number.isFinite(index)) {
    return null;
  }
  return index + 1;
}

/** Прямоугольник аннотации в координатах окна страницы.
 *
 * Система координат PDF начинается снизу, окна страницы — сверху, поэтому
 * прямоугольник переводится через преобразование вида.
 */
function linkBox(annotation: LinkAnnotation, viewport: PdfViewport): LinkBox | null {
  const rect = annotation.rect;
  if (!Array.isArray(rect) || rect.length < 4) {
    return null;
  }
  const [x1, y1, x2, y2] = rect.map(Number);
  if (![x1, y1, x2, y2].every(Number.isFinite)) {
    return null;
  }
  const corners = viewport.convertToViewportRectangle([
    Math.min(x1, x2),
    Math.min(y1, y2),
    Math.max(x1, x2),
    Math.max(y1, y2),
  ]);
  const left = Math.min(corners[0], corners[2]);
  const top = Math.min(corners[1], corners[3]);
  const width = Math.abs(corners[2] - corners[0]);
  const height = Math.abs(corners[3] - corners[1]);
  if (width <= 0 || height <= 0) {
    return null;
  }
  return { left, top, width, height };
}

/** Слой ссылок страницы по её элементу. */
export function linkLayerOf(pageEl: Element): HTMLElement | null {
  return pageEl.querySelector(`.${LINK_LAYER_CLASS}`);
}

/** Удаление слоя ссылок страницы. */
export function clearLinkLayer(pageEl: Element): void {
  linkLayerOf(pageEl)?.remove();
}

/** Обработка нажатия на ссылку.
 *
 * Внешний адрес уходит приложению, внутренняя цель прокручивает документ к
 * странице. Нажатие не всплывает: иначе оно попало бы в обработчики страницы и
 * создало бы заметку.
 */
function activateLink(
  event: MouseEvent,
  doc: PdfDocument,
  url: string,
  dest: unknown,
): void {
  event.preventDefault();
  event.stopPropagation();
  if (url) {
    post({ type: 'open-link', value: { href: url } });
    return;
  }
  if (dest === undefined) {
    return;
  }
  void resolveDestinationPage(doc, dest).then((page) => {
    if (page !== null) {
      gotoPage(page);
    }
  });
}

/** Построение слоя ссылок страницы.
 *
 * Слой лежит **над** текстовым слоем: ссылка должна нажиматься, как в любом
 * просмотрщике PDF, даже если под ней есть текст. Сам слой событий не ловит
 * (`pointer-events: none`), их принимают только прямоугольники ссылок.
 */
export async function renderLinks(
  doc: PdfDocument,
  page: PdfPage,
  pageEl: HTMLElement,
  viewport: PdfViewport,
): Promise<void> {
  let annotations: LinkAnnotation[] = [];
  try {
    annotations = (await page.getAnnotations({ intent: 'display' })) as LinkAnnotation[];
  } catch {
    return;
  }
  const links = annotations.filter(isLinkAnnotation);
  if (links.length === 0) {
    clearLinkLayer(pageEl);
    return;
  }
  const layer = document.createElement('div');
  layer.className = LINK_LAYER_CLASS;
  for (const annotation of links) {
    const box = linkBox(annotation, viewport);
    if (!box) {
      continue;
    }
    const url = annotation.url ?? annotation.unsafeUrl ?? '';
    const dest = annotation.dest;
    if (!url && dest === undefined) {
      continue;
    }
    const anchor = document.createElement('a');
    anchor.className = LINK_CLASS;
    anchor.href = '#';
    anchor.style.left = `${box.left}px`;
    anchor.style.top = `${box.top}px`;
    anchor.style.width = `${box.width}px`;
    anchor.style.height = `${box.height}px`;
    if (annotation.title) {
      anchor.title = annotation.title;
    }
    anchor.addEventListener('click', (event) => activateLink(event, doc, url, dest));
    layer.append(anchor);
  }
  clearLinkLayer(pageEl);
  if (!layer.children.length) {
    return;
  }
  // Слой вставляется после текстового слоя и до наложения заметок: ссылки выше
  // текста, но подсветки и карточки остаются выше ссылок.
  const overlay = pageEl.querySelector('.overlay');
  pageEl.insertBefore(layer, overlay);
}
