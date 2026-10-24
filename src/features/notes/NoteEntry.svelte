<script lang="ts">
  import { Badge, RowActions } from '@context/ui';
  import type { Snippet } from 'svelte';
  import { formatDateTime } from '../../shared/format';
  import { noteMarkerColor, NOTE_TYPE_LABELS, type NoteListItem } from './notes';
  import { DEFAULT_PALETTE, DEFAULT_READER_THEME, type PaletteId, type ReaderThemeId } from '@context/ui';

  /** Общая карточка заметки в списке: цветовая полоса, тип, место, дата и содержимое.
   *
   * Один компонент на все списки заметок — панель рабочего места и реестр
   * заметок, — чтобы вид и поведение записи не расходились. Основная область
   * кликабельна, а действия и дополнительное содержимое передаются снаружи
   * снипетами. Цветовая полоса берёт мягкий тон темы области чтения.
   */
  interface Props {
    /** Элемент списка заметок. */
    item: NoteListItem;
    /** Отмечена ли заметка как выбранная. */
    selected?: boolean;
    /** Тема области чтения: цвет полосы следует ей. */
    readerTheme?: ReaderThemeId;
    /** Палитра оформления: общий реестр дизайн-системы. */
    palette?: PaletteId;
    /** Переход к заметке в книге. */
    onclick?: (note: NoteListItem['note']) => void;
    /** Правый блок действий над заметкой. */
    actions?: Snippet;
    /** Дополнительное содержимое под карточкой (например, форма правки). */
    children?: Snippet;
  }

  let {
    item,
    selected = false,
    readerTheme = DEFAULT_READER_THEME,
    palette = DEFAULT_PALETTE,
    onclick,
    actions,
    children,
  }: Props = $props();
</script>

<li
  class="group relative shrink-0 overflow-hidden rounded-[var(--radius)] border py-2.5 pr-2 pl-4 transition-colors {selected
    ? 'border-[var(--note-edge)] bg-[var(--surface-selected)]'
    : 'border-transparent bg-[var(--card)] hover:bg-[var(--surface-hover)]'}"
  style="--note-edge: {noteMarkerColor(item.note, readerTheme, palette)}"
  data-testid="notes-item"
  data-color={item.note.color}
  data-selected={selected ? 'true' : 'false'}
>
  <span
    class="absolute inset-y-0 left-0 w-1"
    style="background: {noteMarkerColor(item.note, readerTheme, palette)}"
    data-testid="notes-item-color"
    aria-hidden="true"
  ></span>
  <div class="flex items-start gap-2">
    <button
      type="button"
      class="min-w-0 flex-1 cursor-pointer text-left [font:inherit]"
      data-testid="notes-item-link"
      onclick={() => onclick?.(item.note)}
    >
      <span class="mb-1 flex items-center gap-2">
        <span data-testid="notes-item-type">
          <Badge>{NOTE_TYPE_LABELS[item.note.type]}</Badge>
        </span>
        {#if item.place}
          <span class="role-caption text-[var(--muted-foreground)]" data-testid="notes-item-place"
            >{item.place}</span
          >
        {/if}
        <span
          class="ml-auto role-caption text-[var(--muted-foreground)]"
          data-testid="notes-item-date">{formatDateTime(item.createdAtMillis)}</span
        >
      </span>
      <span class="block role-body">{item.name}</span>
      {#if item.note.title.trim() && item.preview}
        <span
          class="mt-0.5 block whitespace-pre-wrap role-caption italic text-[var(--muted-foreground)]"
          data-testid="notes-item-preview">«{item.preview}»</span
        >
      {/if}
      {#if item.note.comment}
        <span
          class="mt-0.5 block whitespace-pre-wrap role-caption text-[var(--muted-foreground)]"
          data-testid="notes-item-comment">{item.note.comment}</span
        >
      {/if}
    </button>
    <RowActions>
      {@render actions?.()}
    </RowActions>
  </div>
  {@render children?.()}
</li>
