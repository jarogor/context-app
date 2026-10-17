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
  class="flex h-full flex-col items-center justify-center gap-3 p-6 text-center"
  data-testid="bootstrap-error"
>
  <p class="text-[var(--destructive)]">Не удалось загрузить рабочие места.</p>
  <p class="text-[var(--muted-foreground)]">
    Данные не потеряны — попробуйте загрузить ещё раз.
  </p>
  {#if error}
    <p class="max-w-[26.25rem] role-caption text-[var(--muted-foreground)]" title={error}>{error}</p>
  {/if}
  <Button variant="primary" onclick={onRetry}>Повторить</Button>
</div>
