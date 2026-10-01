import { describe, expect, it } from 'vitest';
import {
  VIEWER_FILE_GLOBAL,
  VIEWER_FILES_GLOBAL,
  buildViewerDocument,
} from './viewer-bundle';
import type { ViewerFileContent } from './reader';

/** Файлы модуля для тестов. */
function files(): ViewerFileContent[] {
  return [
    { path: 'index.html', mime: 'text/html', base64: btoa('<html></html>') },
    { path: 'viewer.mjs', mime: 'text/javascript', base64: btoa('export default 1;') },
  ];
}

describe('сборка документа модуля рисования', () => {
  it('без вспомогательных файлов возвращает точку входа как есть', () => {
    const entry = '<html><body>нет файлов</body></html>';
    expect(buildViewerDocument(entry, [])).toBe(entry);
  });

  it('внедряет прелюдию до собственных скриптов модуля', () => {
    const entry = '<html><head><title>x</title></head><body><script>start()</script></body></html>';
    const document = buildViewerDocument(entry, files());
    expect(document.indexOf(VIEWER_FILE_GLOBAL)).toBeLessThan(document.indexOf('start()'));
    expect(document).toContain(VIEWER_FILES_GLOBAL);
  });

  it('экранирует закрытие script-блока в прелюдии', () => {
    const weird: ViewerFileContent[] = [
      { path: 'a.js', mime: 'text/javascript', base64: btoa('</script>alert(1)') },
    ];
    const document = buildViewerDocument('<html><body></body></html>', weird);
    expect(document).not.toContain('</script>alert(1)');
  });

  it('внедряет прелюдию в body при отсутствии head', () => {
    const document = buildViewerDocument('<html><body>текст</body></html>', files());
    expect(document.indexOf(VIEWER_FILE_GLOBAL)).toBeLessThan(document.indexOf('текст'));
  });
});
