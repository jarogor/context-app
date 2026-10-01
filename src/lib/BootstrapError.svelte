<script lang="ts">
  import { Button } from '@texture/ui';

  interface Props {
    /** Сообщение об ошибке загрузки. */
    error: string | null;
    /** Повторная попытка загрузки. */
    onRetry: () => void;
  }

  let { error, onRetry }: Props = $props();
</script>

<div
  class="flex h-full flex-col items-center justify-center gap-[var(--space-3)] p-[var(--space-5)] text-center"
  data-testid="bootstrap-error"
>
  <p class="text-[var(--color-danger)]">Не удалось загрузить рабочие места.</p>
  <p class="text-[var(--color-text-muted)]">
    Данные не потеряны — попробуйте загрузить ещё раз.
  </p>
  {#if error}
    <p class="max-w-[420px] text-[12px] text-[var(--color-text-muted)]" title={error}>{error}</p>
  {/if}
  <Button variant="primary" onclick={onRetry}>Повторить</Button>
</div>
