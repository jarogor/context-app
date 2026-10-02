<script lang="ts">
  import { Button, Input, Select } from '@texture/ui';
  import type { Note, NoteListItem, NoteSetSummary } from './notes';

  interface Props {
    /** Элементы списка заметок-цитат активного набора. */
    items: NoteListItem[];
    /** Наборы заметок книги. */
    sets: NoteSetSummary[];
    /** Идентификатор активного набора книги. */
    activeSetId: string | null;
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
    /** Выбор активного набора книги. */
    onSelectSet?: (setId: string) => void;
    /** Создание набора книги с указанным именем. */
    onCreateSet?: (name: string) => void;
    /** Переименование набора книги. */
    onRenameSet?: (setId: string, name: string) => void;
    /** Удаление набора книги. */
    onRemoveSet?: (setId: string) => void;
  }

  let {
    items,
    sets,
    activeSetId,
    loading = false,
    hasBook = true,
    onGoToNote,
    selectedId = null,
    onDeleteNote,
    onSelectSet,
    onCreateSet,
    onRenameSet,
    onRemoveSet,
  }: Props = $props();

  /** Запрос поиска по цитатам. */
  let query = $state('');

  /** Идёт ли ввод имени нового набора. */
  let creating = $state(false);

  /** Черновик имени нового набора. */
  let newSetName = $state('');

  /** Идёт ли переименование активного набора. */
  let renaming = $state(false);

  /** Черновик имени при переименовании. */
  let renameName = $state('');

  /** Активный набор среди наборов книги. */
  const activeSet = $derived(sets.find((set) => set.id === activeSetId) ?? null);

  /** Элементы с учётом поиска. */
  const visible = $derived.by(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return items;
    }
    return items.filter((item) => item.name.toLowerCase().includes(needle));
  });

  /** Переключение активного набора из списка. */
  function changeSet(event: Event & { currentTarget: HTMLSelectElement }) {
    const setId = event.currentTarget.value;
    if (setId && setId !== activeSetId) {
      onSelectSet?.(setId);
    }
  }

  /** Начало ввода имени нового набора. */
  function startCreate() {
    creating = true;
    renaming = false;
    newSetName = '';
  }

  /** Создание набора с непустым именем. */
  function commitCreate() {
    const name = newSetName.trim();
    if (!name) {
      return;
    }
    onCreateSet?.(name);
    creating = false;
    newSetName = '';
  }

  /** Начало переименования активного набора. */
  function startRename() {
    if (!activeSet) {
      return;
    }
    renaming = true;
    creating = false;
    renameName = activeSet.name;
  }

  /** Подтверждение переименования набора. */
  function commitRename() {
    if (!activeSet) {
      return;
    }
    const name = renameName.trim();
    if (name) {
      onRenameSet?.(activeSet.id, name);
    }
    renaming = false;
    renameName = '';
  }

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
    <div
      class="flex flex-col gap-[var(--space-2)] border-b border-[var(--color-border)] p-[var(--space-2)]"
      data-testid="notes-sets"
    >
      {#if creating}
        <label class="flex flex-col gap-[var(--space-1)]">
          <span class="text-xs text-[var(--color-text-muted)]">Имя набора</span>
          <Input
            bind:value={newSetName}
            placeholder="Новый набор"
            onkeydown={(event) => {
              if (event.key === 'Enter') {
                commitCreate();
              }
              if (event.key === 'Escape') {
                creating = false;
              }
            }}
          />
        </label>
        <div class="flex gap-[var(--space-2)]">
          <Button variant="primary" size="sm" disabled={!newSetName.trim()} onclick={commitCreate}>
            Создать
          </Button>
          <Button variant="secondary" size="sm" onclick={() => (creating = false)}>Отмена</Button>
        </div>
      {:else if renaming}
        <label class="flex flex-col gap-[var(--space-1)]">
          <span class="text-xs text-[var(--color-text-muted)]">Новое имя</span>
          <Input
            bind:value={renameName}
            placeholder="Новое имя"
            onkeydown={(event) => {
              if (event.key === 'Enter') {
                commitRename();
              }
              if (event.key === 'Escape') {
                renaming = false;
              }
            }}
          />
        </label>
        <div class="flex gap-[var(--space-2)]">
          <Button variant="primary" size="sm" disabled={!renameName.trim()} onclick={commitRename}>
            Сохранить
          </Button>
          <Button variant="secondary" size="sm" onclick={() => (renaming = false)}>Отмена</Button>
        </div>
      {:else}
        <div class="flex items-center gap-[var(--space-2)]">
          <Select
            value={activeSetId ?? ''}
            disabled={sets.length === 0}
            class="min-w-0 flex-1"
            onchange={changeSet}
          >
            {#if sets.length === 0}
              <option value="">Наборов нет</option>
            {/if}
            {#each sets as set (set.id)}
              <option value={set.id}>{set.name} ({set.noteCount})</option>
            {/each}
          </Select>
          <Button
            variant="secondary"
            size="sm"
            title="Создать набор"
            ariaLabel="Создать набор"
            onclick={startCreate}>Новый</Button
          >
        </div>
        {#if activeSet}
          <div class="flex gap-[var(--space-2)]">
            <Button
              variant="secondary"
              size="sm"
              title="Переименовать набор"
              ariaLabel="Переименовать набор"
              onclick={startRename}>Переименовать</Button
            >
            <Button
              variant="danger"
              size="sm"
              title="Удалить набор"
              ariaLabel="Удалить набор"
              onclick={() => onRemoveSet?.(activeSet.id)}>Удалить</Button
            >
          </div>
        {/if}
      {/if}
    </div>

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
