/** Миниатюры страниц DjVu по запросу приложения.
 *
 * Панель свойств файла заказывает миниатюры страниц, которые видит читатель:
 * отрисовка всей книги заранее заняла бы минуты и память. Страница рисуется в
 * канвас и отдаётся картинкой (`data:`-URL); повторный запрос уже нарисованной
 * страницы её не рисует.
 *
 * Качество. Двухцветная маска DjVu (`JB2`) хранит буквы в родном разрешении
 * файла, и при отрисовке мельче родного движок сводит её без сглаживания: буквы
 * сливаются, и страница выглядит «жирной кашей» местами. Поэтому страница
 * **сначала рисуется в 96 dpi**, а затем уменьшается уже растром — но
 * уменьшением канваса (`drawImage` с высоким качеством), а не циклом по
 * пикселям в JavaScript. Цикл по пикселям на странице в 800×1050 занимал
 * десятки миллисекунд на каждую ступень и блокировал главный поток: панель
 * замирала рывками.
 *
 * Память. Страницы рисуются **строго по одной**, дескрипторы и пиксмапы
 * освобождаются сразу: движок держит разобранную страницу, пока живёт её
 * дескриптор, и пачка страниц на большой книге раздувала процесс до того, что
 * его убивала система.
 */
import { newPixmap, renderRequest, openDocument, type DjVuModule } from './engine';
import { post } from './protocol';
import { state } from './state';

/** Миниатюра страницы. */
export interface Thumb {
  /** Номер страницы (1-based). */
  page: number;
  /** Картинка как data-URL. */
  dataUrl: string;
  /** Ширина картинки в пикселях. */
  width: number;
  /** Высота картинки в пикселях. */
  height: number;
}

/** Разрешение отрисовки: ниже маска DjVu рассыпается, выше — лишняя работа.
 *
 * Это абсолютное разрешение растра, а не доля ширины страницы: у страницы
 * 300 dpi рендер в 96 dpi даёт растр примерно 1050×810 (3 МБ), а не 30 МБ,
 * как рендер «в ширину страницы».
 */
const RENDER_DPI = 96;

/** Нарисованные миниатюры: ключ `страница:ширина`. */
const cache = new Map<string, Thumb>();

/** Страницы, которые нарисовать не удалось: повторно не заказываются.
 *
 * Запись не вечна: неудачная страница пробуется ещё раз после паузы, потому что
 * первый сбой бывает случайным (например, документ миниатюр как раз
 * переоткрывался). Совсем не рисующаяся страница так и остаётся без превью, но
 * не запускает бесконечный цикл.
 */
const failed = new Map<string, number>();

/** Сколько раз пробовать неудачную страницу, прежде чем оставить её без превью. */
const FAILED_RETRIES = 2;

/** Признак, что страница уже пробовалась слишком много раз. */
function isFailed(key: string): boolean {
  return (failed.get(key) ?? 0) >= FAILED_RETRIES;
}

/** Учёт неудачной попытки. */
function markFailed(key: string): void {
  failed.set(key, (failed.get(key) ?? 0) + 1);
}

/** Очередь заказов: циклы отрисовки не должны идти одновременно.
 *
 * Панель присылает заказы по мере прокрутки, и циклы пересекались: один
 * переоткрывал документ миниатюр (по исчерпании бюджета страниц), пока другой
 * ещё рисовал из него страницу. Освобождённый документ ронял отрисовку, и эти
 * страницы навсегда оставались без превью — ровно та «дыра» посреди книги.
 */
let queue: Promise<void> = Promise.resolve();

/** Документ миниатюр: свой, а не документ чтения.
 *
 * Движок держит каждую разобранную страницу в памяти документа до его закрытия
 * и после этого память не отдаёт. Миниатюры перебирают много страниц, и на
 * документе чтения это раздувало процесс на всю книгу. Отдельный документ
 * закрывается по исчерпании бюджета страниц: тогда миниатюры не занимают
 * память книги, которую читают.
 */
let thumbDoc: ReturnType<typeof openDocument> | null = null;

/** Сколько страниц разобрать до переоткрытия документа миниатюр. */
const DOC_PAGE_BUDGET = 24;

/** Сколько страниц разобрано в текущем документе миниатюр. */
let docPagesUsed = 0;

/** Сброс кэша миниатюр (новая книга). */
export function resetThumbs(): void {
  cache.clear();
  failed.clear();
  if (typeof thumbDoc?.free === 'function') {
    thumbDoc.free();
  }
  thumbDoc = null;
  docPagesUsed = 0;
}

/** Документ миниатюр: переоткрывается, когда израсходован бюджет страниц. */
function documentForThumbs(): ReturnType<typeof openDocument> | null {
  const module = state.module;
  const bookBytes = state.bytes;
  if (!module || !bookBytes) {
    return null;
  }
  if (!thumbDoc || docPagesUsed >= DOC_PAGE_BUDGET) {
    // Дескриптор документа может быть подменён в тестах: освобождение
    // проверяется по наличию метода, а не по конкретному классу движка.
    if (typeof thumbDoc?.free === 'function') {
      thumbDoc.free();
    }
    try {
      thumbDoc = openDocument(module as DjVuModule, bookBytes);
    } catch {
      thumbDoc = null;
    }
    docPagesUsed = 0;
  }
  return thumbDoc;
}

/** Разрешение отрисовки миниатюры.
 *
 * 96 dpi — нижняя граница: мельче двухцветная маска DjVu сходится без
 * сглаживания и текст на превью разваливается. Выше родного разрешения файла
 * деталей в миниатюре не прибавится, а растр стоит вдвое дороже.
 */
export function renderDpiFor(_nativeDpi: number): number {
  // Всегда 96: этого достаточно, чтобы маска DjVu сошлась со сглаживанием, и
  // многократно дешевле рендера в родном разрешении страницы.
  return RENDER_DPI;
}

/** Уменьшение канваса до целевой ширины.
 *
 * Уменьшение идёт ступенями не более чем вдвое: крупный шаг браузер делает
 * выборкой пикселей и теряет тонкие штрихи. Каждая ступень — нативное
 * `drawImage`, поэтому работа идёт в движке отрисовки, а не в главном потоке.
 */
function downscaleCanvas(
  source: HTMLCanvasElement,
  targetWidth: number,
): HTMLCanvasElement {
  const target = Math.max(1, Math.round(targetWidth));
  let current = source;
  while (current.width > target * 2) {
    const next = document.createElement('canvas');
    next.width = Math.max(target, Math.round(current.width / 2));
    next.height = Math.max(
      1,
      Math.round((current.height * next.width) / current.width),
    );
    const context = next.getContext('2d');
    if (!context) {
      return current;
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(current, 0, 0, next.width, next.height);
    current = next;
  }
  if (current.width === target) {
    return current;
  }
  const final = document.createElement('canvas');
  final.width = target;
  final.height = Math.max(1, Math.round((current.height * target) / current.width));
  const context = final.getContext('2d');
  if (!context) {
    return current;
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(current, 0, 0, final.width, final.height);
  return final;
}

/** Отрисовка одной миниатюры; `null` — страницу нарисовать не удалось. */
function renderThumb(pageNumber: number, width: number): Thumb | null {
  const module = state.module;
  const doc = documentForThumbs();
  if (!doc || !module) {
    return null;
  }
  let page: ReturnType<typeof doc.page> | null = null;
  let request: ReturnType<typeof renderRequest> | null = null;
  let pixmap: ReturnType<typeof newPixmap> | null = null;
  try {
    page = doc.page(pageNumber - 1);
    docPagesUsed += 1;
    const native = Math.max(1, page.dpi() || 300);
    if (page.width_at(native) <= 0) {
      return null;
    }
    request = renderRequest(module as DjVuModule, renderDpiFor(native));
    pixmap = newPixmap(module as DjVuModule);
    page.render_request(request, pixmap);
    const renderWidth = pixmap.width();
    const renderHeight = pixmap.height();
    if (renderWidth <= 0 || renderHeight <= 0) {
      return null;
    }
    const source = document.createElement('canvas');
    source.width = renderWidth;
    source.height = renderHeight;
    const sourceContext = source.getContext('2d');
    if (!sourceContext) {
      return null;
    }
    // Пиксели копируются из памяти WASM один раз — дальше работает движок.
    sourceContext.putImageData(
      new ImageData(new Uint8ClampedArray(pixmap.view()), renderWidth, renderHeight),
      0,
      0,
    );
    const thumbCanvas = downscaleCanvas(source, width);
    // Миниатюра остаётся светлой и в тёмной теме: это вид страницы, а не текст
    // для чтения, и перекраска уменьшенного растра съедала бы детали.
    const dataUrl = thumbCanvas.toDataURL('image/jpeg', 0.82);
    return {
      page: pageNumber,
      dataUrl,
      width: thumbCanvas.width,
      height: thumbCanvas.height,
    };
  } catch {
    return null;
  } finally {
    // Память WASM возвращается сразу: движок держит разобранную страницу, пока
    // живёт её дескриптор, а книга бывает на сотни страниц.
    pixmap?.free();
    request?.free();
    page?.free();
  }
}

/** Отрисовка запрошенных миниатюр и отправка их приложению.
 *
 * Страницы рисуются по одной и отправляются сразу, как только готовы: панель
 * наполняется постепенно, а не после всей пачки. Неудачная страница
 * запоминается и повторно не заказывается — иначе панель, видя отсутствие
 * картинки, заказывала бы её снова и снова (бесконечный цикл, который выедал
 * процессор и память).
 */
export async function sendThumbs(pages: number[], width: number): Promise<void> {
  // Заказы выполняются строго по очереди: документ миниатюр один, и его
  // переоткрытие не должно застать другую отрисовку врасплох.
  queue = queue.then(() => renderBatch(pages, width)).catch(() => undefined);
  return queue;
}

/** Отрисовка одной порции заказа. */
async function renderBatch(pages: number[], width: number): Promise<void> {
  const unique = Array.from(new Set(pages.filter((page) => page >= 1)));
  for (const page of unique) {
    const key = `${page}:${width}`;
    if (isFailed(key)) {
      continue;
    }
    const cached = cache.get(key);
    if (cached) {
      post({ type: 'thumbs', value: [cached] });
      continue;
    }
    const thumb = renderThumb(page, width);
    if (!thumb) {
      markFailed(key);
      continue;
    }
    cache.set(key, thumb);
    post({ type: 'thumbs', value: [thumb] });
    // Управление возвращается браузеру между страницами: прокрутка и чтение не
    // ждут конца заказа.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
