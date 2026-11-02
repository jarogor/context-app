/** Миниатюры страниц PDF по запросу приложения.
 *
 * Панель свойств файла заказывает миниатюры страниц, которые видит читатель:
 * отрисовка всей книги заняла бы минуты. Страница рисуется в маленький канвас и
 * отдаётся картинкой (`data:`-URL); повторный запрос уже нарисованной страницы
 * её не рисует.
 *
 * Страницы рисуются **строго по одной**. pdf.js держит разобранную страницу и
 * её операторы, пока на неё есть ссылка, а пачка из десятка страниц на большой
 * книге раздувала память так, что процесс убивала система. После отрисовки
 * страница освобождается (`cleanup`), поэтому пик памяти — одна миниатюра.
 */
import { engine, type PdfJsModule } from './engine';
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

/** Нарисованные миниатюры: ключ `страница:ширина`. */
const cache = new Map<string, Thumb>();

/** Страницы, которые нарисовать не удалось: повторно не заказываются.
 *
 * Запись не вечна: неудачная страница пробуется ещё раз после паузы, потому что
 * первый сбой бывает случайным. Совсем не рисующаяся страница так и остаётся
 * без превью, но не запускает бесконечный цикл.
 */
const failed = new Map<string, number>();

/** Сколько раз пробовать неудачную страницу, прежде чем оставить её без превью. */
const FAILED_RETRIES = 2;

/** Очередь заказов: циклы отрисовки не должны идти одновременно. */
let queue: Promise<void> = Promise.resolve();

/** Сброс кэша миниатюр (новая книга). */
/**
 * Сброс кэша миниатюр через очередь.
 *
 * Сброс не должен застать идущую отрисовку врасплох: он встаёт в ту же очередь,
 * что и заказы страниц.
 */
export function resetThumbsQueued(): Promise<void> {
  queue = queue.then(() => resetThumbs()).catch(() => undefined);
  return queue;
}

export function resetThumbs(): void {
  cache.clear();
  failed.clear();
}

/** Целевая ширина миниатюры в CSS-пикселях: панель просит её же. */
const MIN_RENDER_WIDTH = 288;

/** Отрисовка одной миниатюры; `null` — страницу нарисовать не удалось. */
async function renderThumb(pageNumber: number, width: number): Promise<Thumb | null> {
  const doc = state.doc;
  const lib = engine() as PdfJsModule | null;
  if (!doc || !lib) {
    return null;
  }
  try {
    const page = await doc.getPage(pageNumber);
    try {
      const base = page.getViewport({ scale: 1 });
      // Страница рисуется в нормальном разрешении и затем уменьшается: сразу
      // мелкий растр даёт неровный текст, потому что глифы попадают в сетку
      // по-разному — на превью это читается как «полстраницы жирным».
      const renderWidth = Math.max(width, MIN_RENDER_WIDTH);
      const viewport = page.getViewport({ scale: renderWidth / Math.max(1, base.width) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(viewport.width));
      canvas.height = Math.max(1, Math.round(viewport.height));
      const context = canvas.getContext('2d');
      if (!context) {
        return null;
      }
      // Аннотации в миниатюру не рисуются: обзор показывает страницу, а
      // разбор аннотаций — отдельная задача панели свойств.
      await page.render({ canvasContext: context, viewport, annotationMode: 0 }).promise;
      const thumbCanvas = document.createElement('canvas');
      thumbCanvas.width = Math.max(1, Math.round(width));
      thumbCanvas.height = Math.max(
        1,
        Math.round((canvas.height * thumbCanvas.width) / canvas.width),
      );
      const thumbContext = thumbCanvas.getContext('2d');
      if (!thumbContext) {
        return null;
      }
      // Уменьшение канвасом с высоким качеством усредняет пиксели: текст
      // становится ровным серым, а не рваным чёрным.
      thumbContext.imageSmoothingEnabled = true;
      thumbContext.imageSmoothingQuality = 'high';
      thumbContext.drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
      // В тёмной теме миниатюра остаётся светлой: это вид страницы, а не текст
      // для чтения, и перекраска уменьшенного растра съедала бы детали.
      const dataUrl = thumbCanvas.toDataURL('image/jpeg', 0.85);
      return {
        page: pageNumber,
        dataUrl,
        width: thumbCanvas.width,
        height: thumbCanvas.height,
      };
    } finally {
      // Разобранная страница и её операторы освобождаются сразу: иначе на
      // книге в сотни страниц они накапливаются в памяти документа.
      page.cleanup();
    }
  } catch {
    return null;
  }
}

/** Отрисовка запрошенных миниатюр и отправка их приложению.
 *
 * Страницы рисуются по одной и отправляются сразу, как только готовы: панель
 * наполняется постепенно, а не после всей пачки. Неудачная страница
 * запоминается и повторно не заказывается — иначе панель, видя отсутствие
 * картинки, заказывала бы её снова и снова.
 */
export async function sendThumbs(pages: number[], width: number): Promise<void> {
  // Заказы выполняются строго по очереди: отрисовка страницы не должна
  // пересекаться с другой.
  queue = queue.then(() => renderBatch(pages, width)).catch(() => undefined);
  return queue;
}

/** Отрисовка одной порции заказа. */
async function renderBatch(pages: number[], width: number): Promise<void> {
  const unique = Array.from(new Set(pages.filter((page) => page >= 1)));
  for (const page of unique) {
    const key = `${page}:${width}`;
    if ((failed.get(key) ?? 0) >= FAILED_RETRIES) {
      continue;
    }
    const cached = cache.get(key);
    if (cached) {
      post({ type: 'thumbs', value: [cached] });
      continue;
    }
    const thumb = await renderThumb(page, width);
    if (!thumb) {
      failed.set(key, (failed.get(key) ?? 0) + 1);
      continue;
    }
    cache.set(key, thumb);
    post({ type: 'thumbs', value: [thumb] });
    // Управление возвращается браузеру между страницами: прокрутка и чтение не
    // ждут конца заказа.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
