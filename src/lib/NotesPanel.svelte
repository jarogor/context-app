<script lang="ts">
  import { Button, Input } from '@texture/ui';
  import type { Note, NoteListItem } from './notes';

  interface Props {
    /** Элементы списка заметок-цитат. */
    items: NoteListItem[];
    /** Загружаются ли заметки книги. */
    loading?: boolean;
    /** Есть ли активная книга. */
    hasBook?: boolean;
    /** Переход к заметке в тексте книги. */
    onGoToNote?: (note: Note) => void;
    /** Идентификатор выбранной заметки для подсветки в списке. */
    selectedId?: string | null;
    /** Удаление заметки. */
    onDeleteNote?: (noteId: string) => void;
  }

  let {
    items,
    loading = false,
    hasBook = true,
    onGoToNote,
    selectedId = null,
    onDeleteNote,
  }: Props = $props();

  /** Запрос поиска по цитатам. */
  let query = $state('');

  /** Элементы с учётом поиска. */
  const visible = $derived.by(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return items;
    }
    return items.filter((item) => item.name.toLowerCase().includes(needle));
  });

  /** Формат даты создания заметки. */
  function formatDate(millis: number): string {
    if (!millis) {
      return '';
    }
    return new Date(millis).toLocaleString(undefined, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }
</script>

<aside
  class="flex w-[340px] flex-none flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)]"
  data-testid="notes-panel"
>
  <div
    class="flex flex-[0_0_42px] items-center gap-[var(--space-2)] border-b border-[var(--color-border)] px-[var(--space-3)] text-[13px] font-semibold"
  >
    Заметки
    {#if items.length > 0}
      <span class="font-normal text-[var(--color-text-muted)]">· {items.length}</span>
    {/if}
  </div>

  {#if !hasBook}
    <div
      class="p-[var(--space-4)] text-[13px] text-[var(--color-text-muted)]"
      data-testid="notes-panel-empty"
    >
      Откройте книгу, чтобы вести заметки.
    </div>
  {:else}
    <div class="border-b border-[var(--color-border)] p-[var(--space-2)]">
      <Input bind:value={query} placeholder="Поиск по цитатам" />
    </div>

    {#if loading && items.length === 0}
      <p class="p-[var(--space-3)] text-[13px] text-[var(--color-text-muted)]">Загрузка…</p>
    {:else}
      <ul
        class="m-0 flex list-none flex-col gap-[var(--space-2)] overflow-y-auto p-[var(--space-2)]"
        data-testid="notes-list"
      >
        {#each visible as item (item.note.id)}
          <li
            class="rounded-[var(--radius-md)] border border-[var(--color-border)] p-[var(--space-2)] transition-colors {selectedId ===
            item.note.id
              ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
              : ''}"
            data-testid="notes-item"
            data-selected={selectedId === item.note.id ? 'true' : 'false'}
          >
            <button
              type="button"
              class="block w-full cursor-pointer text-left [font:inherit]"
              data-testid="notes-item-link"
              onclick={() => onGoToNote?.(item.note)}
            >
              <span class="block text-[13px] leading-snug">{item.name}</span>
            </button>
            <div
              class="mt-[var(--space-1)] flex items-center gap-[var(--space-2)] text-[11px] text-[var(--color-text-muted)]"
            >
              {#if item.place}
                <span data-testid="notes-item-place">{item.place}</span>
              {/if}
              <span>{formatDate(item.createdAtMillis)}</span>
            </div>
            <div class="mt-[var(--space-2)]">
              <Button
                variant="ghost"
                size="sm"
                title="Удалить заметку"
                onclick={() => onDeleteNote?.(item.note.id)}>Удалить</Button
              >
            </div>
          </li>
        {:else}
          <li
            class="px-[var(--space-2)] py-[var(--space-3)] text-center text-[13px] text-[var(--color-text-muted)]"
            data-testid="notes-list-empty"
          >
            {query
              ? 'Заметок по запросу не найдено.'
              : 'Выделите фрагмент текста в книге, чтобы создать заметку.'}
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</aside>
