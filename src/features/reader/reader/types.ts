/** Глава книги для рабочей страницы чтения. */
export interface BookChapter {
  /** Заголовок главы, если найден. */
  title?: string | null;
  /** Внутренний HTML главы с изображениями в data-URI. */
  html: string;
}

/** Содержимое книги, не зависящее от конкретного формата. */
export interface BookContent {
  /** Название книги. */
  title: string;
  /** Авторы книги. */
  authors: string[];
  /** Упорядоченные главы книги. */
  chapters: BookChapter[];
}
