<script lang="ts">
  import { onMount } from 'svelte';
  import ReaderPage from '../reader/ReaderPage.svelte';
  import type { Note, NoteColor, NoteTool, ShapeKind } from '../notes/notes';
  import type { QuoteAnchor } from '../reader/reader/anchor';

  /** Читалка вкладки для перехода к заметке. */
  export interface TabReader {
    /** Переход к месту заметки в книге. */
    goto: (note: Note) => void;
  }

  interface Props {
    /** Идентификатор вкладки для адресации читалки. */
    tabId: string;
    /** Путь к файлу открытой книги. */
    path: string;
    /** Название открытой книги. */
    title: string;
    /** Начальный масштаб чтения в процентах. */
    zoom: number;
    /** Начальная позиция чтения в процентах. */
    position: number;
    /** Заметки книги для подсветки. */
    notes: Note[];
    /** Активный инструмент создания заметок. */
    tool?: NoteTool;
    /** Видима ли вкладка (активна и показана поверхность). */
    active: boolean;
    /** Видима ли поверхность рабочего места. */
    visible: boolean;
    /** Регистрация читалки вкладки в оболочке. */
    onReader?: (tabId: string, reader: TabReader | null) => void;
    /** Сообщение об изменении состояния чтения. */
    onStateChange?: (state: { zoom: number; position: number }) => void;
    /** Выделение пользователя, ставшее цитатой. */
    onQuote?: (anchor: QuoteAnchor, color: NoteColor) => void;
    /** Подтверждение текстовой карточки. */
    onTextNote?: (anchor: QuoteAnchor, text: string, color: NoteColor) => void;
    /** Готовая заметка-фигура. */
    onShape?: (anchor: QuoteAnchor, shape: ShapeKind, geometry: string, color: NoteColor) => void;
    /** Клик по подсветке заметки. */
    onNoteClick?: (noteId: string) => void;
    /** Перемещение заметки или сдвиг границ цитаты. */
    onPlaceNote?: (noteId: string, anchor: QuoteAnchor, geometry?: string) => void;
    /** Просьба указать файл недоступной книги. */
    onRepoint?: () => void;
    /** Убрать вкладку. */
    onRemove?: () => void;
  }

  let {
    tabId,
    path,
    title,
    zoom,
    position,
    notes,
    tool,
    active,
    visible,
    onReader,
    onStateChange,
    onQuote,
    onTextNote,
    onShape,
    onNoteClick,
    onPlaceNote,
    onRepoint,
    onRemove,
  }: Props = $props();

  /** Читалка вкладки после монтирования. */
  let reader: TabReader | undefined = $state();

  onMount(() => {
    onReader?.(tabId, reader ?? null);
    return () => onReader?.(tabId, null);
  });
</script>

<ReaderPage
  bind:this={reader}
  {path}
  {title}
  initialZoom={zoom}
  initialPosition={position}
  {notes}
  {tool}
  visible={visible && active}
  {onStateChange}
  {onQuote}
  {onTextNote}
  {onShape}
  {onNoteClick}
  {onPlaceNote}
  {onRepoint}
  {onRemove}
/>
