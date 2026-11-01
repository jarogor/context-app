<script lang="ts">
  import type { Snippet } from 'svelte';
  import { cn } from '../utils';

  /**
   * Пункт бокового меню раздела — та же строка списка, что и `ListRow`.
   *
   * Меню навигации не вводит собственного вида: выбранный пункт отмечается
   * фоном (`--surface-selected`) и акцентным начертанием, наведение — фоном
   * `--surface-hover`, скругление — общий `--radius`. Контурная полоса слева
   * раньше выбивалась из остальных списков и делала пункт «квадратным» в
   * противовес мягким карточкам интерфейса.
   */
  interface Props {
    /** Выбранный пункт. */
    active?: boolean;
    /** Недоступность. */
    disabled?: boolean;
    /** Дополнительные классы. */
    class?: string;
    /** Обработчик выбора. */
    onclick?: (event: MouseEvent) => void;
    /** Содержимое пункта. */
    children: Snippet;
  }

  let {
    active = false,
    disabled = false,
    class: className = '',
    onclick,
    children,
  }: Props = $props();
</script>

<button
  type="button"
  {disabled}
  aria-current={active ? 'page' : undefined}
  {onclick}
  class={cn(
    'w-full cursor-pointer rounded-[var(--radius)] px-3 py-2 text-left text-sm transition-colors [font:inherit] disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:min-h-11',
    active
      ? 'bg-[var(--surface-selected)] font-semibold text-[var(--foreground)]'
      : 'text-[var(--muted-foreground)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]',
    className,
  )}
>
  {@render children()}
</button>
