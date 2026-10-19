<script lang="ts">
  import { cn } from '../utils';

  /**
   * Заглушка обложки книги.
   *
   * Рисуется там, где у книги нет извлечённой обложки: держит те же пропорции
   * (2:3) и место в раскладке, что и настоящая обложка, поэтому список не
   * «прыгает» при появлении картинки. Вид — силуэт раскрытой книги на
   * приподнятой поверхности (`--card`) с тонкой обводкой (`--border`).
   *
   * Фон заглушки — `--muted`; она лежит на «полке»/подложке, которая не
   * залита тем же тоном (полка рабочих мест и ряды списка — `--card`/фон), и
   * отделяется и заливкой, и тонкой обводкой `--border`. Контраст проверен для
   * всех восьми наборов тем.
   */
  interface Props {
    /** Дополнительные классы. */
    class?: string;
    /** Идентификатор для тестов. */
    testId?: string;
  }

  let { class: className = '', testId }: Props = $props();
</script>

<div
  class={cn(
    'flex aspect-[2/3] w-full items-center justify-center rounded-sm border border-[var(--border)] bg-[var(--muted)] text-[var(--muted-foreground)]',
    className,
  )}
  data-testid={testId}
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
