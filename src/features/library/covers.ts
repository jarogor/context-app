/** Обложки книг рабочего места: память оболочки поверх дискового кэша ядра.
 *
 * Обложка извлекается ядром из файла книги и кэшируется на диске, поэтому
 * запрос обложек дешёв и повторяется только для новых книг. Модуль держит
 * результат в памяти: к моменту первого рендера список рабочих мест уже знает
 * обложки, и они не «дорисовываются» по одной.
 */

import { invokeCommand } from '../../shared/app-bridge';
import { coverDataUri } from './library';

/** Обложка книги на пути: data URI либо `null`, если обложки нет. */
export type CoverMap = Record<string, string | null>;

/** Обложки книг в памяти: путь — data URI или `null`. */
const covers = new Map<string, string | null>();

/** Ответ ядра по пути. */
interface CoverResponse {
  /** Обложка в base64 без префикса. */
  data?: string | null;
  /** Формат изображения. */
  format?: string;
}

/** Известные обложки путей, без обращения к ядру. */
export function cachedCovers(paths: readonly string[]): CoverMap {
  const result: CoverMap = {};
  for (const path of paths) {
    if (covers.has(path)) {
      result[path] = covers.get(path) ?? null;
    }
  }
  return result;
}

/** Признак того, что обложка пути уже известна. */
export function hasCover(path: string): boolean {
  return covers.has(path);
}

/** Загрузка обложек путей одним вызовом ядра.
 *
 * Уже известные пути не перезапрашиваются: ответ по ним берётся из памяти.
 * Пустой список не делает вызова. Ошибка ядра не прерывает работу — обложки
 * просто остаются неизвестными.
 */
export async function loadCovers(paths: readonly string[]): Promise<void> {
  const missing = paths.filter((path) => path && !covers.has(path));
  if (missing.length === 0) {
    return;
  }
  let response: Record<string, CoverResponse> | null = null;
  try {
    response = (await invokeCommand('workspace_covers', {
      paths: missing,
    })) as Record<string, CoverResponse> | null;
  } catch {
    return;
  }
  if (!response) {
    return;
  }
  for (const [path, value] of Object.entries(response)) {
    covers.set(path, coverDataUri(value ?? {}));
  }
}
