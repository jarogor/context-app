<script lang="ts">
  import { Button, Icon } from '@texture/ui';

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
  <span
    class="border-[var(--destructive-border)] bg-[var(--destructive-soft)] text-[var(--destructive)] flex size-12 items-center justify-center rounded-full border"
    aria-hidden="true"
  >
    <Icon name="flag" class="h-6 w-6" />
  </span>
  <p class="role-heading text-[var(--foreground)]">Не удалось загрузить рабочие места</p>
  <p class="role-body text-[var(--muted-foreground)]">
    Данные не потеряны — попробуйте загрузить ещё раз.
  </p>
  {#if error}
    <p class="max-w-[26.25rem] role-caption text-[var(--muted-foreground)]" title={error}>{error}</p>
  {/if}
  <Button variant="primary" onclick={onRetry}>Повторить</Button>
</div>
