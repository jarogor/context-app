<script lang="ts">
  import { ActionMenu, Input, Spinner, type MenuAction } from '@texture/ui';
  import NoteEntry from '../notes/NoteEntry.svelte';
  import type { AggregateNoteSet, Note } from '../notes/notes';
  import { librarySets, noteCountLabel } from './notes-library';

  /** Реестр наборов заметок по всем книгам.
   *
   * Поверхность презентационна: получает агрегат наборов и отдаёт интенты
   * перехода. **Заметки — первичны, книга — подпись:** основной акцент на наборе,
   * а книга показана компактным контекстом рядом. Заметки набора **свёрнуты**:
   * список раскрывается кликом по набору, поэтому реестр читается как список
   * наборов, а содержимое показывается по требованию. Группировка, поиск и
   * представление заметок вынесены в `notes-library.ts` и общий клиент заметок;
   * запись заметки рисует общий `NoteEntry`, а не собственную копию.
   */
  interface Props {
    /** Наборы всех книг (агрегат `list_all_sets`). */
    sets: AggregateNoteSet[];
    /** Загружается ли реестр. */
    loading?: boolean;
    /** Ошибка загрузки реестра, иначе пустая строка. */
    error?: string;
    /** Переход к книге набора (открыть в рабочем месте, набор — активный). */
    onOpenSet?: (set: AggregateNoteSet) => void;
    /** Переход к конкретной заметке набора. */
    onOpenNote?: (set: AggregateNoteSet, note: Note) => void;
  }

  let { sets, loading = false, error = '', onOpenSet, onOpenNote }: Props = $props();

  /** Запрос поиска по реестру. */
  let query = $state('');

  /** Идентификаторы раскрытых наборов. */
  let expandedIds = $state<string[]>([]);

  /** Наборы реестра с учётом поиска. */
  const view = $derived(librarySets(sets, query));

  /** При непустом поиске наборы раскрываются, чтобы были видны найденные заметки. */
  const searching = $derived(query.trim().length > 0);

  /** Раскрыт ли набор: раскрытые пользователем или поиск по содержимому. */
  function isExpanded(id: string): boolean {
    return searching || expandedIds.includes(id);
  }

  /** Переключение раскрытия набора. */
  function toggle(id: string) {
    expandedIds = expandedIds.includes(id)
      ? expandedIds.filter((candidate) => candidate !== id)
      : [...expandedIds, id];
  }

  /** Пункты меню набора в реестре. */
  const setActions: MenuAction[] = [{ id: 'open', label: 'Открыть книгу' }];

  /** Переход к книге набора из свёрнутого списка заметок. */
  function openBookOfSet(set: (typeof view)[number]) {
    const raw = sets.find((candidate) => candidate.id === set.id);
    if (raw) {
      onOpenSet?.(raw);
    }
  }

  /** Переход к заметке набора. */
  function openNoteOfSet(set: (typeof view)[number], note: Note) {
    const raw = sets.find((candidate) => candidate.id === set.id);
    if (raw) {
      onOpenNote?.(raw, note);
    }
  }
</script>

<div class="flex h-full w-full min-h-0 flex-col overflow-y-auto" data-testid="notes-library">
  <div class="mx-auto flex w-full max-w-4xl flex-col gap-3 p-4">
    <Input bind:value={query} placeholder="Поиск по заметкам" ariaLabel="Поиск по заметкам" />

    {#if loading && sets.length === 0}
      <div
        class="flex items-center gap-2 p-4 text-[13px] text-[var(--muted-foreground)]"
        data-testid="notes-library-loading"
      >
        <Spinner />
        Загрузка…
      </div>
    {:else if error}
      <p class="p-4 text-[13px] text-[var(--muted-foreground)]" data-testid="notes-library-error">
        Не удалось загрузить заметки: {error}
      </p>
    {:else if view.length === 0}
      <p class="p-4 text-[13px] text-[var(--muted-foreground)]" data-testid="notes-library-empty">
        {query ? 'По запросу ничего не найдено.' : 'Заметок пока нет.'}
      </p>
    {:else}
      {#each view as set (set.id)}
        <section
          class="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)]"
          data-testid="notes-library-set"
          data-set-id={set.id}
          data-book-key={set.bookKey}
        >
          <div class="flex items-center gap-1 pr-2">
            <button
              type="button"
              class="group flex min-w-0 flex-1 cursor-pointer items-center gap-2 px-3 py-2 text-left [font:inherit] hover:bg-[var(--muted)]"
              data-testid="notes-library-set-toggle"
              aria-expanded={isExpanded(set.id)}
              onclick={() => toggle(set.id)}
            >
              <svg
                class="h-4 w-4 shrink-0 text-[var(--muted-foreground)] transition-transform group-hover:text-[var(--foreground)]"
                class:rotate-90={isExpanded(set.id)}
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M6 4l4 4-4 4"
                  stroke="currentColor"
                  stroke-width="1.6"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
              <span
                class="min-w-0 truncate text-[14px] font-semibold transition-colors group-hover:text-[var(--primary)]"
                data-testid="notes-library-set-name"
              >
                {set.name}
              </span>
              <!-- Книга — подпись-контекст, задаёт принадлежность набора, а не акцент. -->
              <span
                class="min-w-0 truncate text-[12px] text-[var(--muted-foreground)]"
                data-testid="notes-library-book"
                title={set.bookTitle}
              >
                {set.bookTitle}
              </span>
              <span
                class="ml-auto whitespace-nowrap text-[12px] text-[var(--muted-foreground)]"
              >
                {noteCountLabel(set.noteItems.length)}
              </span>
            </button>
            <ActionMenu
              ariaLabel="Действия с набором заметок"
              title="Действия"
              class="h-7 w-7"
              items={setActions}
              onselect={() => openBookOfSet(set)}
            />
          </div>

          {#if isExpanded(set.id)}
            {#if set.noteItems.length === 0}
              <p
                class="px-3 py-3 text-[13px] text-[var(--muted-foreground)]"
                data-testid="notes-library-set-empty"
              >
                В наборе нет заметок.
              </p>
            {:else}
              <ul
                class="m-0 flex list-none flex-col gap-2 border-t border-[var(--border)] p-2"
                data-testid="notes-library-notes"
              >
                {#each set.noteItems as item (item.note.id)}
                  <NoteEntry {item} onclick={(note) => openNoteOfSet(set, note)} />
                {/each}
              </ul>
            {/if}
          {/if}
        </section>
      {/each}
    {/if}
  </div>
</div>
