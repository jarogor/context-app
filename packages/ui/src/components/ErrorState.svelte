<script lang="ts">
  import Icon from './Icon.svelte';
  import Button from './Button.svelte';
  import { cn } from '../utils';

  /**
   * Ошибка области с действием повтора.
   *
   * Компактное сообщение о неудаче загрузки внутри области: не прерывает работу
   * остального интерфейса и, когда известен способ повторить, предлагает это
   * действие.
   */
  interface Props {
    /** Текст ошибки. */
    message: string;
    /** Текст действия повтора (кнопка показывается только при обработчике). */
    retryLabel?: string;
    /** Повтор неудачной операции. */
    onretry?: () => void;
    /** Метка для тестов. */
    testId?: string;
    /** Дополнительные классы. */
    class?: string;
  }

  let {
    message,
    retryLabel = 'Повторить',
    onretry,
    testId,
    class: className = '',
  }: Props = $props();
</script>

<div
  class={cn(
    'border-[var(--destructive-border)] bg-[var(--destructive-soft)] text-[var(--destructive)] flex flex-wrap items-center gap-2 rounded-[var(--radius)] border px-3 py-2 role-body',
    className,
  )}
  data-testid={testId}
  role="alert"
>
  <Icon name="flag" class="h-4 w-4 shrink-0" />
  <span class="min-w-0 flex-1 break-words">{message}</span>
  {#if onretry}
    <Button variant="secondary" size="sm" onclick={onretry}>{retryLabel}</Button>
  {/if}
</div>
