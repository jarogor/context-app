<script lang="ts">
  import { t } from '@context/i18n';
  import { Button, Dialog, Icon, Input, Spinner } from '@context/ui';
  import type { BookChoice } from '../library/library';

  /** Набор, которому указывают книгу. */
  export interface SetBookTarget {
    /** Идентификатор набора. */
    id: string;
    /** Имя набора. */
    name: string;
    /** Число заметок в наборе. */
    noteCount: number;
    /** Подсказка о книге: название из файла набора или текущей книги. */
    bookHint: string;
  }

  interface Props {
    /** Открытость диалога. */
    open?: boolean;
    /** Набор, которому указывают книгу. */
    target: SetBookTarget | null;
    /** Книги активной библиотеки для выбора. */
    books: BookChoice[];
    /** Загружаются ли книги библиотеки. */
    loading?: boolean;
    /** Ошибка загрузки книг, иначе пустая строка. */
    error?: string;
    /** Привязать набор к книге. */
    onSelect: (book: { key: string; title: string }) => void;
    /** Указать файл книги, которой нет в библиотеке. */
    onPickFile: () => void;
    /** Закрытие диалога без привязки. */
    onClose: () => void;
    /** Обработчик изменения открытости (Esc, клик вне). */
    onOpenChange?: (open: boolean) => void;
  }

  let {
    open = false,
    target,
    books,
    loading = false,
    error = '',
    onSelect,
    onPickFile,
    onClose,
    onOpenChange,
  }: Props = $props();

  /** Запрос поиска по книгам библиотеки. */
  let query = $state('');

  /** Книги библиотеки с учётом поиска по имени файла и названию.
   *
   * Совпадения по названию книги из файла набора идут первыми: скорее всего это
   * та же книга, просто лежащая в этом хранилище по своему пути.
   */
  const filtered = $derived.by(() => {
    const needle = query.trim().toLowerCase();
    const matches = books.filter(
      (book) =>
        !needle ||
        book.name.toLowerCase().includes(needle) ||
        book.title.toLowerCase().includes(needle),
    );
    const wanted = (target?.bookHint ?? '').trim().toLowerCase();
    if (!wanted) {
      return matches;
    }
    const rank = (book: BookChoice) =>
      book.name.toLowerCase() === wanted || book.title.toLowerCase() === wanted ? 0 : 1;
    return [...matches].sort((left, right) => rank(left) - rank(right));
  });
</script>

<Dialog
  {open}
  title={t('app.notes.library.bindTitle')}
  onOpenChange={(value) => {
    if (!value) {
      query = '';
      onClose();
    }
    onOpenChange?.(value);
  }}
>
  {#if target}
    <div class="flex flex-col gap-1">
      <p class="role-body text-[var(--foreground)]" data-testid="bind-set-name">
        {t('app.notes.library.bindSetName', { name: target.name })}
      </p>
      <p class="role-caption text-[var(--muted-foreground)]" data-testid="bind-set-notes">
        {t('app.note.count', { count: target.noteCount })}
      </p>
      <p class="role-body text-[var(--muted-foreground)]" data-testid="bind-set-hint">
        {target.bookHint
          ? t('app.notes.library.bindKnownBook', { name: target.bookHint })
          : t('app.notes.library.bindKnownBookUnknown')}
      </p>
    </div>

    <Input
      bind:value={query}
      placeholder={t('app.notes.library.bindSearch')}
      ariaLabel={t('app.notes.library.bindSearch')}
      icon="search"
      clearable
    />

    {#if error}
      <p class="role-body text-[var(--destructive)]" data-testid="bind-books-error">{error}</p>
    {:else if loading}
      <p
        class="flex items-center gap-2 role-body text-[var(--muted-foreground)]"
        data-testid="bind-books-loading"
      >
        <Spinner class="h-4 w-4" />
        {t('app.loading')}
      </p>
    {:else if books.length === 0}
      <p class="role-body text-[var(--muted-foreground)]" data-testid="bind-books-empty">
        {t('app.notes.library.bindNoBooks')}
      </p>
    {:else if filtered.length === 0}
      <p class="role-body text-[var(--muted-foreground)]" data-testid="bind-books-not-found">
        {t('app.notes.library.bindNotFound')}
      </p>
    {:else}
      <ul
        class="flex max-h-[20rem] list-none flex-col gap-1.5 overflow-y-auto p-0"
        data-testid="bind-books-list"
      >
        {#each filtered as book (book.key)}
          <li>
            <button
              type="button"
              data-testid="bind-book-item"
              class="flex w-full cursor-pointer items-start gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-left role-body transition-colors [font:inherit] hover:bg-[var(--surface-hover)]"
              title={book.key}
              onclick={() => onSelect({ key: book.key, title: book.title })}
            >
              <Icon name="book" class="mt-0.5 h-4 w-4 shrink-0 text-[var(--muted-foreground)]" />
              <span class="flex min-w-0 flex-1 flex-col">
                <span class="truncate">{book.title || book.name}</span>
                <span class="truncate font-mono role-caption text-[var(--muted-foreground)]">
                  {book.name}
                </span>
              </span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}

    <div class="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border)] pt-3">
      <Button variant="ghost" size="sm" onclick={onClose}>
        {t('app.action.undo')}
      </Button>
      <Button variant="secondary" size="sm" onclick={onPickFile}>
        <Icon name="folder" />
        {t('app.notes.library.bindPickFile')}
      </Button>
    </div>
  {/if}
</Dialog>
