/** Объявления глобалов, которые кладёт прелюдия песочницы.
 *
 * Приложение внедряет в документ модуля функции доступа к файлам модуля
 * рисования: список, байты и blob-адрес.
 */
declare global {
  interface Window {
    /** Функция файла модуля по относительному пути (байты). */
    contextViewerFile: (path: string) => Uint8Array | null;
    /** Функция списка файлов модуля. */
    contextViewerFiles: () => { path: string; mime: string }[];
    /** Blob-адрес файла модуля по относительному пути. */
    contextViewerUrl: (path: string) => string | null;
  }

  /** Функция файла модуля, доступная без обращения к `window`. */
  function contextViewerFile(path: string): Uint8Array | null;
  /** Функция blob-адреса файла модуля. */
  function contextViewerUrl(path: string): string | null;
}

export {};
