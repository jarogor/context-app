<script lang="ts">
  import { Badge, RowActions } from '@context/ui';
  import type { Snippet } from 'svelte';
  import { formatDateTime } from '../../shared/format';
  import { noteColorMark, noteTypeLabel, type NoteListItem } from './notes';

  /** Общая карточка заметки в списке: тип, место, дата и содержимое.
   *
   * Один компонент на все списки заметок — панель рабочего места и реестр
   * заметок, — чтобы вид и поведение записи не расходились. Основная область
   * кликабельна, а действия и дополнительное содержимое передаются снаружи
   * снипетами.
   *
   * Вид строки повторяет строку списка вкладок: активная — поверхность
   * содержимого, неактивная — промежуточная ступень между ней и полосой,
   * наведение — общая подсветка. Цвет заметки живёт на лейбле её типа, а не
   * полосой сбоку: полоса добавляла строке второй край и спорила с фоном.
   */
  interface Props {
    /** Элемент списка заметок. */
    item: NoteListItem;
    /** Отмечена ли заметка как выбранная. */
    selected?: boolean;
    /** Переход к заметке в книге. */
    onclick?: (note: NoteListItem['note']) => void;
    /** Правый блок действий над заметкой. */
    actions?: Snippet;
    /** Дополнительное содержимое под карточкой (например, форма правки). */
    children?: Snippet;
  }

  let { item, selected = false, onclick, actions, children }: Props = $props();

  /** Метка цвета заметки: заливка и подпись на ней. */
  const mark = $derived(noteColorMark(item.note.color));
</script>

<li
  class="group relative flex shrink-0 flex-col rounded-[var(--radius)] px-3 py-2.5 transition-[background-color,color] {selected
    ? 'bg-[var(--tab-active-surface)] text-[var(--tab-active-foreground)]'
    : 'bg-[var(--tab-inactive-surface)] text-[var(--tab-inactive-foreground)] hover:bg-[var(--tab-hover-surface)] hover:text-[var(--tab-active-foreground)]'}"
  data-testid="notes-item"
  data-color={item.note.color}
  data-selected={selected ? 'true' : 'false'}
>
  <div class="flex items-start gap-2">
    <button
      type="button"
      class="min-w-0 flex-1 cursor-pointer text-left [font-family:inherit]"
      data-testid="notes-item-link"
      onclick={() => onclick?.(item.note)}
    >
      <span class="mb-1 flex items-center gap-2">
        <span data-testid="notes-item-type">
          <Badge style="background: {mark.fill}; color: {mark.ink};"
            >{noteTypeLabel(item.note.type)}</Badge
          >
        </span>
        {#if item.place}
          <span class="role-caption" data-testid="notes-item-place">{item.place}</span>
        {/if}
        <span class="ml-auto role-caption" data-testid="notes-item-date"
          >{formatDateTime(item.createdAtMillis)}</span
        >
      </span>
      <span class="block role-body">{item.name}</span>
      {#if item.note.title.trim() && item.preview}
        <span
          class="mt-0.5 block whitespace-pre-wrap role-caption italic"
          data-testid="notes-item-preview">«{item.preview}»</span
        >
      {/if}
      {#if item.note.comment}
        <span
          class="mt-0.5 block whitespace-pre-wrap role-caption"
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
