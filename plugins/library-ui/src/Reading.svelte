<script lang="ts">
  import { onMount } from 'svelte';
  import { Button } from '@texture/ui';
  import { invoke, operation } from './bridge';

  interface Props {
    bookId: number | string;
    onNavigate: (page: string, bookId?: number | string) => void;
  }

  interface BookContent {
    title: string;
    authors: string[];
    text: string;
  }

  let { bookId, onNavigate }: Props = $props();

  let content: BookContent | null = $state(null);
  let externalBook: { title: string; authors: { name: string }[] } | null = $state(null);
  let libraryKind: string = $state('portable');
  let loading: boolean = $state(true);
  let error: string | null = $state(null);
  let opening: boolean = $state(false);

  async function openInSystem() {
    opening = true;
    error = null;
    try {
      await operation('open_external', { book_id: bookId });
    } catch (e) {
      error = `Не удалось открыть файл: ${String(e)}`;
    } finally {
      opening = false;
    }
  }

  onMount(async () => {
    try {
      libraryKind = 'external';
      if (libraryKind === 'external') {
        const response = await operation<{ catalog?: { books?: Array<{ id: string; title: string; authors: string[] }> } }>('list');
        const book = response.catalog?.books?.find((item) => item.id === bookId);
        if (!book) {
          throw new Error('Книга не найдена');
        }
        externalBook = {
          title: book.title,
          authors: book.authors.map((name) => ({ name })),
        };
      } else {
        content = (await operation('read', { book_id: bookId })) as BookContent;
      }
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
    }
  });
</script>

<div class="mx-auto max-w-[760px] p-[var(--space-5)]">
  <Button variant="ghost" size="sm" class="mb-[var(--space-4)]" onclick={() => onNavigate('library')}>
    ← К списку
  </Button>

  {#if loading}
    <p class="text-[var(--color-text-muted)]">Загрузка...</p>
  {:else if error}
    <div>
      <p class="text-[var(--color-danger)]">Не удалось загрузить книгу: {error}</p>
      <Button variant="ghost" size="sm" onclick={() => onNavigate('library')}>
        ← Список книг
      </Button>
    </div>
  {:else if libraryKind === 'external' && externalBook}
    <header>
      <h1 class="text-xl font-semibold">{externalBook.title}</h1>
      <p class="mt-[var(--space-1)] mb-[var(--space-4)] text-[var(--color-text-muted)]">
        {externalBook.authors.map((author) => author.name).join(', ')}
      </p>
    </header>
    <Button variant="primary" disabled={opening} onclick={openInSystem}>
      {opening ? 'Открытие...' : 'Открыть в системе'}
    </Button>
  {:else if content}
    <header>
      <h1 class="text-xl font-semibold">{content.title}</h1>
      <p class="mt-[var(--space-1)] mb-[var(--space-4)] text-[var(--color-text-muted)]">
        {content.authors.join(', ')}
      </p>
    </header>
    <div class="whitespace-pre-wrap text-justify leading-normal">{content.text}</div>
  {/if}
</div>
