<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon, { type IconName } from './Icon.svelte';
  import { cn } from '../utils';

  /**
   * Общее пустое состояние области.
   *
   * Показывает иконку, заголовок и пояснение, а при необходимости — главное
   * действие. Области используют этот компонент вместо голого абзаца серого
   * текста, чтобы пустота объясняла причину и вела к следующему шагу, и чтобы
   * состояние выглядело одинаково во всём приложении.
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
    'flex flex-col items-center justify-center gap-2 px-6 py-10 text-center',
    className,
  )}
  data-testid={testId}
>
  {#if icon}
    <span class="text-[var(--muted-foreground)]" aria-hidden="true">
      <Icon name={icon} class="h-7 w-7" />
    </span>
  {/if}
  <p class="role-subtitle text-[var(--foreground)]">{title}</p>
  {#if description}
    <p class="max-w-[28rem] role-body text-[var(--muted-foreground)]">{description}</p>
  {/if}
  {#if action}
    <div class="mt-2">{@render action()}</div>
  {/if}
</div>
