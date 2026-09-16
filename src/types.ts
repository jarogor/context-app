//! Типы данных, соответствующие сущностям бэкенда.

/** Автор книги. */
export interface Author {
    id: number;
    name: string;
}

/** Серия книг. */
export interface Series {
    id: number;
    name: string;
}

/** Принадлежность книги серии. */
export interface SeriesLink {
    series: Series;
    series_index: number;
}

/** Тег книги. */
export interface Tag {
    id: number;
    name: string;
}

/** Файл книги: содержимое или обложка. */
export interface BookFile {
    id: number;
    book_id: number;
    kind: 'book' | 'cover';
    path: string;
    format: string;
}

/** Полная модель книги со связями. */
export interface Book {
    id: number;
    uuid: string;
    title: string;
    created_at: string;
    updated_at: string;
    authors: Author[];
    series: SeriesLink[];
    tags: Tag[];
    files: BookFile[];
}

/** Режим открытой библиотеки. */
export interface LibraryInfo {
    kind: 'portable' | 'calibre';
}
