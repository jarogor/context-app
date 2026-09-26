/** Файл книги в plugin-owned каталоге. */
export interface BookFile {
  id: number | string;
  book_id: number | string;
  kind: 'book' | 'cover';
  path: string;
  format: string;
}

/** Книга plugin-owned каталога. */
export interface Book {
  id: number | string;
  uuid: string;
  title: string;
  created_at: string;
  updated_at: string;
  authors: { id: number; name: string }[];
  series: { series: { id: number; name: string }; series_index: number }[];
  tags: { id: number; name: string }[];
  files: BookFile[];
}

/** Состояние plugin lifecycle библиотеки. */
export interface LibraryInfo {
  kind: 'portable' | 'external';
  source_name: string | null;
  indexing: boolean;
  stage: 'idle' | 'opening' | 'scanning' | 'indexing' | 'ready' | 'error';
}

/** Запись истории открытых библиотек. */
export interface HistoryEntry {
  /** Путь библиотеки. */
  path: string;
  /** Провайдер: имя source-плагина. */
  provider: string;
  /** Существует ли директория библиотеки. */
  available: boolean;
}
