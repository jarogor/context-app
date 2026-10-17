<script lang="ts">
  interface Props {
    /** Текст ошибки; пустая строка скрывает всплывающее сообщение. */
    message: string;
  }

  let { message }: Props = $props();
</script>

{#if message}
  <!--
    Сообщение поднимается над безопасной зоной и нижней навигацией: переменную
    `--overlay-bottom-offset` задаёт оболочка, когда показана нижняя навигация
    телефона (см. `app.css`), — иначе сообщение уходило бы под неё.
  -->
  <div
    class="fixed right-[0.5rem] left-[0.5rem] z-[var(--layer-popup)] rounded-md bg-[var(--destructive-soft)] p-2 text-xs text-[var(--destructive)]"
    style="bottom: calc(var(--safe-bottom) + var(--overlay-bottom-offset, 0.5rem));"
    role="alert"
  >
    {message}
  </div>
{/if}
