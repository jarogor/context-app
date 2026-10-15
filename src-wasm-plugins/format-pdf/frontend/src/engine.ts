/** Ленивая загрузка движка pdf.js и его типы.
 *
 * Движок не входит в бандл: приложение присылает его адрес (blob-URL) в
 * глобальном поле `__texturePdfEngine`, а прелюдия песочницы даёт адрес воркера.
 * Динамический импорт помечен `@vite-ignore`, чтобы сборка оставила его как
 * рантайм-загрузку, а не пыталась забандлить пакет.
 */
import type { TextLayer as TextLayerClass } from 'pdfjs-dist';

/** Тип модуля pdf.js. */
export type PdfJsModule = typeof import('pdfjs-dist');

/** Документ pdf.js. */
export type PdfDocument = import('pdfjs-dist').PDFDocumentProxy;

/** Страница pdf.js. */
export type PdfPage = import('pdfjs-dist').PDFPageProxy;

/** Вьюпорт страницы pdf.js. */
export type PdfViewport = import('pdfjs-dist').PageViewport;

/** Текстовый слой pdf.js. */
export type PdfTextLayer = TextLayerClass;

/** Тип страницы `TextContent` (для совместимости). */
export type PdfTextContent = Awaited<ReturnType<PdfPage['getTextContent']>>;

let pdfjsLib: PdfJsModule | null = null;

/** Загруженный модуль pdf.js (или null, пока он не загружен). */
export function engine(): PdfJsModule | null {
  return pdfjsLib;
}

/** Загрузка движка pdf.js; повторный вызов возвращает закэшированный модуль. */
export async function loadEngine(): Promise<PdfJsModule> {
  if (pdfjsLib) {
    return pdfjsLib;
  }
  const lib = (await import(/* @vite-ignore */ window.__texturePdfEngine)) as PdfJsModule;
  lib.GlobalWorkerOptions.workerSrc = window.__texturePdfWorker;
  pdfjsLib = lib;
  return lib;
}
