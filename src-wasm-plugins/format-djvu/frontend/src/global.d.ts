/** Объявления глобалов, которые кладёт прелюдия песочницы.
 *
 * Приложение внедряет в документ модуля функции доступа к файлам модуля
 * рисования: список, байты и blob-адрес.
 */
declare global {
  interface Window {
    /** Функция файла модуля по относительному пути (байты). */
    textureViewerFile: (path: string) => Uint8Array | null;
    /** Функция списка файлов модуля. */
    textureViewerFiles: () => { path: string; mime: string }[];
    /** Blob-адрес файла модуля по относительному пути. */
    textureViewerUrl: (path: string) => string | null;
  }

  /** Функция файла модуля, доступная без обращения к `window`. */
  function textureViewerFile(path: string): Uint8Array | null;
  /** Функция blob-адреса файла модуля. */
  function textureViewerUrl(path: string): string | null;
}

export {};
