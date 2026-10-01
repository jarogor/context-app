/** Сборка документа модуля рисования плагина рабочего места для песочницы.
 *
 * Модуль состоит из точки входа (HTML) и вспомогательных файлов (движок,
 * worker, ресурсы). Модуль не имеет доступа к сети и файловой системе, поэтому
 * байты вспомогательных файлов внедряются в документ, а адреса (blob) создаёт
 * сама песочница: blob, созданный родительским документом, в песочнице с
 * `allow-scripts` не загружается.
 *
 * Модуль получает вспомогательные файлы функциями `textureViewerFile(path)` и
 * `textureViewerFiles()`; прелюдия выполняется до собственных скриптов модуля.
 */

import type { ViewerFileContent } from './reader';

/** Функция модуля для чтения файла по относительному пути. */
export const VIEWER_FILE_GLOBAL = 'textureViewerFile';
/** Функция модуля для списка всех файлов. */
export const VIEWER_FILES_GLOBAL = 'textureViewerFiles';
/** Функция модуля для blob-адреса файла (движок, worker, ресурсы). */
export const VIEWER_URL_GLOBAL = 'textureViewerUrl';

/** Безопасная замена последовательностей, закрывающих script-блок. */
function escapeInline(value: string): string {
  return value.replace(/<\/(script)/gi, '<\\/$1');
}

/** Сборка прелюдии с байтами файлов модуля. */
function prelude(files: ViewerFileContent[]): string {
  const payload = JSON.stringify(
    files.map((file) => ({ path: file.path, data: file.base64, mime: file.mime })),
  );
  return `(function () {
    var assets = ${payload};
    function decode(value) {
      var binary = atob(value);
      var bytes = new Uint8Array(binary.length);
      for (var index = 0; index < binary.length; index += 1) { bytes[index] = binary.charCodeAt(index); }
      return bytes;
    }
    window.${VIEWER_FILES_GLOBAL} = function () {
      return assets.map(function (asset) { return { path: asset.path, mime: asset.mime }; });
    };
    window.${VIEWER_FILE_GLOBAL} = function (path) {
      var key = String(path).replace(/^\\.\\//, '');
      for (var index = 0; index < assets.length; index += 1) {
        if (assets[index].path === key) { return decode(assets[index].data); }
      }
      return null;
    };
    var urls = Object.create(null);
    window.${VIEWER_URL_GLOBAL} = function (path) {
      var key = String(path).replace(/^\\.\\//, '');
      if (key in urls) { return urls[key]; }
      for (var index = 0; index < assets.length; index += 1) {
        if (assets[index].path !== key) { continue; }
        var type = assets[index].mime || 'application/octet-stream';
        urls[key] = URL.createObjectURL(new Blob([decode(assets[index].data)], { type: type }));
        return urls[key];
      }
      return null;
    };
  })();`;
}

/** Сборка документа точки входа для песочницы.
 *
 * Прелюдия с файлами внедряется в начало документа, чтобы она выполнилась до
 * собственных скриптов модуля. Точка входа возвращается без изменений, если
 * вспомогательных файлов нет.
 */
export function buildViewerDocument(entry: string, files: ViewerFileContent[]): string {
  if (files.length === 0) {
    return entry;
  }
  const script = `<script data-texture-viewer="1">${escapeInline(prelude(files))}</script>`;
  const head = /<head(\s[^>]*)?>/i.exec(entry);
  if (head) {
    const at = head.index + head[0].length;
    return `${entry.slice(0, at)}${script}${entry.slice(at)}`;
  }
  const body = /<body(\s[^>]*)?>/i.exec(entry);
  if (body) {
    const at = body.index + body[0].length;
    return `${entry.slice(0, at)}${script}${entry.slice(at)}`;
  }
  return `${script}${entry}`;
}
