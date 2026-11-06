<script lang="ts">
  import { t } from '@context/i18n';
  import {
    EmptyState,
    EntityList,
    ErrorState,
    Icon,
    Input,
    PageShell,
    Skeleton,
    type MenuAction,
    type MetaItem,
  } from '@context/ui';
  import { formatDateTime } from '../../shared/format';
  import NoteEntry from '../notes/NoteEntry.svelte';
  import type { NoteSet, Note } from '../notes/notes';
  import { librarySets, noteCountLabel } from './notes-library';
  import { DEFAULT_PALETTE, DEFAULT_READER_THEME, type PaletteId, type ReaderThemeId } from '@context/ui';

  /** Реестр наборов заметок всех книг.
   *
   * Область презентационна: получает агрегат наборов и отдаёт интенты
   * перехода. **Заметки — первичны, книга — подпись:** акцент на наборе, книга —
   * компактный контекст рядом. Наборы свёрнуты и раскрываются кликом.
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

  /** Общее число заметок в реестре. */
  const totalNotes = $derived(sets.reduce((sum, set) => sum + set.notes.length, 0));

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
  const setActions: MenuAction[] = $derived([
    { id: 'open', label: t('app.notes.library.openBook') },
  ]);

  /** Метаинформация набора: дата (изменения, иначе создания) и книга-подпись. */
  function metaItems(set: (typeof view)[number]): MetaItem[] {
    const changed = formatDateTime(set.updatedAtMillis);
    const created = formatDateTime(set.createdAtMillis);
    const items: MetaItem[] = [];
    if (changed) {
      items.push({
        icon: 'calendar',
        value: changed,
        title: t('app.notes.library.changed', { date: changed }),
      });
    } else if (created) {
      items.push({
        icon: 'calendar',
        value: created,
        title: t('app.notes.library.created', { date: created }),
      });
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
    <div class="p-4" data-testid="notes-library-loading">
      <Skeleton rows={4} />
    </div>
  {/snippet}

  {#snippet errorContent()}
    <div class="p-4">
      <ErrorState
        message={t('app.notes.library.loadFailed', { error })}
        testId="notes-library-error"
      />
    </div>
  {/snippet}

  {#snippet emptyContent()}
    <EmptyState
      icon="note"
      title={query ? t('app.notes.library.notFound.title') : t('app.notes.library.empty.title')}
      description={query
        ? t('app.search.changeQuery')
        : t('app.notes.library.empty.description')}
      testId="notes-library-empty"
    />
  {/snippet}

  {#snippet controls()}
    <div class="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:flex-none">
      <Input
        bind:value={query}
        placeholder={t('app.search.notes.placeholder')}
        ariaLabel={t('app.search.notes.placeholder')}
        icon="search"
        clearable
        class="min-w-0 flex-1 sm:w-[24rem] sm:flex-none"
      />
      <!-- Счётчик рядом с поиском — тот же, что в списках мест и библиотек. -->
      <span
        class="flex-none role-caption text-[var(--muted-foreground)]"
        data-testid="notes-filter-counter"
      >
        {t('app.search.filter', { shown: view.length, total: sets.length })}
      </span>
    </div>
    {#if sets.length > 0}
      <!--
        Здесь только число заметок: сколько наборов, уже видно в счётчике
        рядом с поиском, и второй раз это не нужно.
      -->
      <dl class="ml-auto flex items-center gap-1.5 role-caption text-[var(--muted-foreground)]">
        <dt>{t('app.notes.library.notes')}</dt>
        <dd>{totalNotes}</dd>
      </dl>
    {/if}
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
    actionsLabel={t('app.notes.library.actionsLabel')}
    onAction={(set) => openBookOfSet(set)}
  >
    {#snippet titleContent(set)}
      <span
        class="inline-flex size-5 shrink-0 items-center justify-center rounded-[var(--radius)] border border-[var(--border)] bg-[var(--background)] text-[var(--muted-foreground)] transition-transform"
        class:border-[var(--primary-border)]={isExpanded(set.id)}
        class:text-[var(--primary)]={isExpanded(set.id)}
        class:rotate-90={isExpanded(set.id)}
      >
        <Icon name="chevron-right" class="h-3.5 w-3.5" />
      </span>
      <span class="min-w-0 flex-1 truncate role-title" data-testid="notes-library-set-name">
        {set.name}
      </span>
    {/snippet}

    {#snippet trailing(set)}
      <span class="role-caption text-[var(--muted-foreground)]" data-testid="notes-library-count">
        {noteCountLabel(set.noteItems.length)}
      </span>
    {/snippet}

    {#snippet body(set)}
      {#if isExpanded(set.id)}
        {#if set.noteItems.length === 0}
          <p class="px-3 role-body text-[var(--muted-foreground)]" data-testid="notes-library-set-empty">
            {t('app.notes.library.noNotesInSet')}
          </p>
        {:else}
          <div
            class="border-t border-[var(--divider)] bg-[var(--surface-inset)] p-2 pl-4"
            data-testid="notes-library-notes"
          >
            <ul class="m-0 flex list-none flex-col gap-1 p-0">
              {#each set.noteItems as item (item.note.id)}
                <NoteEntry {item} {readerTheme} {palette} onclick={(note) => openNoteOfSet(set, note)} />
              {/each}
            </ul>
          </div>
        {/if}
      {/if}
    {/snippet}
  </EntityList>
</PageShell>
