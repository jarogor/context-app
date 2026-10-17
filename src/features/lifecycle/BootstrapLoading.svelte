<script lang="ts">
  /**
   * Экран загрузки приложения.
   *
   * Вид задаёт стиль `.boot-screen` из `index.html`: он нужен ещё до бандла и
   * остаётся в документе, поэтому оба экрана (статичный и этот) выглядят
   * одинаково, и подмена одного другим незаметна. Здесь только разметка —
   * собственного вида у компонента нет, чтобы описание не расходилось.
   */
  interface Props {
    /** Текст под индикатором. */
    message?: string;
  }

  let { message = 'Загрузка…' }: Props = $props();
</script>

<div class="boot-screen" data-testid="bootstrap-loading">
  <svg class="boot-spinner" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" opacity="0.25" />
    <path
      d="M12 2a10 10 0 0 1 10 10"
      stroke="currentColor"
      stroke-width="4"
      stroke-linecap="round"
    />
  </svg>
  <p>{message}</p>
</div>
