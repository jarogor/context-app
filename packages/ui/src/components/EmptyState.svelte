<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon, { type IconName } from './Icon.svelte';
  import { cn } from '../utils';

  /**
   * Общее пустое состояние области.
   *
   * Показывает иконку, заголовок и пояснение, а при необходимости — главное
   * действие. Области используют этот компонент вместо голого абзаца серого
   * текста, чтобы пустота объясняла причину и вела к следующему шагу.
   */
  interface Props {
    /** Иконка состояния. */
    icon?: IconName;
    /** Заголовок состояния. */
    title: string;
    /** Пояснение: что произошло и что делать. */
    description?: string;
    /** Действие состояния (например, кнопка создания). */
    action?: Snippet;
    /** Метка для тестов. */
    testId?: string;
    /** Дополнительные классы. */
    class?: string;
  }

  let {
    icon,
    title,
    description = '',
    action,
    testId,
    class: className = '',
  }: Props = $props();
</script>

<div
  class={cn(
    'flex flex-col items-center justify-center gap-2 px-6 py-12 text-center',
    className,
  )}
  data-testid={testId}
>
  {#if icon}
    <span
      class="text-[var(--muted-foreground)] flex size-12 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)]"
      aria-hidden="true"
    >
      <Icon name={icon} class="h-6 w-6" />
    </span>
  {/if}
  <p class="role-heading mt-1 text-[var(--foreground)]">{title}</p>
  {#if description}
    <p class="max-w-[28rem] role-body text-[var(--muted-foreground)]">{description}</p>
  {/if}
  {#if action}
    <div class="mt-2">{@render action()}</div>
  {/if}
</div>
