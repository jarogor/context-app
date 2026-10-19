<script lang="ts">
  import { cn } from '../utils';
  import BookCoverPlaceholder from './BookCoverPlaceholder.svelte';

  /**
   * Обложка книги.
   *
   * Единое место показа обложки: держит пропорции (2:3), рамку и «колодец», а
   * при отсутствии картинки или ошибке её загрузки показывает общую заглушку.
   * Без фолбэка битый или пустой `src` давал бы невидимый пустой квадрат —
   * ровно тот дефект, что виден в списках.
   *
   * Компонент используется и списком рабочих мест, и списком библиотеки, и
   * страницей книги, поэтому вид обложки задан в одном месте, а не повторяется
   * в каждой области.
   */
  interface Props {
    /** Обложка в виде data URI либо `null`, если обложки нет. */
    src?: string | null;
    /** Альтернативный текст; обычно пустой — обложка декоративна. */
    alt?: string;
    /** Дополнительные классы контейнера (в том числе размер). */
    class?: string;
    /** Дополнительные классы самого изображения (например, анимация). */
    imgClass?: string;
    /** Идентификатор для тестов на контейнере обложки. */
    testId?: string;
  }

  let { src = null, alt = '', class: className = '', imgClass = '', testId }: Props = $props();

  /** Признак неудачной загрузки изображения. */
  let failed = $state(false);

  // Новый источник — снова пробуем показать картинку: иначе смена книги на
  // «хорошую» после битой так и осталась бы заглушкой.
  $effect(() => {
    void src;
    failed = false;
  });

  /** Показывать ли изображение: источник есть и он успешно загрузился. */
  const showImage = $derived(Boolean(src) && !failed);
</script>

{#if showImage}
  <span
    class={cn(
      'block aspect-[2/3] w-full overflow-hidden rounded-sm border border-[var(--border)] bg-[var(--muted)]',
      className,
    )}
    data-testid={testId}
  >
    <img class={cn('h-full w-full object-cover', imgClass)} src={src} {alt} onerror={() => (failed = true)} />
  </span>
{:else}
  <BookCoverPlaceholder class={className} {testId} />
{/if}
