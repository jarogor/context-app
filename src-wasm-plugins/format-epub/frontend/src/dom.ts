/** Общие имена и элементы разметки модуля рисования.
 *
 * Классы и идентификаторы совпадают с оформлением (`style.css`): по ним
 * строятся и находятся наложения, подсветки и слои.
 */

/** Элемент области прокрутки книги. */
export const viewer = document.getElementById('viewer') as HTMLElement;
/** Контейнер глав книги. */
export const chaptersEl = document.getElementById('chapters') as HTMLElement;
/** Сообщение о состоянии загрузки книги. */
export const status = document.getElementById('status') as HTMLElement;

/** Корень прокрутки документа книги. */
export function scrollRoot(): HTMLElement {
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

/** Доля прочитанного по положению прокрутки. */
export function scrollProgress(): number {
  const root = scrollRoot();
  const max = root.scrollHeight - root.clientHeight;
  return max > 0 ? Math.max(0, Math.min(100, (root.scrollTop / max) * 100)) : 0;
}

/** Ближайший элемент узла (сам узел или его родитель). */
export function elementOf(node: Node | null): Element | null {
  if (!node) {
    return null;
  }
  return node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
}
