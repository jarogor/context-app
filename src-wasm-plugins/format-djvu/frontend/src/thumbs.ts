/** Миниатюры страниц DjVu по запросу приложения.
 *
 * Панель свойств файла заказывает миниатюры только видимых пунктов списка:
 * отрисовка всей книги заняла бы минуты. Страница рисуется в маленький канвас с
 * низкой плотностью и отдаётся картинкой (`data:`-URL); повторный запрос уже
 * нарисованной страницы её не рисует.
 */
import { newPixmap, renderRequest, type DjVuModule } from './engine';
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
  const module = state.module;
  if (!doc || !module) {
    return null;
  }
  try {
    const page = doc.page(pageNumber - 1);
    const stored = Math.max(1, page.dpi() || 300);
    const nativeWidth = page.width_at(stored);
    if (nativeWidth <= 0) {
      return null;
    }
    // Разрешение миниатюры переводится из ширины в пикселях: движок рисует по
    // DPI, а панель задаёт ширину картинки.
    const dpi = Math.max(1, Math.round((stored * width) / nativeWidth));
    const request = renderRequest(module as DjVuModule, dpi);
    const pixmap = newPixmap(module as DjVuModule);
    page.render_request(request, pixmap);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, pixmap.width());
    canvas.height = Math.max(1, pixmap.height());
    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }
    context.putImageData(
      new ImageData(new Uint8ClampedArray(pixmap.view()), canvas.width, canvas.height),
      0,
      0,
    );
    // Миниатюра остаётся светлой и в тёмной теме: это вид страницы, а не текст
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
 */
export async function sendThumbs(pages: number[], width: number): Promise<void> {
  const unique = Array.from(new Set(pages.filter((page) => page >= 1)));
  const batchSize = 4;
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
