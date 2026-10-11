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
    | 'layers'
    | 'circle';

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
  {:else if name === 'layers'}
    <path d="M12 3l9 5-9 5-9-5z" />
    <path d="M3 13l9 5 9-5M3 16.5l9 5 9-5" />
  {:else if name === 'circle'}
    <circle cx="12" cy="12" r="8" />
  {/if}
</svg>
