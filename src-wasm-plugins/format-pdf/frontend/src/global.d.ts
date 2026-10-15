/** Объявления глобалов, которые кладёт прелюдия песочницы.
 *
 * Приложение внедряет в документ модуля функцию `textureViewerUrl`, а
 * классический скрипт шаблона сохраняет адреса движка и воркера pdf.js в
 * глобальные поля.
 */
declare global {
  interface Window {
    /** Blob-адрес файла модуля рисования (движок pdf.js). */
    __texturePdfEngine: string;
    /** Blob-адрес воркера pdf.js. */
    __texturePdfWorker: string;
  }
}

export {};
