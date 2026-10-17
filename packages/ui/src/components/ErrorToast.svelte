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
    class="border-[var(--destructive-border)] bg-[var(--destructive-soft)] text-[var(--destructive)] fixed right-[0.5rem] left-[0.5rem] z-[var(--layer-popup)] rounded-[var(--radius)] border px-3 py-2 role-body shadow-overlay"
    style="bottom: calc(var(--safe-bottom) + var(--overlay-bottom-offset, 0.5rem));"
    role="alert"
  >
    {message}
  </div>
{/if}
