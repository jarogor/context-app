<script lang="ts">
  import { BookCover, Button, ErrorState, Icon, Input } from '@context/ui';
  import { t } from '@context/i18n';
  import { formatBytes, formatDateTime } from '../../shared/format';
  import { pushDismissLayer } from '../hotkeys/dismiss-layer';
  import type { BookPropertyEntry } from './book-properties';
  import { formatPublishedDate, type BookFormatInfo, type BookWithCover } from './library';

  /** Свойство книги, по которому можно перейти к списку с фильтром. */
  export type BookPropertyKind = 'author' | 'format' | 'language' | 'tag';

  interface Props {
    /** Открытая книга. */
    book: BookWithCover;
    /** Абсолютный путь файла книги. */
    path: string;
    /** Текущая правка свойств книги (пустая, если книги не правили). */
    userEntry: BookPropertyEntry;
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
    /** Открытие папки с файлом книги. */
    onOpenFolder: () => void;
    /** Сохранение правок свойств книги. */
    onSaveProperties: (entry: BookPropertyEntry) => void;
    /** Возврат к значениям файла: правка книги удаляется. */
    onResetProperties: () => void;
    /** Открытие файла заданного формата вкладкой рабочего места. */
    onAdd: (format: string) => void;
    /** Открытие файла заданного формата. */
    onOpen: (format: string) => void;
    /** Переход к списку книг с фильтром по свойству. */
    onFilterBy: (kind: BookPropertyKind, value: string) => void;
  }

  let {
    book,
    path,
    userEntry,
    formats,
    canRead,
    openingFormat,
    openError,
    onClose,
    onOpenFolder,
    onSaveProperties,
    onResetProperties,
    onAdd,
    onOpen,
    onFilterBy,
  }: Props = $props();

  /** Авторы книги. */
  const authors = $derived(book.authors.map((author) => author.name));

  /** Теги книги. */
  const tags = $derived(book.tags.map((tag) => tag.name));

  /** Дата выхода книги. */
  const published = $derived(formatPublishedDate(book.published));

  /** Дата добавления файла в библиотеку. */
  const added = $derived(book.addedAtMillis ? formatDateTime(book.addedAtMillis) : '');

  /** Описание книги. */
  const description = $derived(book.description?.trim() ?? '');

  /** Идёт ли редактирование сведений. */
  let editing = $state(false);

  /** Черновики полей редактирования. */
  let draftTitle = $state('');
  /** Авторы через запятую. */
  let draftAuthors = $state('');
  /** Язык книги. */
  let draftLanguage = $state('');
  /** Дата выхода. */
  let draftPublished = $state('');
  /** Издатель. */
  let draftPublisher = $state('');
  /** Идентификатор издания. */
  let draftIdentifier = $state('');
  /** Теги через запятую. */
  let draftTags = $state('');

  /** Вход в режим редактирования: поля заполняются текущими значениями. */
  function startEditing() {
    draftTitle = book.title;
    draftAuthors = authors.join(', ');
    draftLanguage = book.language ?? '';
    draftPublished = book.published ?? '';
    draftPublisher = book.publisher ?? '';
    draftIdentifier = book.identifier ?? '';
    draftTags = tags.join(', ');
    editing = true;
  }

  /** Выход из режима редактирования без сохранения. */
  function cancelEditing() {
    editing = false;
  }

  // Escape закрывает правку, как любой другой открытый слой.
  $effect(() => {
    if (!editing) {
      return;
    }
    return pushDismissLayer(cancelEditing);
  });

  /** Список значений из строки через запятую. */
  function splitList(value: string): string[] {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  /** Непустое значение поля. */
  function fieldText(value: string): string | undefined {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }

  /** Сохранение сведений: пустое поле означает «как в файле». */
  function saveEditing() {
    const editedAuthors = splitList(draftAuthors);
    const editedTags = splitList(draftTags);
    onSaveProperties({
      title: fieldText(draftTitle),
      authors: editedAuthors.length > 0 ? editedAuthors : undefined,
      language: fieldText(draftLanguage),
      published: fieldText(draftPublished),
      publisher: fieldText(draftPublisher),
      identifier: fieldText(draftIdentifier),
      tags: editedTags.length > 0 ? editedTags : undefined,
    });
    editing = false;
  }

  /** Возврат к значениям файла: правка книги удаляется. */
  function resetToFile() {
    onResetProperties();
    editing = false;
  }
</script>

{#snippet filterLink(text: string, kind: BookPropertyKind, value: string)}
  <button
    type="button"
    class="cursor-pointer bg-transparent text-left underline decoration-[var(--border)] decoration-dotted underline-offset-2 transition-colors [font:inherit] hover:text-[var(--primary)] hover:decoration-[var(--primary)]"
    title={t('app.library.book.filterBy', { value: text })}
    onclick={() => onFilterBy(kind, value)}
  >
    {text}
  </button>
{/snippet}

<div class="@container flex min-h-0 min-w-0 flex-1 flex-col" data-testid="book-page">
  <header
    class="flex flex-none items-center gap-3 border-b border-[var(--border)] bg-[var(--panel)] px-4 py-2.5 md:px-6"
  >
    <Button variant="ghost" size="sm" ariaLabel={t('app.library.book.back')} onclick={onClose}>
      <Icon name="chevron-left" />
      {t('app.library.book.back')}
    </Button>
    <div class="ml-auto">
      {#if !editing}
        <Button variant="secondary" size="sm" testId="book-edit-start" onclick={startEditing}>
          <Icon name="pencil" />
          {t('app.library.book.edit')}
        </Button>
      {/if}
    </div>
  </header>

  <div class="min-h-0 flex-1 overflow-y-auto">
    {#if !canRead}
      <div
        class="flex-none border-b border-[var(--warning)] bg-[var(--card)] px-4 py-2.5 role-body md:px-6"
        data-testid="book-unsupported"
      >
        {t('app.library.book.formatUnsupported')}
      </div>
    {/if}

    {#if editing}
      <!--
        Режим правки: только сведения, которые можно изменить, с подписями над
        полями и явными действиями внизу. Форматы и файл сюда не входят — они
        не редактируются.
      -->
      <div class="mx-auto flex w-full max-w-[56rem] flex-col gap-5 px-4 py-6 md:px-6">
        <div class="flex flex-col gap-5 @min-[40rem]:flex-row @min-[40rem]:items-start">
          <div class="w-[8.5rem] shrink-0 self-start">
            <BookCover src={book.coverUri ?? null} class="rounded-[var(--radius)]" />
          </div>

          <div class="flex min-w-0 flex-1 flex-col gap-4" data-testid="book-edit-form">
            <h1 class="role-title text-[var(--foreground)]">
              {t('app.library.book.editTitle')}
            </h1>

            <label class="flex flex-col gap-1">
              <span class="role-caption text-[var(--muted-foreground)]">
                {t('app.library.book.field.title')}
              </span>
              <Input bind:value={draftTitle} ariaLabel={t('app.library.book.field.title')} />
            </label>

            <label class="flex flex-col gap-1">
              <span class="role-caption text-[var(--muted-foreground)]">
                {t('app.library.book.field.authors')}
              </span>
              <Input bind:value={draftAuthors} ariaLabel={t('app.library.book.field.authors')} />
            </label>

            <label class="flex flex-col gap-1">
              <span class="role-caption text-[var(--muted-foreground)]">
                {t('app.library.book.field.tags')}
              </span>
              <Input bind:value={draftTags} ariaLabel={t('app.library.book.field.tags')} />
            </label>

            <div class="grid gap-4 sm:grid-cols-2">
              <label class="flex flex-col gap-1">
                <span class="role-caption text-[var(--muted-foreground)]">
                  {t('app.library.book.field.published')}
                </span>
                <Input
                  bind:value={draftPublished}
                  ariaLabel={t('app.library.book.field.published')}
                />
              </label>
              <label class="flex flex-col gap-1">
                <span class="role-caption text-[var(--muted-foreground)]">
                  {t('app.library.book.field.language')}
                </span>
                <Input bind:value={draftLanguage} ariaLabel={t('app.library.book.field.language')} />
              </label>
              <label class="flex flex-col gap-1">
                <span class="role-caption text-[var(--muted-foreground)]">
                  {t('app.library.book.field.publisher')}
                </span>
                <Input bind:value={draftPublisher} ariaLabel={t('app.library.book.field.publisher')} />
              </label>
              <label class="flex flex-col gap-1">
                <span class="role-caption text-[var(--muted-foreground)]">
                  {t('app.library.book.field.identifier')}
                </span>
                <Input
                  bind:value={draftIdentifier}
                  ariaLabel={t('app.library.book.field.identifier')}
                />
              </label>
            </div>

            <div
              class="flex flex-wrap items-center gap-2 border-t border-[var(--divider)] pt-4"
            >
              <Button variant="primary" testId="book-edit-save" onclick={saveEditing}>
                {t('app.library.book.save')}
              </Button>
              <Button variant="secondary" testId="book-edit-cancel" onclick={cancelEditing}>
                {t('app.action.undo')}
              </Button>
              <Button
                variant="ghost"
                testId="book-edit-reset"
                class="ml-auto"
                onclick={resetToFile}
              >
                {t('app.library.book.reset')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    {:else}
      <div class="mx-auto flex w-full max-w-[56rem] flex-col gap-6 px-4 py-6 md:px-6">
        <div class="flex flex-col gap-5 @min-[40rem]:flex-row @min-[40rem]:items-start">
          <div class="w-[8.5rem] shrink-0 self-start">
            <BookCover src={book.coverUri ?? null} class="rounded-[var(--radius)]" />
          </div>

          <div class="flex min-w-0 flex-1 flex-col gap-5">
            <div class="flex flex-col gap-1">
              <h1 class="role-display text-[var(--foreground)]" data-testid="book-title">
                {book.title}
              </h1>
              {#if authors.length > 0}
                <p
                  class="m-0 flex flex-wrap items-center gap-x-1 role-subtitle text-[var(--muted-foreground)]"
                  data-testid="book-authors"
                >
                  {#each authors as author, index (author)}
                    {#if index > 0}<span>,</span>{/if}
                    {@render filterLink(author, 'author', author)}
                  {/each}
                </p>
              {/if}
            </div>

            <section class="flex flex-col gap-1.5" data-testid="book-formats">
              <span class="role-caption text-[var(--muted-foreground)]">
                {t('app.library.book.formats')}
              </span>
              {#each formats as entry (entry.format)}
                <div
                  class="flex flex-wrap items-center gap-2"
                  data-testid="book-format-{entry.format}"
                >
                  <span class="w-[4rem] shrink-0 role-caption">
                    {@render filterLink(entry.format.toUpperCase(), 'format', entry.format)}
                  </span>
                  {#if entry.readable}
                    <Button
                      variant="primary"
                      size="sm"
                      testId="book-read-{entry.format}"
                      onclick={() => onAdd(entry.format)}
                    >
                      {t('app.library.book.read')}
                    </Button>
                  {/if}
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={openingFormat === entry.format}
                    testId="book-open-{entry.format}"
                    onclick={() => onOpen(entry.format)}
                  >
                    {openingFormat === entry.format
                      ? t('app.library.book.opening')
                      : t('app.library.book.openFile')}
                  </Button>
                </div>
              {/each}
            </section>

            <p class="m-0 flex flex-wrap items-center gap-x-1.5 role-body" data-testid="book-tags">
              <span class="role-caption text-[var(--muted-foreground)]">
                {t('app.library.book.tags')}:
              </span>
              {#if tags.length === 0}
                <span class="text-[var(--muted-foreground)]">—</span>
              {:else}
                {#each tags as tag, index (tag)}
                  {#if index > 0}<span class="text-[var(--muted-foreground)]">,</span>{/if}
                  {@render filterLink(tag, 'tag', tag)}
                {/each}
              {/if}
            </p>

            {#if published || book.language || book.publisher || book.identifier}
              <section class="flex flex-col gap-1.5" data-testid="book-properties">
                <span class="role-caption text-[var(--muted-foreground)]">
                  {t('app.library.book.details')}
                </span>
                <dl
                  class="m-0 grid grid-cols-[8.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5"
                >
                  {#if published}
                    <dt class="role-caption text-[var(--muted-foreground)]">
                      {t('app.library.book.published')}
                    </dt>
                    <dd class="m-0 min-w-0 role-body" data-testid="book-property-published">
                      {published}
                    </dd>
                  {/if}
                  {#if book.language}
                    <dt class="role-caption text-[var(--muted-foreground)]">
                      {t('app.library.book.language')}
                    </dt>
                    <dd class="m-0 min-w-0 role-body" data-testid="book-property-language">
                      {@render filterLink(book.language as string, 'language', book.language as string)}
                    </dd>
                  {/if}
                  {#if book.publisher}
                    <dt class="role-caption text-[var(--muted-foreground)]">
                      {t('app.library.book.publisher')}
                    </dt>
                    <dd class="m-0 min-w-0 role-body" data-testid="book-property-publisher">
                      {book.publisher}
                    </dd>
                  {/if}
                  {#if book.identifier}
                    <dt class="role-caption text-[var(--muted-foreground)]">
                      {t('app.library.book.identifier')}
                    </dt>
                    <dd class="m-0 min-w-0 role-body" data-testid="book-property-identifier">
                      {book.identifier}
                    </dd>
                  {/if}
                </dl>
              </section>
            {/if}

            {#if description}
              <p class="m-0 role-body" data-testid="book-description">{description}</p>
            {/if}

            {#if openError}
              <ErrorState message={openError} />
            {/if}
          </div>
        </div>

        <!--
          Файл: действие «Открыть папку» стоит в шапке блока, у правого края,
          поэтому не сдвигается от длины пути.
        -->
        {#if path || book.size !== undefined || added}
          <section
            class="flex flex-col gap-2 border-t border-[var(--divider)] pt-4"
            data-testid="book-file"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span class="role-caption text-[var(--muted-foreground)]">
                {t('app.library.book.file')}
              </span>
              {#if path}
                <Button
                  variant="secondary"
                  size="sm"
                  testId="book-open-folder"
                  onclick={onOpenFolder}
                >
                  <Icon name="folder" />
                  {t('app.library.book.openFolder')}
                </Button>
              {/if}
            </div>
            <dl class="m-0 grid grid-cols-[8.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5">
              {#if path}
                <dt class="role-caption text-[var(--muted-foreground)]">
                  {t('app.library.book.path')}
                </dt>
                <dd
                  class="m-0 min-w-0 break-all font-mono role-caption text-[var(--muted-foreground)]"
                  data-testid="book-property-path"
                >
                  {path}
                </dd>
              {/if}
              {#if book.size !== undefined}
                <dt class="role-caption text-[var(--muted-foreground)]">
                  {t('app.library.book.size')}
                </dt>
                <dd class="m-0 min-w-0 role-body" data-testid="book-property-size">
                  {formatBytes(book.size)}
                </dd>
              {/if}
              {#if added}
                <dt class="role-caption text-[var(--muted-foreground)]">
                  {t('app.library.book.added')}
                </dt>
                <dd class="m-0 min-w-0 role-body" data-testid="book-property-added">{added}</dd>
              {/if}
            </dl>
          </section>
        {/if}
      </div>
    {/if}
  </div>
</div>
