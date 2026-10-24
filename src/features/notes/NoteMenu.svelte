<script lang="ts">
  import { Button, Icon } from '@context/ui';
  import type { NoteType } from './notes';

  /** Контекстное меню заметки, общее для всех режимов чтения.
   *
   * Рисуется оболочкой поверх области чтения — и в текучем чтении, и над
   * страничным плагином. Плагин рабочего места собственную копию меню не
   * строит: он сообщает прямоугольник заметки, а оболочка показывает это меню и
   * присылает обратно команды перемещения или правки границ. Так вид и поведение
   * совпадают по построению.
   *
   * Порядок кнопок слева направо — от основной правки к завершению: у цитаты
   * «копировать → изменить выделение → закрыть», у карточки «изменить текст →
   * переместить → закрыть», у фигуры «переместить → закрыть».
   */

  interface Props {
    /** Тип заметки: у цитаты правится выделение, у прочих — перемещение. */
    type: NoteType;
    /** Текст цитаты: копируется в буфер обмена по кнопке копирования. */
    quote?: string;
    /** Положение заметки в координатах области чтения (пиксели). */
    at: { left: number; top: number; bottom: number };
    /** Размеры области чтения для удержания меню внутри неё. */
    area: { width: number; height: number };
    /** Начало перемещения заметки. */
    onMove: () => void;
    /** Начало правки границ цитаты. */
    onResize: () => void;
    /** Правка текста текстовой карточки. */
    onEditText?: () => void;
    /** Закрытие меню. */
    onClose: () => void;
  }

  let { type, quote = '', at, area, onMove, onResize, onEditText, onClose }: Props = $props();

  /** Оценочные размеры меню для удержания внутри области чтения. */
  const MENU_WIDTH = 132;
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

  /** Копирование текста цитаты в буфер обмена; меню при этом закрывается.
   *
   * Буфер обмена может быть недоступен (нет разрешения, небезопасный контекст) —
   * это не ошибка области: меню просто закрывается.
   */
  async function copyQuote() {
    const value = quote.trim();
    if (value && typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(value);
      } catch {
        /* Буфер обмена недоступен — копирование пропускается. */
      }
    }
    onClose();
  }
</script>

<div
  class="absolute z-[var(--layer-popup)] flex items-center gap-1 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--overlay-surface)] p-1 shadow-overlay"
  data-testid="note-menu"
  {style}
>
  {#if type === 'quote'}
    <Button
      variant="secondary"
      size="icon"
      title="Копировать текст"
      ariaLabel="Копировать текст"
      onclick={copyQuote}
    >
      <Icon name="copy" />
    </Button>
    <Button
      variant="secondary"
      size="icon"
      title="Изменить выделение"
      ariaLabel="Изменить выделение"
      onclick={onResize}
    >
      <Icon name="resize" />
    </Button>
  {:else}
    {#if type === 'text'}
      <Button
        variant="secondary"
        size="icon"
        title="Изменить текст"
        ariaLabel="Изменить текст"
        onclick={onEditText}
      >
        <Icon name="pencil" />
      </Button>
    {/if}
    <Button
      variant="secondary"
      size="icon"
      title="Переместить"
      ariaLabel="Переместить"
      onclick={onMove}
    >
      <Icon name="move" />
    </Button>
  {/if}
  <Button variant="ghost" size="icon" title="Закрыть" ariaLabel="Закрыть" onclick={onClose}>
    <Icon name="close" />
  </Button>
</div>
