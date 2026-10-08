<script lang="ts">
  import { BookCoverPlaceholder, Button } from '@texture/ui';
  import type { BookWithCover } from './library';

  interface Props {
    /** Открытая книга. */
    book: BookWithCover;
    /** Имя рабочего места, в которое попадёт книга; null — место ещё не выбрано. */
    targetWorkspaceName?: string | null;
    /** Поддерживает ли книгу встроенное чтение или плагин рабочего места. */
    canRead: boolean;
    /** Идёт открытие во внешнем приложении. */
    opening: boolean;
    /** Ошибка открытия во внешнем приложении. */
    externalError: string | null;
    /** Возврат к списку книг. */
    onClose: () => void;
    /** Открытие книги вкладкой рабочего места. */
    onAdd: () => void;
    /** Открытие файла книги в системном приложении. */
    onOpenExternal: () => void;
  }

  let {
    book,
    targetWorkspaceName = null,
    canRead,
    opening,
    externalError,
    onClose,
    onAdd,
    onOpenExternal,
  }: Props = $props();
</script>

<div class="@container mx-auto max-w-[760px] p-6" data-testid="book-page">
  <Button variant="ghost" size="sm" class="mb-4" onclick={onClose}>← К списку</Button>

  <div class="flex flex-col gap-6 @min-[30rem]:flex-row">
    <div class="w-[180px] flex-none">
      {#if book.coverUri}
        <img class="aspect-[2/3] w-full rounded-md object-cover" src={book.coverUri} alt="" />
      {:else}
        <BookCoverPlaceholder />
      {/if}
    </div>

    <div class="min-w-0 flex-1">
      <h1 class="text-xl font-semibold" data-testid="book-title">{book.title}</h1>
      {#if book.authors.length > 0}
        <p class="mt-1 text-[var(--muted-foreground)]">
          {book.authors.map((author) => author.name).join(', ')}
        </p>
      {/if}

      {#if book.series.length > 0}
        <p class="mt-2 text-[13px] text-[var(--muted-foreground)]">
          Серия: {book.series.map((entry) => entry.series.name).join(', ')}
        </p>
      {/if}

      {#if book.tags.length > 0}
        <p class="mt-1 text-[13px] text-[var(--muted-foreground)]">
          Теги: {book.tags.map((tag) => tag.name).join(', ')}
        </p>
      {/if}

      <div class="mt-6 flex flex-wrap items-center gap-2">
        {#if canRead}
          <Button variant="primary" onclick={onAdd}>
            {targetWorkspaceName ? `Добавить в «${targetWorkspaceName}»` : 'Добавить в рабочее место'}
          </Button>
        {/if}
        <Button variant="secondary" disabled={opening} onclick={onOpenExternal}>
          {opening ? 'Открытие…' : 'Открыть'}
        </Button>
      </div>

      {#if externalError}
        <p class="mt-3 text-[var(--destructive)]">{externalError}</p>
      {/if}
    </div>
  </div>
</div>
