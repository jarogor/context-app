<script lang="ts">
  import type { Snippet } from 'svelte';
  import { cn } from '../utils';

  interface Props {
    /** Вариант оформления. */
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    /** Размер кнопки. */
    size?: 'md' | 'sm' | 'icon';
    /** Тип кнопки. */
    type?: 'button' | 'submit';
    /** Недоступность. */
    disabled?: boolean;
    /** Дополнительные классы. */
    class?: string;
    /** Подпись-подсказка. */
    title?: string;
    /** Метка доступности. */
    ariaLabel?: string;
    /** Состояние нажатой (активной) кнопки. */
    ariaPressed?: boolean;
    /** Обработчик нажатия. */
    onclick?: (event: MouseEvent) => void;
    /** Содержимое кнопки. */
    children: Snippet;
  }

  let {
    variant = 'secondary',
    size = 'md',
    type = 'button',
    disabled = false,
    class: className = '',
    title,
    ariaLabel,
    ariaPressed,
    onclick,
    children,
  }: Props = $props();

  const variants: Record<string, string> = {
    primary:
      'border-transparent bg-[var(--color-primary)] text-[var(--color-primary-fg)] hover:opacity-90',
    secondary:
      'border-[var(--color-border-strong)] bg-[var(--color-surface)] text-[var(--color-primary)] hover:bg-[var(--color-primary-soft)]',
    ghost:
      'border-transparent bg-transparent text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]',
    danger:
      'border-[var(--color-danger-border)] bg-[var(--color-surface)] text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]',
  };

  const sizes: Record<string, string> = {
    md: 'h-9 px-[var(--space-3)] text-sm',
    sm: 'h-8 px-[var(--space-2)] text-xs',
    icon: 'h-9 w-9 p-0',
  };
</script>

<button
  {type}
  {disabled}
  {title}
  aria-label={ariaLabel}
  aria-pressed={ariaPressed}
  {onclick}
  class={cn(
    'inline-flex cursor-pointer items-center justify-center gap-[var(--space-1)] rounded-[var(--radius-md)] border [font:inherit] transition-colors disabled:cursor-not-allowed disabled:opacity-50',
    variants[variant],
    sizes[size],
    className,
  )}
>
  {@render children()}
</button>
