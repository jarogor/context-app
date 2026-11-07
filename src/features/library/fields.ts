/** Поля сортировки и фильтрации книг библиотеки.
 *
 * Каталог полей — единственное место, где перечислено, по чему можно
 * сортировать и фильтровать: страница, панель фильтров и тесты берут набор
 * отсюда, а не повторяют список по месту.
 */

import type { MessageKey } from '@context/i18n';
import type { Book } from './library';

/** Значение поля сортировки; `null` — свойство не заполнено. */
export type SortValue = string | number | null;

/** Поле сортировки. */
export type SortField = 'title' | 'author' | 'series' | 'published' | 'added' | 'size' | 'format';

/** Направление сортировки. */
export type SortDirection = 'asc' | 'desc';

/** Описание поля сортировки. */
export interface SortFieldInfo {
  /** Машинное имя поля. */
  id: SortField;
  /** Ключ подписи в словаре. */
  labelKey: MessageKey;
  /** Направление при выборе поля. */
  defaultDirection: SortDirection;
  /** Значение книги для сравнения. */
  value: (book: Book) => SortValue;
}

/** Значение первого автора: у книги без автора свойства нет. */
function firstAuthor(book: Book): SortValue {
  return book.authors[0]?.name.trim() || null;
}

/** Имя первой серии книги. */
function firstSeries(book: Book): SortValue {
  return book.series[0]?.series.name.trim() || null;
}

/** Формат файла содержимого книги. */
export function bookFormat(book: Book): string {
  const file = book.files.find((entry) => entry.kind === 'book' && entry.format);
  return file?.format ?? '';
}

/** Поля сортировки в порядке пунктов меню. */
export const SORT_FIELDS: SortFieldInfo[] = [
  {
    id: 'title',
    labelKey: 'app.library.sort.title',
    defaultDirection: 'asc',
    value: (book) => book.title.trim() || null,
  },
  {
    id: 'author',
    labelKey: 'app.library.sort.author',
    defaultDirection: 'asc',
    value: firstAuthor,
  },
  {
    id: 'series',
    labelKey: 'app.library.sort.series',
    defaultDirection: 'asc',
    value: firstSeries,
  },
  {
    id: 'published',
    labelKey: 'app.library.sort.published',
    defaultDirection: 'desc',
    value: (book) => book.published?.trim() || null,
  },
  {
    id: 'added',
    labelKey: 'app.library.sort.added',
    defaultDirection: 'desc',
    value: (book) => book.addedAtMillis ?? null,
  },
  {
    id: 'size',
    labelKey: 'app.library.sort.size',
    defaultDirection: 'desc',
    value: (book) => book.size ?? null,
  },
  {
    id: 'format',
    labelKey: 'app.library.sort.format',
    defaultDirection: 'asc',
    value: (book) => bookFormat(book).toUpperCase() || null,
  },
];

/** Описание поля по идентификатору; неизвестное поле — по названию. */
export function sortField(id: SortField): SortFieldInfo {
  return SORT_FIELDS.find((field) => field.id === id) ?? SORT_FIELDS[0];
}

/** Признак незаполненного значения. */
function isMissing(value: SortValue): boolean {
  return value === null || value === '';
}

/** Сравнение значений: числа как числа, текст по языку интерфейса. */
function compareValues(left: SortValue, right: SortValue, locale: string): number {
  if (typeof left === 'number' && typeof right === 'number') {
    return left - right;
  }
  return String(left).localeCompare(String(right), locale);
}

/** Сортировка книг по полю и направлению.
 *
 * Незаполненное свойство всегда уходит в конец, в каком бы направлении ни
 * сортировали: иначе книги без автора или даты открывали бы список. При равных
 * значениях порядок задаёт название, поэтому страницы списка не
 * «перетасовываются» между обновлениями.
 */
export function sortBooks<T extends Book>(
  books: T[],
  field: SortField,
  direction: SortDirection,
  locale: string,
): T[] {
  const info = sortField(field);
  const factor = direction === 'asc' ? 1 : -1;
  return [...books].sort((left, right) => {
    const leftValue = info.value(left);
    const rightValue = info.value(right);
    const leftMissing = isMissing(leftValue);
    const rightMissing = isMissing(rightValue);
    if (leftMissing !== rightMissing) {
      return leftMissing ? 1 : -1;
    }
    if (leftMissing && rightMissing) {
      return left.title.localeCompare(right.title, locale);
    }
    const result = compareValues(leftValue, rightValue, locale) * factor;
    return result !== 0 ? result : left.title.localeCompare(right.title, locale);
  });
}

/** Фасет фильтрации книг. */
export type FacetId = 'authors' | 'formats' | 'languages' | 'series' | 'tags' | 'userTags';

/** Выбранные значения фасетов: внутри фасета «или», между фасетами «и». */
export interface BookFilters {
  /** Авторы. */
  authors: string[];
  /** Форматы файлов. */
  formats: string[];
  /** Языки книги. */
  languages: string[];
  /** Серии. */
  series: string[];
  /** Теги источника. */
  tags: string[];
  /** Пользовательские теги. */
  userTags: string[];
}

/** Идентификаторы фасетов в порядке панели. */
export const FACET_IDS: FacetId[] = [
  'authors',
  'formats',
  'languages',
  'series',
  'tags',
  'userTags',
];

/** Подписи фасетов. */
export const FACET_LABELS: Record<FacetId, MessageKey> = {
  authors: 'app.library.facet.authors',
  formats: 'app.library.facet.formats',
  languages: 'app.library.facet.languages',
  series: 'app.library.facet.series',
  tags: 'app.library.facet.tags',
  userTags: 'app.library.facet.userTags',
};

/** Пустой набор фильтров: показываются все книги. */
export function emptyFilters(): BookFilters {
  return { authors: [], formats: [], languages: [], series: [], tags: [], userTags: [] };
}

/** Число активных фасетов (для счётчика на кнопке фильтров). */
export function activeFilterCount(filters: BookFilters): number {
  return FACET_IDS.reduce((count, id) => count + (filters[id].length > 0 ? 1 : 0), 0);
}

/** Значения книги по фасету. */
function facetValues(book: Book, id: FacetId): string[] {
  switch (id) {
    case 'authors':
      return book.authors.map((author) => author.name.trim()).filter(Boolean);
    case 'formats':
      return book.files
        .filter((file) => file.kind === 'book')
        .map((file) => file.format.toLowerCase())
        .filter(Boolean);
    case 'languages':
      return book.language?.trim() ? [book.language.trim()] : [];
    case 'series':
      return book.series.map((entry) => entry.series.name.trim()).filter(Boolean);
    case 'tags':
      return book.tags.map((tag) => tag.name.trim()).filter(Boolean);
    case 'userTags':
      return (book.userTags ?? []).map((tag) => tag.trim()).filter(Boolean);
  }
}

/** Применение фильтров к списку книг. */
export function filterBooks<T extends Book>(books: T[], filters: BookFilters): T[] {
  return books.filter((book) =>
    FACET_IDS.every((id) => {
      const selected = filters[id];
      if (selected.length === 0) {
        return true;
      }
      const values = facetValues(book, id);
      return values.some((value) => selected.includes(value));
    }),
  );
}

/** Значение фасета: значение, подпись и число книг. */
export interface FacetValue {
  /** Машинное значение (у формата — в нижнем регистре). */
  value: string;
  /** Подпись для интерфейса. */
  label: string;
  /** Сколько книг имеют это значение. */
  count: number;
}

/** Возможные значения фасетов каталога; внутри фасета — по алфавиту. */
export function bookFacets(books: Book[], locale: string): Record<FacetId, FacetValue[]> {
  const result: Record<FacetId, FacetValue[]> = {
    authors: [],
    formats: [],
    languages: [],
    series: [],
    tags: [],
    userTags: [],
  };
  for (const id of FACET_IDS) {
    const counts = new Map<string, number>();
    for (const book of books) {
      for (const value of new Set(facetValues(book, id))) {
        counts.set(value, (counts.get(value) ?? 0) + 1);
      }
    }
    result[id] = [...counts.entries()]
      .map(([value, count]) => ({
        value,
        label: id === 'formats' ? value.toUpperCase() : value,
        count,
      }))
      .sort((left, right) => left.label.localeCompare(right.label, locale));
  }
  return result;
}

/** Новый набор фильтров с переключённым значением фасета. */
export function toggleFacet(filters: BookFilters, id: FacetId, value: string): BookFilters {
  const selected = filters[id];
  const next = selected.includes(value)
    ? selected.filter((item) => item !== value)
    : [...selected, value];
  return { ...filters, [id]: next };
}
