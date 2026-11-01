<script lang="ts">
  import { Button, Icon } from '@context/ui';
  import { t } from '@context/i18n';

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
  <p class="role-heading text-[var(--foreground)]">{t('app.boot.error.title')}</p>
  <p class="role-body text-[var(--muted-foreground)]">
    {t('app.boot.error.description')}
  </p>
  {#if error}
    <p class="max-w-[26.25rem] role-caption text-[var(--muted-foreground)]" title={error}>{error}</p>
  {/if}
  <Button variant="primary" onclick={onRetry}>{t('app.boot.error.retry')}</Button>
</div>
