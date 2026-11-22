<script lang="ts">
  import { cn } from '../utils';

  /**
   * Короткая метка формата файла: `EPUB`, `FB2`, `PDF`, `DJVU`.
   *
   * Один компонент на все места, где показан формат: список вкладок, страница
   * книги, строка книги. Метка — служебное значение рядом с путём, поэтому она
   * набрана мелким кеглем вразрядку и стоит на своей подложке, а не цветом
   * темы: на цветной заливке строки светлая подложка с подписью не читалась.
   */
  interface Props {
    /** Текст метки. */
    label: string;
    /** Метка для тестов. */
    testId?: string;
    /** Дополнительные классы. */
    class?: string;
  }

  let { label, testId, class: className = '' }: Props = $props();
</script>

<span
  class={cn(
    'shrink-0 rounded-[calc(var(--radius)*0.5)] px-[0.4em] text-[0.85em] leading-[1.5] tracking-wide [background:var(--meta-badge-surface,var(--control-surface))]',
    className,
  )}
  data-testid={testId}
>
  {label}
</span>
