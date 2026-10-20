/** Ленивая загрузка движка djvu-rs.
 *
 * Байты WASM-модуля приложение передаёт как файл модуля рисования; вариант
 * (SIMD или обычный) выбирается по возможностям движка. Сеть и относительные
 * адреса в песочнице недоступны, поэтому `init` получает байты напрямую.
 */
import init, {
  WasmDocument,
  WasmPixmap,
  WasmRenderRequest,
  wasmSimd128Supported,
  type WasmPage,
} from 'djvu-rs';

/** Документ DjVu текущей книги. */
export type DjVuDocument = WasmDocument;

/** Страница документа DjVu. */
export type DjVuPage = WasmPage;

/** Пиксмап отрисовки без копирования из памяти WASM. */
export type DjVuPixmap = WasmPixmap;

/** Запрос отрисовки страницы: DPI, окно и качество. */
export type DjVuRenderRequest = WasmRenderRequest;

/** Признак загруженного движка. */
let initialized = false;

/** Загрузка движка djvu-rs; повторный вызов ничего не делает.
 *
 * `wasmSimd128Supported` из пакета проверяет поддержку SIMD до инициализации:
 * для неё нужен соответствующий файл модуля.
 */
export async function loadEngine(): Promise<void> {
  if (initialized) {
    return;
  }
  const fileName = wasmSimd128Supported() ? 'djvu_simd128.wasm' : 'djvu_scalar.wasm';
  const bytes = textureViewerFile(fileName);
  if (!bytes) {
    throw new Error('не найден модуль движка DjVu: ' + fileName);
  }
  await init(bytes);
  initialized = true;
}

/** Открытие документа по байтам книги. */
export function openDocument(bytes: Uint8Array): DjVuDocument {
  return WasmDocument.from_bytes(bytes);
}

/** Создание запроса отрисовки для страницы. */
export function renderRequest(dpi: number): DjVuRenderRequest {
  return new WasmRenderRequest(dpi);
}

/** Создание пустого пиксмапа. */
export function newPixmap(): DjVuPixmap {
  return new WasmPixmap();
}
