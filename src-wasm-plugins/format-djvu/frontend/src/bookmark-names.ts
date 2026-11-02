/** Разрешение ссылок оглавления DjVu в номера страниц.
 *
 * Пункт оглавления ссылается либо на номер страницы (`#page=25`, `#25`), либо на
 * имя файла страницы составной книги (`#p0002.djvu`). Номер по имени находится
 * по списку имён компонентов-страниц: имя страницы — её место в этом списке.
 */
import type { ViewerBookmark } from './types';

/** Разрешение ссылок-имён в номера страниц.
 *
 * @param bookmarks Дерево закладок, прочитанное из `NAVM`.
 * @param names Имена компонентов-страниц в порядке каталога.
 */
export function resolveBookmarkNames(
  bookmarks: ViewerBookmark[],
  names: string[],
): ViewerBookmark[] {
  const pages = new Map<string, number>();
  for (let index = 0; index < names.length; index += 1) {
    const name = names[index].trim();
    if (!name) {
      continue;
    }
    const page = index + 1;
    pages.set(name, page);
    const base = name.replace(/^.*\//, '');
    if (!pages.has(base)) {
      pages.set(base, page);
    }
  }

  /** Разрешение одного узла с его детьми. */
  function node(source: ViewerBookmark): ViewerBookmark {
    const key = (source.name ?? '').trim();
    const resolved = key
      ? (pages.get(key) ?? pages.get(key.replace(/^.*\//, '')))
      : undefined;
    return {
      title: source.title,
      page: source.page ?? resolved ?? null,
      name: null,
      children: source.children.map(node),
    };
  }

  return bookmarks.map(node);
}
