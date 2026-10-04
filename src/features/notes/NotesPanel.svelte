<script lang="ts">
  import { ActionMenu, Button, Input, Select, type MenuAction, type MenuColor } from '@texture/ui';
  import { NOTE_COLORS, NOTE_COLOR_LABELS, NOTE_COLOR_SWATCHES, type Note, type NoteColor, type NoteListItem, type NoteSetSummary } from './notes';

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
    /** Смена цвета подсветки заметки. */
    onChangeColor?: (noteId: string, color: NoteColor) => void;
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
    onChangeColor,
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

  /** Варианты выпадающего списка наборов: имя и число заметок. */
  const setOptions = $derived(
    sets.map((set) => ({ value: set.id, label: `${set.name} (${set.noteCount})` })),
  );

  /** Пункты меню набора заметок. */
  const setActions = $derived<MenuAction[]>([
    { id: 'create', label: 'Новый набор' },
    { id: 'rename', label: 'Переименовать', disabled: !activeSet },
    { id: 'delete', label: 'Удалить', destructive: true, disabled: !activeSet },
  ]);

  /** Пункты меню заметки: только удаление; цвет выбирается образцами. */
  const noteActions: MenuAction[] = [{ id: 'delete', label: 'Удалить', destructive: true }];

  /** Образцы выбора цвета для меню заметки: текущий цвет отмечен. */
  function noteColorOptions(current: NoteColor): MenuColor[] {
    return NOTE_COLORS.map((color) => ({
      id: color,
      label: NOTE_COLOR_LABELS[color],
      color: NOTE_COLOR_SWATCHES[color],
      selected: color === current,
    }));
  }

  /** Переключение активного набора из списка. */
  function changeSet(setId: string) {
    if (setId && setId !== activeSetId) {
      onSelectSet?.(setId);
    }
  }

  /** Выбор действия набора из меню. */
  function runSetAction(action: string) {
    if (action === 'create') {
      startCreate();
    }
    if (action === 'rename') {
      startRename();
    }
    if (action === 'delete' && activeSet) {
      onRemoveSet?.(activeSet.id);
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
  class="flex w-[340px] flex-none flex-col border-l border-[var(--border)] bg-[var(--card)]"
  data-testid="notes-panel"
>
  <div
    class="flex flex-[0_0_42px] items-center gap-2 border-b border-[var(--border)] px-3 text-[13px] font-semibold"
  >
    Заметки
    {#if items.length > 0}
      <span class="font-normal text-[var(--muted-foreground)]">· {items.length}</span>
    {/if}
  </div>

  {#if !hasBook}
    <div
      class="p-4 text-[13px] text-[var(--muted-foreground)]"
      data-testid="notes-panel-empty"
    >
      Откройте книгу, чтобы вести заметки.
    </div>
  {:else}
    <div
      class="flex flex-col gap-2 border-b border-[var(--border)] p-2"
      data-testid="notes-sets"
    >
      {#if creating}
        <label class="flex flex-col gap-1">
          <span class="text-xs text-[var(--muted-foreground)]">Имя набора</span>
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
        <div class="flex gap-2">
          <Button variant="primary" size="sm" disabled={!newSetName.trim()} onclick={commitCreate}>
            Создать
          </Button>
          <Button variant="secondary" size="sm" onclick={() => (creating = false)}>Отмена</Button>
        </div>
      {:else if renaming}
        <label class="flex flex-col gap-1">
          <span class="text-xs text-[var(--muted-foreground)]">Новое имя</span>
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
        <div class="flex gap-2">
          <Button variant="primary" size="sm" disabled={!renameName.trim()} onclick={commitRename}>
            Сохранить
          </Button>
          <Button variant="secondary" size="sm" onclick={() => (renaming = false)}>Отмена</Button>
        </div>
      {:else}
        <div class="flex items-center gap-2">
          <Select
            value={activeSetId ?? ''}
            items={setOptions}
            placeholder={sets.length === 0 ? 'Наборов нет' : 'Выберите набор'}
            disabled={sets.length === 0}
            ariaLabel="Набор заметок"
            class="min-w-0 flex-1"
            onchange={changeSet}
          />
          <ActionMenu
            ariaLabel="Действия с набором заметок"
            title="Действия"
            items={setActions}
            onselect={runSetAction}
          />
        </div>
      {/if}
    </div>

    <div class="border-b border-[var(--border)] p-2">
      <Input bind:value={query} placeholder="Поиск по заметкам" />
    </div>

    {#if loading && items.length === 0}
      <p class="p-3 text-[13px] text-[var(--muted-foreground)]">Загрузка…</p>
    {:else}
      <ul
        class="m-0 flex list-none flex-col gap-2 overflow-y-auto p-2"
        data-testid="notes-list"
      >
        {#each visible as item (item.note.id)}
          <li
            class="group relative overflow-hidden rounded-md border border-[var(--border)] py-2 pl-4 pr-2 transition-colors {selectedId ===
            item.note.id
              ? 'bg-[var(--primary-soft)]'
              : 'hover:bg-[var(--muted)]'}"
            data-testid="notes-item"
            data-color={item.note.color}
            data-selected={selectedId === item.note.id ? 'true' : 'false'}
          >
            <span
              class="absolute inset-y-0 left-0 w-1"
              style="background: {NOTE_COLOR_SWATCHES[item.note.color]}"
              data-testid="notes-item-color"
              aria-hidden="true"
            ></span>
            <div class="flex items-start gap-2">
              <button
                type="button"
                class="min-w-0 flex-1 cursor-pointer text-left [font:inherit]"
                data-testid="notes-item-link"
                onclick={() => onGoToNote?.(item.note)}
              >
                <span class="block text-[13px] leading-snug">{item.name}</span>
                <span
                  class="mt-1 flex items-center gap-2 text-[11px] text-[var(--muted-foreground)]"
                >
                  {#if item.place}
                    <span data-testid="notes-item-place">{item.place}</span>
                  {/if}
                  <span>{formatDate(item.createdAtMillis)}</span>
                </span>
              </button>
              <ActionMenu
                ariaLabel="Действия с заметкой"
                title="Действия"
                class="h-7 w-7"
                items={noteActions}
                colors={noteColorOptions(item.note.color)}
                colorsLabel="Цвет заметки"
                oncolorselect={(color) => onChangeColor?.(item.note.id, color as NoteColor)}
                onselect={(action) => {
                  if (action === 'delete') {
                    onDeleteNote?.(item.note.id);
                  }
                }}
              />
            </div>
          </li>
        {:else}
          <li
            class="px-2 py-3 text-center text-[13px] text-[var(--muted-foreground)]"
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
