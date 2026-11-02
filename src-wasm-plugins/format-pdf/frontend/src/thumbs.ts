/** Миниатюры страниц PDF по запросу приложения.
 *
 * Панель свойств файла заказывает миниатюры видимых пунктов списка, а не всей
 * книги: у книги на сотни страниц полная отрисовка заняла бы минуты. Страница
 * рисуется в маленький канвас с низкой плотностью и отдаётся картинкой
 * (`data:`-URL); повторный запрос уже нарисованной страницы не рисует её снова.
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

/** Отрисовки, которые уже идут: повторный запрос ждёт ту же. */
const pending = new Map<string, Promise<Thumb | null>>();

/** Сброс кэша миниатюр (новая книга). */
export function resetThumbs(): void {
  cache.clear();
  pending.clear();
}

/** Отрисовка одной миниатюры. */
async function renderThumb(pageNumber: number, width: number): Promise<Thumb | null> {
  const doc = state.doc;
  const lib = engine() as PdfJsModule | null;
  if (!doc || !lib) {
    return null;
  }
  try {
    const page = await doc.getPage(pageNumber);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: width / Math.max(1, base.width) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }
    await page.render({ canvasContext: context, viewport }).promise;
    // В тёмной теме миниатюра остаётся светлой: это вид страницы, а не текст
    // для чтения, и перекраска уменьшенного растра съедала бы детали.
    const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
    return { page: pageNumber, dataUrl, width: canvas.width, height: canvas.height };
  } catch {
    return null;
  }
}

/** Отрисовка миниатюры с объединением повторных запросов. */
function thumbOf(pageNumber: number, width: number): Promise<Thumb | null> {
  const key = `${pageNumber}:${width}`;
  const cached = cache.get(key);
  if (cached) {
    return Promise.resolve(cached);
  }
  const existing = pending.get(key);
  if (existing) {
    return existing;
  }
  const task = renderThumb(pageNumber, width)
    .then((thumb) => {
      if (thumb) {
        cache.set(key, thumb);
      }
      return thumb;
    })
    .finally(() => {
      pending.delete(key);
    });
  pending.set(key, task);
  return task;
}

/** Отрисовка запрошенных миниатюр и отправка их приложению.
 *
 * Миниатюры рисуются небольшими порциями: у большой книги параллельная
 * отрисовка десятков страниц занимает весь главный поток и мешает чтению.
 * Ответ уходит порциями, поэтому список в панели наполняется по мере
 * готовности.
 */
export async function sendThumbs(pages: number[], width: number): Promise<void> {
  const unique = Array.from(new Set(pages.filter((page) => page >= 1)));
  const batchSize = 6;
  for (let from = 0; from < unique.length; from += batchSize) {
    const batch = unique.slice(from, from + batchSize);
    const rendered = await Promise.all(batch.map((page) => thumbOf(page, width)));
    const value = rendered.filter((thumb): thumb is Thumb => thumb !== null);
    if (value.length > 0) {
      post({ type: 'thumbs', value });
    }
    // Между порциями управление отдаётся браузеру: прокрутка и отрисовка
    // страниц чтения не ждут конца заказа.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
