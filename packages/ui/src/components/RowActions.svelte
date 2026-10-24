<script lang="ts">
  /** Ячейка действий в строке списка.
   *
   * Единое место для меню действий пункта: меню стоит в строке одинаково во всех
   * списках — вкладок, заметок, рабочих мест. Ячейка не задаёт собственных
   * отступов: их задаёт строка списка (`pr-*` у строки, `py-*` для высоты), иначе
   * отступы складываются, и списки расходятся.
   */
  import type { Snippet } from 'svelte';
  import { cn } from '../utils';

  interface Props {
    /** Меню действий пункта. */
    children: Snippet;
    /** Дополнительные классы обёртки. */
    class?: string;
  }

  let { children, class: className = '' }: Props = $props();
</script>

<div class={cn('flex shrink-0 items-start', className)}>
  {@render children()}
</div>
