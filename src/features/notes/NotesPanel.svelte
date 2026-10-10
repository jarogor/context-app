<script lang="ts">
  import { ActionMenu, Input, type MenuAction, type MenuColor } from '@texture/ui';
  import { NOTE_COLORS, NOTE_COLOR_LABELS, NOTE_COLOR_SWATCHES, type Note, type NoteColor, type NoteListItem, type NoteSetSummary } from './notes';
  import NoteEntry from './NoteEntry.svelte';
  import NoteSetsControl from './NoteSetsControl.svelte';
  import NoteEditor from './NoteEditor.svelte';
  import { DEFAULT_PALETTE, DEFAULT_READER_THEME, type PaletteId, type ReaderThemeId } from '@texture/ui';
  interface Props {
    /** Элементы списка заметок активного набора. */
    items: NoteListItem[];
    /** Наборы заметок книги. */
    sets: NoteSetSummary[];
    /** Идентификатор активного набора книги. */
    activeSetId: string | null;
    /** Тема области чтения: цвет меток заметок следует ей. */
    readerTheme?: ReaderThemeId;
    /** Палитра оформления: общий реестр дизайн-системы. */
    palette?: PaletteId;
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
    /** Изменение названия и комментария заметки. */
    onEditNote?: (noteId: string, details: { title: string; comment: string }) => void;
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
    readerTheme = DEFAULT_READER_THEME,
    palette = DEFAULT_PALETTE,
    loading = false,
    hasBook = true,
    onGoToNote,
    selectedId = null,
    onDeleteNote,
    onChangeColor,
    onEditNote,
    onSelectSet,
    onCreateSet,
    onRenameSet,
    onRemoveSet,
  }: Props = $props();

  /** Запрос поиска по цитатам. */
  let query = $state('');

  /** Идентификатор заметки, у которой открыта форма названия и комментария. */
  let editingNoteId: string | null = $state(null);

  /** Черновики правки текущей заметки. */
  let editingNote: Note | null = $state(null);

  /** Элементы с учётом поиска по имени, комментарию и месту. */
  const visible = $derived.by(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return items;
    }
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(needle) ||
        item.note.comment.toLowerCase().includes(needle) ||
        item.place.toLowerCase().includes(needle),
    );
  });

  /** Пункты меню заметки: изменение и удаление; цвет выбирается образцами. */
  const noteActions: MenuAction[] = [
    { id: 'edit', label: 'Изменить' },
    { id: 'delete', label: 'Удалить', destructive: true },
  ];

  /** Образцы выбора цвета для меню заметки: текущий цвет отмечен. */
  function noteColorOptions(current: NoteColor): MenuColor[] {
    return NOTE_COLORS.map((color) => ({
      id: color,
      label: NOTE_COLOR_LABELS[color],
      color: NOTE_COLOR_SWATCHES[color],
      selected: color === current,
    }));
  }

  /** Начало правки названия и комментария заметки. */
  function startEditNote(note: Note) {
    editingNoteId = note.id;
    editingNote = note;
  }

  /** Завершение правки без сохранения. */
  function cancelEditNote() {
    editingNoteId = null;
    editingNote = null;
  }

  /** Сохранение названия и комментария заметки. */
  function commitEditNote(noteId: string, details: { title: string; comment: string }) {
    onEditNote?.(noteId, details);
    cancelEditNote();
  }

  /** Обработка пункта меню заметки. */
  function runNoteAction(noteId: string, action: string) {
    if (action === 'delete') {
      onDeleteNote?.(noteId);
    }
    if (action === 'edit') {
      const item = items.find((candidate) => candidate.note.id === noteId);
      if (item) {
        startEditNote(item.note);
      }
    }
  }
</script>

<aside
  class="flex w-[var(--notes-panel-width)] min-w-0 flex-none flex-col border-l border-[var(--border)] bg-[var(--card)] max-[899px]:absolute max-[899px]:inset-0 max-[899px]:w-auto max-[899px]:border-l-0"
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
    <NoteSetsControl
      {sets}
      {activeSetId}
      onSelect={(setId) => onSelectSet?.(setId)}
      onCreate={(name) => onCreateSet?.(name)}
      onRename={(setId, name) => onRenameSet?.(setId, name)}
      onRemove={(setId) => onRemoveSet?.(setId)}
    />

    <div class="border-b border-[var(--border)] p-2">
      <Input bind:value={query} placeholder="Поиск по заметкам" />
    </div>

    {#if loading && items.length === 0}
      <p class="p-3 text-[13px] text-[var(--muted-foreground)]">Загрузка…</p>
    {:else}
      <ul
        class="m-0 flex min-h-0 flex-1 list-none flex-col gap-2 overflow-y-auto p-2"
        data-testid="notes-list"
      >
        {#each visible as item (item.note.id)}
          <NoteEntry
            {item}
            selected={selectedId === item.note.id}
            {readerTheme}
            {palette}
            onclick={(note) => onGoToNote?.(note)}
          >
            {#snippet actions()}
              <ActionMenu
                ariaLabel="Действия с заметкой"
                title="Действия"
                class="h-7 w-7"
                items={noteActions}
                colors={noteColorOptions(item.note.color)}
                colorsLabel="Цвет заметки"
                oncolorselect={(color) => onChangeColor?.(item.note.id, color as NoteColor)}
                onselect={(action) => runNoteAction(item.note.id, action)}
              />
            {/snippet}
            {#snippet children()}
              {#if editingNoteId === item.note.id && editingNote}
                <NoteEditor
                  noteId={item.note.id}
                  initialTitle={editingNote.title}
                  initialComment={editingNote.comment}
                  onCommit={commitEditNote}
                  onCancel={cancelEditNote}
                />
              {/if}
            {/snippet}
          </NoteEntry>
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
