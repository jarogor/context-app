/** Переходы по ссылкам внутри документа книги.
 *
 * Документ книги живёт в `srcdoc`-области: адрес не задан, поэтому браузер
 * разрешает относительные ссылки от документа родителя. Клик по сноске
 * `href="#note1"` переводил область на само приложение, и вкладка книги
 * превращалась в сломанную — вернуться к чтению было нечем. Поэтому переходы
 * по ссылкам здесь разбираются вручную: внутренний якорь прокручивает книгу,
 * внешняя ссылка открывается системным приложением, а относительный путь
 * внутри книги игнорируется (содержимое уже собрано целиком).
 *
 * Модуль чист от Svelte: работает с `Document` книги.
 */

/** Вид ссылки в книге. */
export type BookLinkKind = 'anchor' | 'external' | 'ignored';

/** Разобранная ссылка книги. */
export interface BookLink {
  /** Что делать с ссылкой. */
  kind: BookLinkKind;
  /** Значение `href` как оно записано в книге. */
  href: string;
  /** Идентификатор якоря для `anchor` (без `#`). */
  anchor?: string;
}

/** Разбор ссылки книги по значению `href`. */
export function parseBookLink(href: string | null | undefined): BookLink {
  const value = (href ?? '').trim();
  if (!value) {
    return { kind: 'ignored', href: value };
  }
  // Внутренний якорь: `#id` или `файл#id` — содержимое книги уже собрано
  // целиком, поэтому файл неважен, важен только якорь.
  const hash = value.indexOf('#');
  if (hash >= 0) {
    const anchor = value.slice(hash + 1).trim();
    if (!anchor) {
      return { kind: 'ignored', href: value };
    }
    if (hash === 0 || !/^[a-z][a-z0-9+.-]*:/i.test(value)) {
      return { kind: 'anchor', href: value, anchor };
    }
    return { kind: 'ignored', href: value };
  }
  const lower = value.toLowerCase();
  // Внешние ссылки открываются системным приложением, а не внутри книги.
  if (lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('mailto:')) {
    return { kind: 'external', href: value };
  }
  // Относительный путь внутри книги (например, `chapter2.xhtml`): все главы
  // уже в документе, поэтому переходить некуда.
  return { kind: 'ignored', href: value };
}

/** Якорь назначения в документе книги по идентификатору. */
export function anchorTarget(doc: Document, anchor: string): HTMLElement | null {
  const byId = doc.getElementById(anchor);
  if (byId) {
    return byId;
  }
  // Якорь в книге часто записан без учёта регистра и с экранированием.
  for (const element of doc.querySelectorAll<HTMLElement>('[id]')) {
    if (element.id === anchor) {
      return element;
    }
  }
  return null;
}
