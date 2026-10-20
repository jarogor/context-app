<script lang="ts">
  import { Badge, BookCover, Button, ErrorState, Icon } from '@texture/ui';
  import type { BookFormatInfo, BookWithCover } from './library';

  interface Props {
    /** Открытая книга. */
    book: BookWithCover;
    /** Файлы-содержимое книги: формат и поддерживается ли он чтением. */
    formats: BookFormatInfo[];
    /** Читается ли книга здесь хотя бы в одном формате. */
    canRead: boolean;
    /** Формат, файл которого сейчас открывается (или null). */
    openingFormat: string | null;
    /** Ошибка открытия файла книги. */
    openError: string | null;
    /** Возврат к списку книг. */
    onClose: () => void;
    /** Открытие файла заданного формата вкладкой рабочего места. */
    onAdd: (format: string) => void;
    /** Открытие файла заданного формата. */
    onOpen: (format: string) => void;
  }

  let {
    book,
    formats,
    canRead,
    openingFormat,
    openError,
    onClose,
    onAdd,
    onOpen,
  }: Props = $props();

  /** Авторы одной строкой. */
  const authors = $derived(book.authors.map((author) => author.name).join(', '));

  /** Серии одной строкой. */
  const series = $derived(book.series.map((entry) => entry.series.name).join(', '));

  /** Теги одной строкой. */
  const tags = $derived(book.tags.map((tag) => tag.name).join(', '));

</script>

<div class="@container flex min-h-0 min-w-0 flex-1 flex-col" data-testid="book-page">
  <!--
    Шапка страницы книги: возврат к списку слева. Имя книги не дублируется
    здесь: оно и есть заголовок карточки.
  -->
  <header
    class="flex flex-none items-center gap-3 border-b border-[var(--border)] bg-[var(--panel)] px-4 py-2.5 md:px-6"
  >
    <Button variant="ghost" size="sm" ariaLabel="К списку книг" onclick={onClose}>
      <Icon name="chevron-left" />
      К списку книг
    </Button>
  </header>

  <div class="min-h-0 flex-1 overflow-y-auto">
    <!--
      Предупреждение о неподдерживаемом формате — вверху, над сведениями о книге:
      внизу его никто не замечает.
    -->
    {#if !canRead}
      <div
        class="flex-none border-b border-[var(--warning)] bg-[var(--card)] px-4 py-2.5 role-body md:px-6"
        data-testid="book-unsupported"
      >
        Формат не поддерживается.
      </div>
    {/if}

    <div
      class="mx-auto grid w-full max-w-[56rem] gap-6 px-4 py-6 @min-[44rem]:grid-cols-[13rem_minmax(0,1fr)] md:px-6"
    >
      <!-- Обложка-«корешок»: слева на широком окне, сверху на узком. -->
      <div class="flex flex-col gap-3">
        <div class="w-[11.25rem] flex-none self-start">
          <BookCover src={book.coverUri ?? null} class="rounded-[var(--radius)]" />
        </div>
      </div>

      <div class="min-w-0 flex flex-col gap-5">
        <div class="flex flex-col gap-2">
          <h1 class="role-display text-[var(--foreground)]" data-testid="book-title">
            {book.title}
          </h1>
          {#if authors}
            <p class="role-subtitle text-[var(--muted-foreground)]">{authors}</p>
          {/if}
        </div>

        <!--
          Формат книги и действия: «Читать» открывает файл этого формата
          вкладкой, «Открыть» — файлом. Без пояснений и общей панели.
        -->
        {#if formats.length > 0}
          <div class="flex flex-col gap-2" data-testid="book-formats">
            {#each formats as entry (entry.format)}
              <div
                class="flex flex-wrap items-center gap-2"
                data-testid="book-format-{entry.format}"
              >
                <Badge variant={entry.readable ? 'outline' : 'muted'}>
                  {entry.format.toUpperCase()}
                </Badge>
                {#if entry.readable}
                  <Button
                    variant="primary"
                    size="sm"
                    testId="book-read-{entry.format}"
                    onclick={() => onAdd(entry.format)}
                  >
                    Читать
                  </Button>
                {/if}
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={openingFormat === entry.format}
                  testId="book-open-{entry.format}"
                  onclick={() => onOpen(entry.format)}
                >
                  {openingFormat === entry.format ? 'Открытие…' : 'Открыть'}
                </Button>
              </div>
            {/each}
          </div>
        {/if}

        <dl
          class="flex flex-col overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)]"
        >
          {#each [{ label: 'Серия', value: series }, { label: 'Теги', value: tags }] as row (row.label)}
            {#if row.value}
              <div
                class="flex flex-col gap-1 border-b border-[var(--border)] px-4 py-3 last:border-b-0 sm:flex-row sm:gap-4"
              >
                <dt class="w-[6rem] shrink-0 role-caption text-[var(--muted-foreground)]">
                  {row.label}
                </dt>
                <dd class="min-w-0 role-body">{row.value}</dd>
              </div>
            {/if}
          {/each}
          {#if !series && !tags}
            <div class="px-4 py-3 role-body text-[var(--muted-foreground)]">
              Дополнительных сведений о книге нет.
            </div>
          {/if}
        </dl>

        {#if openError}
          <ErrorState message={openError} />
        {/if}
      </div>
    </div>
  </div>
</div>
