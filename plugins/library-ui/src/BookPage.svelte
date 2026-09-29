<script lang="ts">
  import { onMount } from 'svelte';
  import { BookCoverPlaceholder, Button } from '@texture/ui';
  import { invoke, openInWorkplace, operation } from './bridge';
  import type { Book } from './types';

  interface Props {
    /** Книга, для которой показана страница. */
    book: Book & { coverUri?: string };
    /** Возврат к списку книг. */
    onBack: () => void;
  }

  let { book, onBack }: Props = $props();

  /** Ошибка открытия во внешнем приложении. */
  let error: string | null = $state(null);
  /** Идёт открытие во внешнем приложении. */
  let opening: boolean = $state(false);
  /** Форматы, поддерживаемые встроенным чтением. */
  let supported: string[] = $state(['epub']);

  /** Формат файла содержимого книги. */
  function bookFormat(): string {
    return book.files.find((file) => file.kind === 'book')?.format?.toLowerCase() ?? '';
  }

  /** Поддерживает ли книгу встроенное чтение. */
  function canRead(): boolean {
    return supported.includes(bookFormat());
  }

  /** Открытие книги вкладкой рабочего места. */
  function startReading() {
    openInWorkplace({ bookId: String(book.id), title: book.title, format: bookFormat() });
  }

  /** Открытие файла книги в системном приложении. */
  async function openInSystem() {
    error = null;
    opening = true;
    try {
      await operation('open_external', { book_id: book.id });
    } catch (e) {
      error = String(e);
    } finally {
      opening = false;
    }
  }

  onMount(() => {
    void (async () => {
      try {
        const formats = await invoke<string[]>('workplace_formats');
        const values = new Set(['epub', ...(formats ?? []).map((value) => value.toLowerCase())]);
        supported = [...values];
      } catch {
        supported = ['epub'];
      }
    })();
  });
</script>

<div class="mx-auto max-w-[760px] p-[var(--space-5)]" data-testid="book-page">
  <Button variant="ghost" size="sm" class="mb-[var(--space-4)]" onclick={onBack}>
    ← К списку
  </Button>

  <div class="flex flex-col gap-[var(--space-5)] sm:flex-row">
    <div class="w-[180px] flex-none">
      {#if book.coverUri}
        <img
          class="aspect-[2/3] w-full rounded-[var(--radius-md)] object-cover"
          src={book.coverUri}
          alt=""
        />
      {:else}
        <BookCoverPlaceholder />
      {/if}
    </div>

    <div class="min-w-0 flex-1">
      <h1 class="text-xl font-semibold" data-testid="book-title">{book.title}</h1>
      {#if book.authors.length > 0}
        <p class="mt-[var(--space-1)] text-[var(--color-text-muted)]">
          {book.authors.map((author) => author.name).join(', ')}
        </p>
      {/if}

      {#if book.series.length > 0}
        <p class="mt-[var(--space-2)] text-[13px] text-[var(--color-text-muted)]">
          Серия: {book.series.map((entry) => entry.series.name).join(', ')}
        </p>
      {/if}

      {#if book.tags.length > 0}
        <p class="mt-[var(--space-1)] text-[13px] text-[var(--color-text-muted)]">
          Теги: {book.tags.map((tag) => tag.name).join(', ')}
        </p>
      {/if}

      <div class="mt-[var(--space-5)] flex flex-wrap items-center gap-[var(--space-2)]">
        {#if canRead()}
          <Button variant="primary" onclick={startReading}>Открыть в рабочем месте</Button>
        {/if}
        <Button variant="secondary" disabled={opening} onclick={openInSystem}>
          {opening ? 'Открытие…' : 'Открыть в системе'}
        </Button>
      </div>

      {#if error}
        <p class="mt-[var(--space-3)] text-[var(--color-danger)]">{error}</p>
      {/if}
    </div>
  </div>
</div>
