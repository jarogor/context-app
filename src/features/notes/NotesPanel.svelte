<script lang="ts">
  import { ActionMenu, EmptyState, Input, SidePanel, Skeleton, type MenuAction, type MenuColor } from '@texture/ui';
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
    /** Закрытие панели (на узком окне панель перекрывает содержимое). */
    onClose?: () => void;
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
    onClose,
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

<SidePanel
  title="Заметки"
  testId="notes-panel"
  showSearch={hasBook}
  class="w-[var(--notes-panel-width)]"
  {onClose}
>
  {#snippet search()}
    <Input bind:value={query} placeholder="Поиск по заметкам" ariaLabel="Поиск по заметкам" icon="search" />
  {/snippet}

  {#if !hasBook}
    <div class="p-4" data-testid="notes-panel-empty">
      <EmptyState
        icon="book"
        title="Книга не открыта"
        description="Откройте книгу, чтобы вести заметки."
      />
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

    {#if loading && items.length === 0}
      <div class="p-3"><Skeleton rows={3} rowClass="h-10" /></div>
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
            class="px-2 py-4 text-center role-body text-[var(--muted-foreground)]"
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
</SidePanel>
