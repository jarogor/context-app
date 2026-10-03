<script lang="ts">
  import { Spinner } from '@texture/ui';

  interface Props {
    /** Текст под индикатором. */
    message?: string;
  }

  let { message = 'Загрузка…' }: Props = $props();
</script>

<div
  class="flex h-full flex-col items-center justify-center gap-3 text-[var(--muted-foreground)]"
  data-testid="bootstrap-loading"
>
  <Spinner class="h-6 w-6" />
  <p>{message}</p>
</div>
