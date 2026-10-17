<script lang="ts">
  import { Badge, BookCoverPlaceholder, Button, ErrorState, Icon } from '@texture/ui';
  import type { BookWithCover } from './library';

  interface Props {
    /** Открытая книга. */
    book: BookWithCover;
    /** Имя рабочего места, в которое попадёт книга; null — место ещё не выбрано. */
    targetWorkspaceName?: string | null;
    /** Поддерживает ли книгу встроенное чтение или плагин рабочего места. */
    canRead: boolean;
    /** Идёт открытие во внешнем приложении. */
    opening: boolean;
    /** Ошибка открытия во внешнем приложении. */
    externalError: string | null;
    /** Возврат к списку книг. */
    onClose: () => void;
    /** Открытие книги вкладкой рабочего места. */
    onAdd: () => void;
    /** Открытие файла книги в системном приложении. */
    onOpenExternal: () => void;
  }

  let {
    book,
    targetWorkspaceName = null,
    canRead,
    opening,
    externalError,
    onClose,
    onAdd,
    onOpenExternal,
  }: Props = $props();

  /** Формат файла содержимого книги. */
  const format = $derived(
    (book.files.find((file) => file.kind === 'book')?.format ?? '').toUpperCase(),
  );

  /** Авторы одной строкой. */
  const authors = $derived(book.authors.map((author) => author.name).join(', '));

  /** Серии одной строкой. */
  const series = $derived(book.series.map((entry) => entry.series.name).join(', '));

  /** Теги одной строкой. */
  const tags = $derived(book.tags.map((tag) => tag.name).join(', '));

  /** Действие открытия книги в рабочем месте. */
  function addLabel(): string {
    if (targetWorkspaceName) {
      return `Добавить в «${targetWorkspaceName}»`;
    }
    return 'Добавить в рабочее место';
  }
</script>

<div class="@container flex min-h-0 min-w-0 flex-1 flex-col" data-testid="book-page">
  <!--
    Шапка страницы книги: возврат к списку слева, а действия — крупной парой
    справа. Имя книги не дублируется здесь: оно и есть заголовок карточки.
  -->
  <header
    class="flex flex-none flex-wrap items-center gap-3 border-b border-[var(--border)] bg-[var(--panel)] px-4 py-2.5 md:px-6"
  >
    <Button
      variant="ghost"
      size="sm"
      title="К списку книг"
      ariaLabel="К списку книг"
      onclick={onClose}
    >
      <Icon name="chevron-left" />
      К списку книг
    </Button>
    <div class="ml-auto flex flex-wrap items-center gap-2">
      {#if canRead}
        <Button variant="primary" onclick={onAdd}>
          <Icon name="book" />
          {addLabel()}
        </Button>
      {/if}
      <Button variant="secondary" disabled={opening} onclick={onOpenExternal}>
        {opening ? 'Открытие…' : 'Открыть в системе'}
      </Button>
    </div>
  </header>

  <div class="min-h-0 flex-1 overflow-y-auto">
    <div
      class="mx-auto grid w-full max-w-[52rem] gap-6 px-4 py-6 @min-[44rem]:grid-cols-[13rem_minmax(0,34rem)] md:px-6"
    >
      <!-- Обложка-«корешок»: слева на широком окне, сверху на узком. -->
      <div class="flex flex-col gap-3">
        <div class="w-[11.25rem] flex-none self-start">
          {#if book.coverUri}
            <img
              class="aspect-[2/3] w-full rounded-[var(--radius)] object-cover shadow-overlay"
              src={book.coverUri}
              alt=""
            />
          {:else}
            <div class="shadow-raised">
              <BookCoverPlaceholder class="rounded-[var(--radius)]" />
            </div>
          {/if}
        </div>
      </div>

      <div class="min-w-0 flex flex-col gap-4">
        <div class="flex flex-col gap-2">
          <div class="flex flex-wrap items-center gap-2">
            {#if format}
              <Badge variant="outline">{format}</Badge>
            {/if}
            {#if canRead}
              <Badge variant="success">можно читать здесь</Badge>
            {:else}
              <Badge variant="muted">чтение недоступно</Badge>
            {/if}
          </div>
          <h1 class="role-display text-[var(--foreground)]" data-testid="book-title">
            {book.title}
          </h1>
          {#if authors}
            <p class="role-subtitle text-[var(--muted-foreground)]">{authors}</p>
          {/if}
        </div>

        <dl
          class="flex flex-col overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] shadow-raised"
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

        {#if !canRead}
          <p class="role-caption text-[var(--muted-foreground)]">
            Формат этой книги пока не поддерживается встроенным чтением. Её можно открыть
            в системном приложении.
          </p>
        {/if}

        {#if externalError}
          <ErrorState message={externalError} />
        {/if}
      </div>
    </div>
  </div>
</div>
