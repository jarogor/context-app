/** Дисковый кэш свойств открытого файла.
 *
 * Свойства книги (закладки, число страниц, превью и встроенные пометки)
 * добываются дорого: PDF и DjVu разбирают страницы, а миниатюры рисуются
 * секундами. Вкладка открывает один файл много раз, поэтому результат читается
 * из кэша ядра до загрузки плагина и показывается сразу, а найденное позже
 * сохраняется порциями.
 *
 * Модуль чист от Svelte: только вызовы моста и приведение непрозрачного
 * ответа ядра. Формат данных принадлежит плагину, оболочка его не разбирает —
 * она лишь знает, какие поля панели ей нужны.
 */

import { invokeCommand } from '../../shared/app-bridge';
import type { FileAnnotation } from './file-properties';
import type { WorkplaceThumbnail } from './workplace-protocol';

/** Свойства книги из кэша, приведённые к тому, что показывает панель. */
export interface CachedProperties {
  /** Закладки файла в непрозрачном виде плагина. */
  bookmarks: unknown;
  /** Число страниц книги. */
  pageCount: number | null;
  /** Превью страниц: номер → data-URL. */
  thumbs: Record<number, string>;
  /** Найденные встроенные пометки. */
  annotations: FileAnnotation[];
}

/** Запись кэша целиком: непрозрачные свойства и пометки с превью. */
interface CacheEntry {
  properties?: unknown;
  annotations?: unknown;
  thumbs?: Record<string, string>;
}

/** Разбор ответа ядра: отсутствие кэша и неожиданная форма дают `null`. */
function normalizeEntry(value: unknown): CacheEntry | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return value as CacheEntry;
}

/** Чтение свойств книги из кэша; `null` — кэша нет или файл изменился. */
export async function loadCachedProperties(path: string): Promise<CachedProperties | null> {
  let value: unknown;
  try {
    value = await invokeCommand('reader_cache_load', { path });
  } catch {
    return null;
  }
  const entry = normalizeEntry(value);
  if (!entry) {
    return null;
  }
  const thumbs: Record<number, string> = {};
  for (const [page, dataUrl] of Object.entries(entry.thumbs ?? {})) {
    const number = Number(page);
    if (Number.isFinite(number) && number >= 1 && String(dataUrl).startsWith('data:image/')) {
      thumbs[number] = String(dataUrl);
    }
  }
  const properties = (entry.properties ?? {}) as Record<string, unknown>;
  const pageCount = Number(properties.pageCount);
  const annotations = Array.isArray((entry.annotations as Record<string, unknown> | undefined)?.annotations)
    ? ((entry.annotations as { annotations: unknown[] }).annotations as FileAnnotation[])
    : [];
  return {
    bookmarks: properties.bookmarks ?? [],
    pageCount: Number.isFinite(pageCount) && pageCount > 0 ? Math.trunc(pageCount) : null,
    thumbs,
    annotations,
  };
}

/** Сохранение порции свойств книги.
 *
 * Заданные поля перекрывают прежние; превью кладутся постранично. Ошибка записи
 * не мешает чтению: кэш — ускорение, а не источник истины.
 */
export async function saveCachedProperties(
  path: string,
  patch: {
    /** Непрозрачные свойства плагина (закладки, число страниц). */
    properties?: unknown;
    /** Непрозрачный результат разбора пометок. */
    annotations?: unknown;
    /** Превью страниц. */
    thumbs?: WorkplaceThumbnail[];
  },
): Promise<void> {
  const payload: Record<string, unknown> = { path };
  if (patch.properties !== undefined) {
    payload.properties = patch.properties;
  }
  if (patch.annotations !== undefined) {
    payload.annotations = patch.annotations;
  }
  if (patch.thumbs !== undefined && patch.thumbs.length > 0) {
    payload.thumbs = patch.thumbs.map((thumb) => ({
      page: thumb.page,
      dataUrl: thumb.dataUrl,
      width: thumb.width,
      height: thumb.height,
    }));
  }
  try {
    await invokeCommand('reader_cache_save', payload);
  } catch {
    // Кэш не сохранился — свойства будут добыты заново при следующем открытии.
  }
}

/** Удаление кэша книги (после переуказания файла). */
export async function forgetCachedProperties(path: string): Promise<void> {
  try {
    await invokeCommand('reader_cache_forget', { path });
  } catch {
    // Ошибка удаления не мешает чтению: устаревшая запись отсеется по свежести.
  }
}

/** Удаление кэша превью книги.
 *
 * Превью могут быть сняты по прежним правилам (например, до исправления
 * разрешения): перегенерация начинается с удаления записи, иначе картинки
 * вернулись бы из кэша прежними.
 */
export async function forgetThumbsCache(path: string): Promise<void> {
  try {
    await invokeCommand('reader_cache_forget', { path });
  } catch {
    // Ошибка удаления не мешает перерисовке: новые превью перезапишут запись.
  }
}
