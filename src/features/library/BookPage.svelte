<script lang="ts">
  import { Badge, BookCoverPlaceholder, Button, ErrorState, Icon } from '@texture/ui';
  import type { BookWithCover } from './library';

  interface Props {
    /** Открытая книга. */
    book: BookWithCover;
    /** Имя рабочего места, в которое попадёт книга; null — место ещё не выбрано. */
    targetWorkspaceName?: string | null;
    /** Файлы-содержимое книги: формат и поддерживается ли он чтением. */
    formats: { format: string; readable: boolean }[];
    /** Читается ли книга здесь хотя бы в одном формате. */
    canRead: boolean;
    /** Идёт открытие во внешнем приложении. */
    opening: boolean;
    /** Ошибка открытия во внешнем приложении. */
    externalError: string | null;
    /** Возврат к списку книг. */
    onClose: () => void;
    /** Открытие книги вкладкой рабочего места в заданном формате. */
    onAdd: (format: string) => void;
    /** Открытие файла книги в системном приложении. */
    onOpenExternal: () => void;
  }

  let {
    book,
    targetWorkspaceName = null,
    formats,
    canRead,
    opening,
    externalError,
    onClose,
    onAdd,
    onOpenExternal,
  }: Props = $props();

  /** Авторы одной строкой. */
  const authors = $derived(book.authors.map((author) => author.name).join(', '));

  /** Серии одной строкой. */
  const series = $derived(book.series.map((entry) => entry.series.name).join(', '));

  /** Теги одной строкой. */
  const tags = $derived(book.tags.map((tag) => tag.name).join(', '));

  /** Форматы, которые чтение откроет: на каждый — своя кнопка. */
  const readableFormats = $derived(
    formats.filter((entry) => entry.readable).map((entry) => entry.format),
  );

  /** Куда добавляется книга: имя места или общая формулировка. */
  const target = $derived(
    targetWorkspaceName ? `в «${targetWorkspaceName}»` : 'в рабочее место',
  );

  /**
   * Подпись кнопки добавления.
   *
   * При одном читаемом формате достаточно общей подписи; при нескольких на каждой
   * кнопке виден её формат — пользователь сразу выбирает нужный формат одним
   * нажатием, без промежуточного диалога.
   */
  function addLabel(format: string): string {
    return readableFormats.length > 1
      ? `Добавить ${format.toUpperCase()} ${target}`
      : `Добавить ${target}`;
  }
</script>

<div class="@container flex min-h-0 min-w-0 flex-1 flex-col" data-testid="book-page">
  <!--
    Шапка страницы книги: возврат к списку слева, а действия — крупной парой
    справа. Имя книги не дублируется здесь: оно и есть заголовок карточки.
    Кнопки подписаны текстом, поэтому подсказок нет — они бы его дублировали.
    На телефоне подсказок и вовсе нет.
  -->
  <header
    class="flex flex-none flex-wrap items-center gap-3 border-b border-[var(--border)] bg-[var(--panel)] px-4 py-2.5 md:px-6"
  >
    <Button variant="ghost" size="sm" ariaLabel="К списку книг" onclick={onClose}>
      <Icon name="chevron-left" />
      К списку книг
    </Button>
    <div class="ml-auto flex flex-wrap items-center gap-2">
      {#if readableFormats.length > 0}
        {#each readableFormats as format (format)}
          <Button variant="primary" onclick={() => onAdd(format)}>
            <Icon name="book" />
            {addLabel(format)}
          </Button>
        {/each}
      {:else}
        <Button variant="primary" disabled>
          <Icon name="book" />
          {addLabel('')}
        </Button>
      {/if}
      <Button variant="secondary" disabled={opening} onclick={onOpenExternal}>
        {opening ? 'Открытие…' : 'Открыть'}
      </Button>
    </div>
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
      class="mx-auto grid w-full max-w-[52rem] gap-6 px-4 py-6 @min-[44rem]:grid-cols-[13rem_minmax(0,34rem)] md:px-6"
    >
      <!-- Обложка-«корешок»: слева на широком окне, сверху на узком. -->
      <div class="flex flex-col gap-3">
        <div class="w-[11.25rem] flex-none self-start">
          {#if book.coverUri}
            <img
              class="aspect-[2/3] w-full rounded-[var(--radius)] object-cover"
              src={book.coverUri}
              alt=""
            />
          {:else}
            <BookCoverPlaceholder class="rounded-[var(--radius)]" />
          {/if}
        </div>
      </div>

      <div class="min-w-0 flex flex-col gap-4">
        <div class="flex flex-col gap-2">
          <!--
            Все форматы книги: у Calibre их может быть несколько. Формат, который
            поддерживается чтением, показан акцентом; остальные — приглушённо, с
            пояснением в подсказке.
          -->
          {#if formats.length > 0}
            <div class="flex flex-wrap items-center gap-2">
              {#each formats as entry (entry.format)}
                {#if entry.readable}
                  <Badge variant="outline" title="Этот формат открывается в приложении">
                    {entry.format.toUpperCase()}
                  </Badge>
                {:else}
                  <Badge variant="muted" title="Этот формат не поддерживается чтением">
                    {entry.format.toUpperCase()}
                  </Badge>
                {/if}
              {/each}
            </div>
          {/if}
          <h1 class="role-display text-[var(--foreground)]" data-testid="book-title">
            {book.title}
          </h1>
          {#if authors}
            <p class="role-subtitle text-[var(--muted-foreground)]">{authors}</p>
          {/if}
        </div>

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

        {#if externalError}
          <ErrorState message={externalError} />
        {/if}
      </div>
    </div>
  </div>
</div>
