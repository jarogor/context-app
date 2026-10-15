<script lang="ts">
  import {
    EntityList,
    PageShell,
    SearchCreate,
    Spinner,
    type MenuAction,
    type MetaItem,
  } from '@texture/ui';
  import { formatDateTime } from '../../shared/format';
  import NoteEntry from '../notes/NoteEntry.svelte';
  import type { NoteSet, Note } from '../notes/notes';
  import { librarySets, noteCountLabel } from './notes-library';
  import { DEFAULT_PALETTE, DEFAULT_READER_THEME, type PaletteId, type ReaderThemeId } from '@texture/ui';

  /** Реестр наборов заметок всех книг.
   *
   * Область презентационна: получает агрегат наборов и отдаёт интенты
   * перехода. **Заметки — первичны, книга — подпись:** акцент на наборе, книга —
   * компактный контекст рядом. Наборы свёрнуты и раскрываются кликом; группировка,
   * поиск и представление вынесены в `notes-library.ts`, запись заметки рисует
   * общий `NoteEntry`.
   */
  interface Props {
    /** Наборы всех книг (агрегат `list_all_sets`). */
    sets: NoteSet[];
    /** Тема области чтения: цвет меток заметок следует ей. */
    readerTheme?: ReaderThemeId;
    /** Палитра оформления: общий реестр дизайн-системы. */
    palette?: PaletteId;
    /** Загружается ли реестр. */
    loading?: boolean;
    /** Ошибка загрузки реестра, иначе пустая строка. */
    error?: string;
    /** Переход к книге набора (открыть в рабочем месте, набор — активный). */
    onOpenSet?: (set: NoteSet) => void;
    /** Переход к конкретной заметке набора. */
    onOpenNote?: (set: NoteSet, note: Note) => void;
  }

  let {
    sets,
    readerTheme = DEFAULT_READER_THEME,
    palette = DEFAULT_PALETTE,
    loading = false,
    error = '',
    onOpenSet,
    onOpenNote,
  }: Props = $props();

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

  /** Метаинформация набора: дата (изменения, иначе создания) и книга-подпись. */
  function metaItems(set: (typeof view)[number]): MetaItem[] {
    const changed = formatDateTime(set.updatedAtMillis);
    const created = formatDateTime(set.createdAtMillis);
    const items: MetaItem[] = [];
    if (changed) {
      items.push({ icon: 'calendar', value: changed, title: `Изменён ${changed}` });
    } else if (created) {
      items.push({ icon: 'calendar', value: created, title: `Создан ${created}` });
    }
    items.push({
      icon: 'book',
      value: set.bookTitle,
      title: set.bookTitle,
      testId: 'notes-library-book',
    });
    return items;
  }

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

<PageShell
  testId="notes-library"
  loading={loading && sets.length === 0}
  error={error}
  empty={view.length === 0}
>
  {#snippet loadingContent()}
    <div
      class="flex items-center gap-2 p-4 text-[0.9rem] text-[var(--muted-foreground)]"
      data-testid="notes-library-loading"
    >
      <Spinner />
      Загрузка…
    </div>
  {/snippet}

  {#snippet errorContent()}
    <p class="p-4 text-[0.9rem] text-[var(--muted-foreground)]" data-testid="notes-library-error">
      Не удалось загрузить заметки: {error}
    </p>
  {/snippet}

  {#snippet emptyContent()}
    <p class="p-4 text-[0.9rem] text-[var(--muted-foreground)]" data-testid="notes-library-empty">
      {query ? 'По запросу ничего не найдено.' : 'Заметок пока нет.'}
    </p>
  {/snippet}

  {#snippet form()}
    <SearchCreate bind:query searchPlaceholder="Поиск по заметкам" />
  {/snippet}

  <EntityList
    items={view}
    key={(set) => set.id}
    container="div"
    itemTestId="notes-library-set"
    buttonTestId="notes-library-set-toggle"
    expanded={(set) => isExpanded(set.id)}
    onSelect={(set) => toggle(set.id)}
    metaItems={metaItems}
    metaTestId="notes-library-set-meta"
    actions={() => setActions}
    actionsLabel="Действия с набором заметок"
    onAction={(set) => openBookOfSet(set)}
  >
    {#snippet titleContent(set)}
      <svg
        class="h-4 w-4 shrink-0 text-[var(--muted-foreground)] transition-transform"
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
        class="min-w-0 flex-1 truncate text-[0.95rem] font-medium"
        data-testid="notes-library-set-name"
      >
        {set.name}
      </span>
    {/snippet}

    {#snippet trailing(set)}
      <span
        class="text-[0.8rem] text-[var(--muted-foreground)]"
        data-testid="notes-library-count"
      >
        {noteCountLabel(set.noteItems.length)}
      </span>
    {/snippet}

    {#snippet body(set)}
      {#if isExpanded(set.id)}
        {#if set.noteItems.length === 0}
          <p
            class="px-3 text-[0.9rem] text-[var(--muted-foreground)]"
            data-testid="notes-library-set-empty"
          >
            В наборе нет заметок.
          </p>
        {:else}
          <ul
            class="m-0 flex list-none flex-col gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-2"
            data-testid="notes-library-notes"
          >
            {#each set.noteItems as item (item.note.id)}
              <NoteEntry {item} {readerTheme} {palette} onclick={(note) => openNoteOfSet(set, note)} />
            {/each}
          </ul>
        {/if}
      {/if}
    {/snippet}
  </EntityList>
</PageShell>
