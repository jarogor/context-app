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
    | 'moon';
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
  {/if}
</svg>
