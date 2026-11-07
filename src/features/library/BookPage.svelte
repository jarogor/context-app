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

  /** Есть ли у книги правка, которую можно снять. */
  const hasUserEntry = $derived(
    userEntry.title !== undefined ||
      (userEntry.authors?.length ?? 0) > 0 ||
      userEntry.language !== undefined ||
      userEntry.published !== undefined ||
      userEntry.publisher !== undefined ||
      userEntry.identifier !== undefined ||
      (userEntry.tags?.length ?? 0) > 0,
  );

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

  /** Вход в режим правки: значения остаются на своих местах, становясь полями. */
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

  /** Выход из режима правки без сохранения. */
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
    class="cursor-pointer bg-transparent p-0 text-left text-[var(--primary)] underline underline-offset-2 transition-colors [font:inherit] hover:text-[var(--foreground)]"
    title={t('app.library.book.filterBy', { value: text })}
    onclick={() => onFilterBy(kind, value)}
  >
    {text}
  </button>
{/snippet}

<div class="@container flex min-h-0 min-w-0 flex-1 flex-col" data-testid="book-page">
  <header
    class="flex flex-none flex-wrap items-center gap-2 border-b border-[var(--border)] bg-[var(--panel)] px-4 py-2.5 md:px-6"
  >
    <Button variant="ghost" size="sm" ariaLabel={t('app.library.book.back')} onclick={onClose}>
      <Icon name="chevron-left" />
      {t('app.library.book.back')}
    </Button>
    <div class="ml-auto flex flex-wrap items-center gap-2">
      {#if editing}
        <Button variant="primary" size="sm" testId="book-edit-save" onclick={saveEditing}>
          {t('app.library.book.save')}
        </Button>
        <Button variant="secondary" size="sm" testId="book-edit-cancel" onclick={cancelEditing}>
          {t('app.action.undo')}
        </Button>
      {:else}
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

    <div class="mx-auto flex w-full max-w-[56rem] flex-col gap-5 px-4 py-6 sm:gap-6 md:px-6">
      <!-- Шапка книги: обложка и главное о ней — на телефоне тоже в одну строку. -->
      <div
        class={editing
          ? 'flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5'
          : 'flex items-start gap-4 sm:gap-5'}
      >
        <div class="w-[6rem] shrink-0 sm:w-[8.5rem]">
          <BookCover src={book.coverUri ?? null} class="rounded-[var(--radius)]" />
        </div>

        <div class="flex min-w-0 flex-1 flex-col gap-4">
          {#if editing}
            <div class="flex flex-col gap-2">
              <Input
                bind:value={draftTitle}
                ariaLabel={t('app.library.book.field.title')}
                placeholder={t('app.library.book.field.title')}
              />
              <Input
                bind:value={draftAuthors}
                ariaLabel={t('app.library.book.field.authors')}
                placeholder={t('app.library.book.field.authors')}
              />
            </div>
          {:else}
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
          {/if}
        </div>
      </div>

      <!--
        Сведения под шапкой книги выровнены с её названием: слева место
        занимает обложка, а на узком окне обложки нет — блок идёт во всю ширину.
      -->
      <div class="flex flex-col gap-5 sm:pl-[9.75rem]">
        <!-- Формат и его действия — одной строкой таблицы, на всю ширину. -->
        {#if formats.length > 0}
          <dl
            class="m-0 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2"
            data-testid="book-formats"
          >
            {#each formats as entry (entry.format)}
              <div class="contents" data-testid="book-format-{entry.format}">
                <dt class="m-0 role-body">
                  {@render filterLink(entry.format.toUpperCase(), 'format', entry.format)}
                </dt>
                <dd class="m-0 flex flex-wrap items-center gap-2">
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
                </dd>
              </div>
            {/each}
          </dl>
        {/if}

        <!-- Теги: подпись слева на широком окне, над полем — на узком. -->
        <div class="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2" data-testid="book-tags">
          <span class="role-caption shrink-0 text-[var(--muted-foreground)] sm:w-[8.5rem]">
            {t('app.library.book.tags')}:
          </span>
          {#if editing}
            <span class="min-w-0 flex-1">
              <Input
                bind:value={draftTags}
                ariaLabel={t('app.library.book.field.tags')}
                placeholder={t('app.library.book.field.tags')}
              />
            </span>
          {:else if tags.length === 0}
            <span class="role-body text-[var(--muted-foreground)]">—</span>
          {:else}
            <span class="flex min-w-0 flex-wrap items-center gap-x-1.5 role-body">
              {#each tags as tag, index (tag)}
                {#if index > 0}<span class="text-[var(--muted-foreground)]">,</span>{/if}
                {@render filterLink(tag, 'tag', tag)}
              {/each}
            </span>
          {/if}
        </div>

        <!--
          Издание: подписи и значения. На телефоне подпись стоит над значением,
          на широком окне — слева отдельной колонкой. Правимые поля в режиме
          правки показываются все, в обычном виде — только заполненные.
        -->
        {#if editing}
          <dl
            class="m-0 grid grid-cols-1 gap-y-1 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:items-center sm:gap-x-4 sm:gap-y-2"
            data-testid="book-properties"
          >
            <dt class="role-caption text-[var(--muted-foreground)]">
              {t('app.library.book.published')}
            </dt>
            <dd class="m-0 min-w-0">
              <Input
                bind:value={draftPublished}
                ariaLabel={t('app.library.book.field.published')}
                placeholder={t('app.library.book.field.published')}
              />
            </dd>
            <dt class="role-caption text-[var(--muted-foreground)] sm:mt-2">
              {t('app.library.book.language')}
            </dt>
            <dd class="m-0 min-w-0">
              <Input
                bind:value={draftLanguage}
                ariaLabel={t('app.library.book.field.language')}
                placeholder={t('app.library.book.field.language')}
              />
            </dd>
            <dt class="role-caption text-[var(--muted-foreground)] sm:mt-2">
              {t('app.library.book.publisher')}
            </dt>
            <dd class="m-0 min-w-0">
              <Input
                bind:value={draftPublisher}
                ariaLabel={t('app.library.book.field.publisher')}
                placeholder={t('app.library.book.field.publisher')}
              />
            </dd>
            <dt class="role-caption text-[var(--muted-foreground)] sm:mt-2">
              {t('app.library.book.identifier')}
            </dt>
            <dd class="m-0 min-w-0">
              <Input
                bind:value={draftIdentifier}
                ariaLabel={t('app.library.book.field.identifier')}
                placeholder={t('app.library.book.field.identifier')}
              />
            </dd>
          </dl>
        {:else if published || book.language || book.publisher || book.identifier}
          <dl
            class="m-0 grid grid-cols-1 gap-y-1 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:items-center sm:gap-x-4 sm:gap-y-2"
            data-testid="book-properties"
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
              <dt class="role-caption text-[var(--muted-foreground)] sm:mt-2">
                {t('app.library.book.language')}
              </dt>
              <dd class="m-0 min-w-0 role-body" data-testid="book-property-language">
                {@render filterLink(book.language as string, 'language', book.language as string)}
              </dd>
            {/if}
            {#if book.publisher}
              <dt class="role-caption text-[var(--muted-foreground)] sm:mt-2">
                {t('app.library.book.publisher')}
              </dt>
              <dd class="m-0 min-w-0 role-body" data-testid="book-property-publisher">
                {book.publisher}
              </dd>
            {/if}
            {#if book.identifier}
              <dt class="role-caption text-[var(--muted-foreground)] sm:mt-2">
                {t('app.library.book.identifier')}
              </dt>
              <dd class="m-0 min-w-0 role-body" data-testid="book-property-identifier">
                {book.identifier}
              </dd>
            {/if}
          </dl>
        {/if}

        {#if editing && hasUserEntry}
          <div class="flex justify-end">
            <Button variant="ghost" size="sm" testId="book-edit-reset" onclick={resetToFile}>
              {t('app.library.book.reset')}
            </Button>
          </div>
        {/if}

        {#if description}
          <p class="m-0 role-body" data-testid="book-description">{description}</p>
        {/if}

        {#if openError}
          <ErrorState message={openError} />
        {/if}
      </div>

      <!--
        Файл: подпись, путь и действие. На телефоне кнопка встаёт под путём,
        на широком окне — у правого края строки, не завися от длины пути.
      -->
      {#if path || book.size !== undefined || added}
        <dl
          class="m-0 grid grid-cols-1 gap-y-1 border-t border-[var(--divider)] pt-4 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:items-center sm:gap-x-4 sm:gap-y-2"
          data-testid="book-file"
        >
          {#if path}
            <dt class="role-caption text-[var(--muted-foreground)]">
              {t('app.library.book.file')}
            </dt>
            <dd class="m-0 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span
                class="min-w-0 break-all font-mono role-caption text-[var(--muted-foreground)]"
                data-testid="book-property-path">{path}</span
              >
              <Button variant="secondary" size="sm" testId="book-open-folder" onclick={onOpenFolder}>
                <Icon name="folder" />
                {t('app.library.book.openFolder')}
              </Button>
            </dd>
          {/if}
          {#if book.size !== undefined}
            <dt class="role-caption text-[var(--muted-foreground)] sm:mt-2">
              {t('app.library.book.size')}
            </dt>
            <dd class="m-0 min-w-0 role-body" data-testid="book-property-size">
              {formatBytes(book.size)}
            </dd>
          {/if}
          {#if added}
            <dt class="role-caption text-[var(--muted-foreground)] sm:mt-2">
              {t('app.library.book.added')}
            </dt>
            <dd class="m-0 min-w-0 role-body" data-testid="book-property-added">{added}</dd>
          {/if}
        </dl>
      {/if}
    </div>
  </div>
</div>
