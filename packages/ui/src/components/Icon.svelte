<script lang="ts" module>
  /** Набор доступных иконок интерфейса.
   *
   * Иконки ставятся там, где смысл однозначен и подпись только засоряет строку
   * (дата, путь, книга, плагин). Точный текст остаётся в подсказке (`title`) и
   * доступном имени, поэтому иконка не теряет смысл для незрячих пользователей.
   */
  export type IconName =
    | 'search'
    | 'calendar'
    | 'clock'
    | 'book'
    | 'folder'
    | 'check'
    | 'close'
    | 'sun'
    | 'moon'
    | 'tag'
    | 'star'
    | 'bookmark'
    | 'flag'
    | 'heart'
    | 'lightbulb'
    | 'compass'
    | 'note'
    | 'quote'
    | 'text'
    | 'shape'
    | 'layers'
    | 'circle'
    | 'gear'
    | 'plus'
    | 'chevron-left'
    | 'chevron-right'
    | 'chevron-down'
    | 'chevron-up'
    | 'copy'
    | 'resize'
    | 'move'
    | 'pencil'
    | 'bell'
    | 'workspace'
    | 'library'
    | 'list'
    | 'tabs'
    | 'grid'
    | 'focus'
    | 'trash'
    | 'duplicate'
    | 'more'
    | 'menu'
    | 'monitor';

  /** Иконки, предлагаемые для оформления вкладки рабочего места.
   *
   * Набор-заглушка: тематические иконки «чувства вкладки». Полный подбор —
   * отдельная задача; нормализация опирается на этот список, поэтому смена
   * набора не ломает сохранённые данные (неизвестная иконка отбрасывается).
   */
  export const TAB_ICON_NAMES = [
    'tag',
    'star',
    'bookmark',
    'flag',
    'heart',
    'lightbulb',
    'compass',
    'note',
    'layers',
    'circle',
  ] as const satisfies readonly IconName[];
</script>

<script lang="ts">
  import { cn } from '../utils';

  interface Props {
    /** Имя иконки. */
    name: IconName;
    /** Дополнительные классы (размер, цвет). */
    class?: string;
  }

  let { name, class: className = '' }: Props = $props();
</script>

<svg
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.8"
  stroke-linecap="round"
  stroke-linejoin="round"
  class={cn('h-4 w-4 shrink-0', className)}
  aria-hidden="true"
>
  {#if name === 'search'}
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  {:else if name === 'calendar'}
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  {:else if name === 'clock'}
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  {:else if name === 'book'}
    <path d="M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2z" />
    <path d="M8 3v12" />
  {:else if name === 'folder'}
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  {:else if name === 'check'}
    <path d="M20 6 9 17l-5-5" stroke-width="2.4" />
  {:else if name === 'close'}
    <path d="M6 6l12 12M18 6 6 18" />
  {:else if name === 'sun'}
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  {:else if name === 'moon'}
    <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
  {:else if name === 'tag'}
    <path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9z" />
    <circle cx="8" cy="8" r="1.4" />
  {:else if name === 'star'}
    <path d="M12 3.6l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
  {:else if name === 'bookmark'}
    <path d="M6 3h12v18l-6-4-6 4z" />
  {:else if name === 'flag'}
    <path d="M5 3v18M5 4h12l-2.5 3.5L17 11H5" />
  {:else if name === 'heart'}
    <path d="M12 20s-7-4.6-7-9.5A4.5 4.5 0 0 1 12 8a4.5 4.5 0 0 1 7 2.5C19 15.4 12 20 12 20z" />
  {:else if name === 'lightbulb'}
    <path d="M9 18h6M10 21h4M12 3a6 6 0 0 1 3.5 10.9c-.4.3-.5.7-.5 1.1H9c0-.4-.1-.8-.5-1.1A6 6 0 0 1 12 3z" />
  {:else if name === 'compass'}
    <circle cx="12" cy="12" r="9" />
    <path d="M15.5 8.5l-2 5-5 2 2-5z" />
  {:else if name === 'note'}
    <rect x="4" y="3" width="16" height="18" rx="2" />
    <path d="M8 8h8M8 12h8M8 16h5" />
  {:else if name === 'quote'}
    <path d="M9 7H5.5A1.5 1.5 0 0 0 4 8.5v3A1.5 1.5 0 0 0 5.5 13H7v1.5a2 2 0 0 1-2 2" />
    <path d="M19 7h-3.5A1.5 1.5 0 0 0 14 8.5v3a1.5 1.5 0 0 0 1.5 1.5H17v1.5a2 2 0 0 1-2 2" />
  {:else if name === 'text'}
    <path d="M5 6V4.5h14V6M12 4.5V20M9 20h6" />
  {:else if name === 'shape'}
    <rect x="4" y="6" width="11" height="9" rx="1.5" />
    <circle cx="16.5" cy="15.5" r="4.5" />
  {:else if name === 'layers'}
    <path d="M12 3l9 5-9 5-9-5z" />
    <path d="M3 13l9 5 9-5M3 16.5l9 5 9-5" />
  {:else if name === 'circle'}
    <circle cx="12" cy="12" r="8" />
  {:else if name === 'gear'}
    <circle cx="12" cy="12" r="3.2" />
    <path
      d="M12 3.2v2M12 18.8v2M3.2 12h2M18.8 12h2M5.8 5.8l1.4 1.4M16.8 16.8l1.4 1.4M18.2 5.8l-1.4 1.4M7.2 16.8l-1.4 1.4"
    />
  {:else if name === 'plus'}
    <path d="M12 5v14M5 12h14" />
  {:else if name === 'chevron-left'}
    <path d="M15 6l-6 6 6 6" />
  {:else if name === 'chevron-right'}
    <path d="M9 6l6 6-6 6" />
  {:else if name === 'chevron-down'}
    <path d="m6 9 6 6 6-6" />
  {:else if name === 'chevron-up'}
    <path d="m6 15 6-6 6 6" />
  {:else if name === 'copy'}
    <path d="M9 9h9v9H9zM6 15V6h9" />
  {:else if name === 'resize'}
    <path d="M4 9h13M4 9l3-3M4 9l3 3M20 15H7M20 15l-3-3M20 15l-3 3" />
  {:else if name === 'move'}
    <path
      d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"
    />
  {:else if name === 'pencil'}
    <path d="M4 20h4l10-10-4-4L4 16zM14 6l4 4" />
  {:else if name === 'bell'}
    <path d="M12 21a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 21Zm7-5v-1l-1.7-1.7V10a5.3 5.3 0 0 0-4-5.2V4a1.3 1.3 0 0 0-2.6 0v.8A5.3 5.3 0 0 0 6.7 10v4.3L5 16v1Z" />
  {:else if name === 'workspace'}
    <rect x="3.5" y="4" width="17" height="16" rx="2" />
    <path d="M3.5 8.5h17M9 8.5V20" />
  {:else if name === 'library'}
    <rect x="4" y="3.5" width="4.5" height="17" rx="1" />
    <rect x="10" y="3.5" width="4.5" height="17" rx="1" />
    <path d="M16.2 4.3a1 1 0 0 1 1.25.7l3.1 14.2a1 1 0 0 1-.75 1.2l-1.9.45a1 1 0 0 1-1.2-.75L13.6 5.9a1 1 0 0 1 .75-1.2Z" />
  {:else if name === 'list'}
    <path d="M4 6h16M4 12h16M4 18h16" />
  {:else if name === 'tabs'}
    <path d="M4 6h16M4 12h16M4 18h10" />
  {:else if name === 'grid'}
    <rect x="4" y="4" width="7" height="7" rx="1" />
    <rect x="13" y="4" width="7" height="7" rx="1" />
    <rect x="4" y="13" width="7" height="7" rx="1" />
    <rect x="13" y="13" width="7" height="7" rx="1" />
  {:else if name === 'focus'}
    <path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4" />
  {:else if name === 'trash'}
    <path d="M5 7h14M10 7V5h4v2M6 7l1 13h10l1-13" />
  {:else if name === 'duplicate'}
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V6a2 2 0 0 1 2-2h9" />
  {:else if name === 'more'}
    <circle cx="12" cy="5" r="1.6" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
    <circle cx="12" cy="19" r="1.6" fill="currentColor" stroke="none" />
  {:else if name === 'menu'}
    <path d="M4 6h16M4 12h16M4 18h16" />
  {:else if name === 'monitor'}
    <rect x="2.5" y="4" width="19" height="13" rx="2" />
    <path d="M8 20.5h8" />
  {/if}
</svg>
