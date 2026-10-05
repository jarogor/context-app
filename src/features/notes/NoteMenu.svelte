<script lang="ts">
  import { Button } from '@texture/ui';
  import type { NoteType } from './notes';

  /** Контекстное меню заметки, общее для всех режимов чтения.
   *
   * Рисуется оболочкой поверх области чтения — и в текучем чтении, и над
   * страничным плагином. Плагин рабочего места собственную копию меню не
   * строит: он сообщает прямоугольник заметки, а оболочка показывает это меню и
   * присылает обратно команды перемещения или правки границ. Так вид и поведение
   * совпадают по построению.
   */

  interface Props {
    /** Тип заметки: у цитаты правится выделение, у прочих — перемещение. */
    type: NoteType;
    /** Положение заметки в координатах области чтения (пиксели). */
    at: { left: number; top: number; bottom: number };
    /** Размеры области чтения для удержания меню внутри неё. */
    area: { width: number; height: number };
    /** Начало перемещения заметки. */
    onMove: () => void;
    /** Начало правки границ цитаты. */
    onResize: () => void;
    /** Закрытие меню. */
    onClose: () => void;
  }

  let { type, at, area, onMove, onResize, onClose }: Props = $props();

  /** Оценочные размеры меню для удержания внутри области чтения. */
  const MENU_WIDTH = 96;
  const MENU_HEIGHT = 40;

  /** Стиль позиции: под заметкой, при нехватке места — над ней. */
  const style = $derived.by(() => {
    const x = Math.max(8, Math.min(at.left, Math.max(8, area.width - MENU_WIDTH - 8)));
    const below = at.bottom + 6;
    const y =
      area.height > 0 && below + MENU_HEIGHT > area.height
        ? Math.max(8, at.top - MENU_HEIGHT - 6)
        : below;
    return `left: ${x}px; top: ${y}px;`;
  });
</script>

<div
  class="absolute z-20 flex items-center gap-1 rounded-md border border-[var(--input)] bg-[var(--card)] p-[4px] shadow-lg"
  data-testid="note-menu"
  {style}
>
  {#if type === 'quote'}
    <Button
      variant="secondary"
      size="icon"
      title="Изменить выделение"
      ariaLabel="Изменить выделение"
      onclick={onResize}
    >
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path
          d="M4 9h13M4 9l3-3M4 9l3 3M20 15H7M20 15l-3-3M20 15l-3 3"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </Button>
  {:else}
    <Button
      variant="secondary"
      size="icon"
      title="Переместить"
      ariaLabel="Переместить"
      onclick={onMove}
    >
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path
          d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </Button>
  {/if}
  <Button variant="ghost" size="icon" title="Закрыть" ariaLabel="Закрыть" onclick={onClose}>
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    </svg>
  </Button>
</div>
