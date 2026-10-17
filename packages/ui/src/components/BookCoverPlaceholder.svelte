<script lang="ts">
  import { cn } from '../utils';

  /**
   * Заглушка обложки книги.
   *
   * Рисуется там, где у книги нет извлечённой обложки: держит те же пропорции
   * (2:3) и место в раскладке, что и настоящая обложка, поэтому список не
   * «прыгает» при появлении картинки. Вид — силуэт раскрытой книги на
   * приглушённом фоне с тонкой обводкой, чтобы пустая обложка читалась как
   * «обложки нет», а не как сломанное изображение.
   */
  interface Props {
    /** Дополнительные классы. */
    class?: string;
  }

  let { class: className = '' }: Props = $props();
</script>

<div
  class={cn(
    'flex aspect-[2/3] w-full items-center justify-center rounded-sm border border-[var(--border)] bg-[var(--muted)] text-[var(--muted-foreground)]',
    className,
  )}
  aria-hidden="true"
>
  <svg viewBox="0 0 24 24" width="46%" height="46%" fill="none" stroke="currentColor" stroke-width="1.2">
    <path
      d="M4 5.2c2.2-1.2 4.6-1.2 6.8 0 .5.3.7.6.7 1.1v12.5c0-.5-.2-.8-.7-1.1-2.2-1.2-4.6-1.2-6.8 0V5.2Z"
      stroke-linejoin="round"
    />
    <path
      d="M20 5.2c-2.2-1.2-4.6-1.2-6.8 0-.5.3-.7.6-.7 1.1v12.5c0-.5.2-.8.7-1.1 2.2-1.2 4.6-1.2 6.8 0V5.2Z"
      stroke-linejoin="round"
    />
  </svg>
</div>
