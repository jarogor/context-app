/** Ленивая загрузка движка djvu-rs.
 *
 * Байты WASM-модуля приложение передаёт как файл модуля рисования; вариант
 * (SIMD или обычный) выбирается по возможностям движка. Сеть и относительные
 * адреса в песочнице недоступны, поэтому `init` получает байты напрямую.
 *
 * Модуль движка берётся целиком (`import * as`): его экспорты появляются только
 * после `init`, а обращение по имени к живому пространству имён читает их в
 * момент вызова. Инициализация сериализуется собственным обещанием: повторный
 * `init` от пакета вернулся бы раньше, чем он выставит экспорты, и открытие
 * следующей книги упало бы на неопределённом конструкторе.
 */
import * as djvu from 'djvu-rs';
import type { WasmDocument, WasmPage, WasmPixmap, WasmRenderRequest } from 'djvu-rs';

import { normalizeSharedDictionaries } from './djvm';

/** Документ DjVu текущей книги. */
export type DjVuDocument = WasmDocument;

/** Страница документа DjVu. */
export type DjVuPage = WasmPage;

/** Пиксмап отрисовки без копирования из памяти WASM. */
export type DjVuPixmap = WasmPixmap;

/** Запрос отрисовки страницы: DPI, окно и качество. */
export type DjVuRenderRequest = WasmRenderRequest;

/** Загруженный модуль движка (после успешного `init`). */
export type DjVuModule = typeof djvu;

/** Обещание инициализации движка (одно на документ модуля рисования). */
let engine: Promise<DjVuModule> | null = null;

/** Загрузка движка djvu-rs; повторный вызов возвращает то же обещание.
 *
 * Неудачная инициализация не запоминается: следующее открытие книги повторит
 * попытку. Иначе одна осечка (например, модуль файла ещё не пришёл) навсегда
 * ломала бы чтение в этом окне.
 */
export function loadEngine(): Promise<DjVuModule> {
  if (!engine) {
    engine = (async () => {
      const fileName = djvu.wasmSimd128Supported() ? 'djvu_simd128.wasm' : 'djvu_scalar.wasm';
      const bytes = textureViewerFile(fileName);
      if (!bytes) {
        throw new Error('не найден модуль движка DjVu: ' + fileName);
      }
      await djvu.default(bytes);
      return djvu;
    })().catch((error) => {
      engine = null;
      throw error;
    });
  }
  return engine;
}

/** Открытие документа по байтам книги.
 *
 * Перед разбором общий символьный словарь составного DjVu встраивается в сами
 * страницы: движок сопоставляет включение `INCL` с компонентом каталога по
 * имени и принимает только имена в UTF-8, а во встречающихся на практике
 * составных книгах имена записаны в однобайтовой кодировке. Без словаря
 * страница рисуется пустой.
 */
export function openDocument(module: DjVuModule, bytes: Uint8Array): DjVuDocument {
  return module.WasmDocument.from_bytes(normalizeSharedDictionaries(bytes));
}

/** Создание запроса отрисовки для страницы. */
export function renderRequest(module: DjVuModule, dpi: number): DjVuRenderRequest {
  return new module.WasmRenderRequest(dpi);
}

/** Создание пустого пиксмапа. */
export function newPixmap(module: DjVuModule): DjVuPixmap {
  return new module.WasmPixmap();
}
