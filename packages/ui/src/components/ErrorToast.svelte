<script lang="ts">
  interface Props {
    /** Текст ошибки; пустая строка скрывает всплывающее сообщение. */
    message: string;
  }

  let { message }: Props = $props();
</script>

{#if message}
  <div
    class="fixed right-[0.5rem] bottom-[8px] left-[8px] z-10 rounded-md bg-[var(--destructive-soft)] p-2 text-xs text-[var(--destructive)]"
    role="alert"
  >
    {message}
  </div>
{/if}
