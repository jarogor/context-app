<script lang="ts">
  import {
    Badge,
    BookCover,
    Button,
    Dialog,
    ErrorState,
    Icon,
    IconButton,
    Input,
  } from '@context/ui';
  import { t } from '@context/i18n';
  import { formatBytes, formatDateTime } from '../../shared/format';
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

  /** Авторы книги списком. */
  const authorList = $derived(book.authors.map((author) => author.name).join(', '));

  /** Теги книги. */
  const tags = $derived(book.tags.map((tag) => tag.name));

  /** Дата выхода книги. */
  const published = $derived(formatPublishedDate(book.published));

  /** Дата добавления файла в библиотеку. */
  const added = $derived(book.addedAtMillis ? formatDateTime(book.addedAtMillis) : '');

  /** Описание книги. */
  const description = $derived(book.description?.trim() ?? '');

  /** Открыт ли диалог правки сведений. */
  let editing = $state(false);

  /** Поля диалога правки. */
  let editTitle = $state('');
  /** Авторы через запятую. */
  let editAuthors = $state('');
  /** Язык книги. */
  let editLanguage = $state('');
  /** Дата выхода книги. */
  let editPublished = $state('');
  /** Издатель. */
  let editPublisher = $state('');
  /** Идентификатор издания. */
  let editIdentifier = $state('');
  /** Теги через запятую. */
  let editTags = $state('');

  /** Открытие диалога правки с текущими значениями. */
  function startEditing() {
    editTitle = book.title;
    editAuthors = authorList;
    editLanguage = book.language ?? '';
    editPublished = book.published ?? '';
    editPublisher = book.publisher ?? '';
    editIdentifier = book.identifier ?? '';
    editTags = tags.join(', ');
    editing = true;
  }

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

  /** Сохранение правки сведений. */
  function submitEdit() {
    const editedTags = splitList(editTags);
    onSaveProperties({
      title: fieldText(editTitle),
      authors: splitList(editAuthors),
      language: fieldText(editLanguage),
      published: fieldText(editPublished),
      publisher: fieldText(editPublisher),
      identifier: fieldText(editIdentifier),
      tags: editedTags.length > 0 ? editedTags : undefined,
    });
    editing = false;
  }

  /** Возврат к значениям файла. */
  function resetToFile() {
    onResetProperties();
    editing = false;
  }
</script>

<div class="@container flex min-h-0 min-w-0 flex-1 flex-col" data-testid="book-page">
  <!--
    Шапка страницы книги: возврат к списку слева, правка сведений справа.
    Одно действие на страницу: правится карточка целиком, а не её части.
  -->
  <header
    class="flex flex-none items-center gap-3 border-b border-[var(--border)] bg-[var(--panel)] px-4 py-2.5 md:px-6"
  >
    <Button variant="ghost" size="sm" ariaLabel={t('app.library.book.back')} onclick={onClose}>
      <Icon name="chevron-left" />
      {t('app.library.book.back')}
    </Button>
    <div class="ml-auto">
      <IconButton
        action="edit"
        size="sm"
        title={t('app.library.book.edit')}
        ariaLabel={t('app.library.book.edit')}
        onclick={startEditing}
      />
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
        {t('app.library.book.formatUnsupported')}
      </div>
    {/if}

    <div class="mx-auto flex w-full max-w-[56rem] flex-col gap-6 px-4 py-6 md:px-6">
      <div class="flex flex-col gap-5 @min-[40rem]:flex-row @min-[40rem]:items-start">
        <div class="w-[8.5rem] shrink-0 self-start">
          <BookCover src={book.coverUri ?? null} class="rounded-[var(--radius)]" />
        </div>

        <div class="flex min-w-0 flex-1 flex-col gap-3">
          <h1 class="role-display text-[var(--foreground)]" data-testid="book-title">
            {book.title}
          </h1>

          <!--
            Автор — ссылка на список его книг. Отдельного свойства «автор» нет:
            он уже назван здесь, дублировать нечего.
          -->
          {#if authorList}
            <p class="role-subtitle text-[var(--muted-foreground)]">
              <button
                type="button"
                class="cursor-pointer bg-transparent text-left underline-offset-2 hover:text-[var(--primary)] hover:underline [font:inherit]"
                title={t('app.library.book.filterBy', { value: authorList })}
                data-testid="book-author-link"
                onclick={() => onFilterBy('author', book.authors[0]?.name ?? authorList)}
              >
                {authorList}
              </button>
            </p>
          {/if}

          <!--
            Формат и действия: «Читать» открывает файл этого формата вкладкой,
            «Открыть» — файлом. Метка формата ведёт к книгам того же формата.
          -->
          {#if formats.length > 0}
            <div class="flex flex-col gap-2" data-testid="book-formats">
              {#each formats as entry (entry.format)}
                <div
                  class="flex flex-wrap items-center gap-2"
                  data-testid="book-format-{entry.format}"
                >
                  <button
                    type="button"
                    class="cursor-pointer bg-transparent p-0 [font:inherit]"
                    title={t('app.library.book.filterBy', { value: entry.format.toUpperCase() })}
                    data-testid="book-format-link-{entry.format}"
                    onclick={() => onFilterBy('format', entry.format)}
                  >
                    <Badge variant={entry.readable ? 'outline' : 'muted'}>
                      {entry.format.toUpperCase()}
                    </Badge>
                  </button>
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
                      : t('app.action.open')}
                  </Button>
                </div>
              {/each}
            </div>
          {/if}

          <!-- Теги — ссылки на список книг с тем же тегом. -->
          {#if tags.length > 0}
            <div
              class="flex flex-wrap items-center gap-1.5"
              aria-label={t('app.library.book.tags')}
              data-testid="book-tags"
            >
              {#each tags as tag (tag)}
                <button
                  type="button"
                  class="cursor-pointer rounded-full border border-[var(--border)] bg-[var(--card)] px-2.5 py-0.5 role-caption text-[var(--muted-foreground)] transition-colors [font:inherit] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
                  title={t('app.library.book.filterBy', { value: tag })}
                  onclick={() => onFilterBy('tag', tag)}
                >
                  {tag}
                </button>
              {/each}
            </div>
          {/if}

          <!-- Сведения об издании: только заполненные строки. -->
          {#if published || book.language || book.publisher || book.identifier}
            <dl
              class="m-0 flex flex-col overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)]"
              data-testid="book-properties"
            >
              {#if published}
                <div
                  class="flex flex-col gap-1 border-b border-[var(--divider)] px-3 py-2 last:border-b-0 sm:flex-row sm:gap-4"
                >
                  <dt class="w-[9rem] shrink-0 role-caption text-[var(--muted-foreground)]">
                    {t('app.library.book.published')}
                  </dt>
                  <dd class="m-0 min-w-0 role-body" data-testid="book-property-published">
                    {published}
                  </dd>
                </div>
              {/if}
              {#if book.language}
                <div
                  class="flex flex-col gap-1 border-b border-[var(--divider)] px-3 py-2 last:border-b-0 sm:flex-row sm:gap-4"
                >
                  <dt class="w-[9rem] shrink-0 role-caption text-[var(--muted-foreground)]">
                    {t('app.library.book.language')}
                  </dt>
                  <dd class="m-0 min-w-0 role-body">
                    <button
                      type="button"
                      class="cursor-pointer bg-transparent text-left underline-offset-2 hover:text-[var(--primary)] hover:underline [font:inherit]"
                      title={t('app.library.book.filterBy', { value: book.language })}
                      data-testid="book-property-language"
                      onclick={() => onFilterBy('language', book.language as string)}
                    >
                      {book.language}
                    </button>
                  </dd>
                </div>
              {/if}
              {#if book.publisher}
                <div
                  class="flex flex-col gap-1 border-b border-[var(--divider)] px-3 py-2 last:border-b-0 sm:flex-row sm:gap-4"
                >
                  <dt class="w-[9rem] shrink-0 role-caption text-[var(--muted-foreground)]">
                    {t('app.library.book.publisher')}
                  </dt>
                  <dd class="m-0 min-w-0 role-body" data-testid="book-property-publisher">
                    {book.publisher}
                  </dd>
                </div>
              {/if}
              {#if book.identifier}
                <div
                  class="flex flex-col gap-1 border-b border-[var(--divider)] px-3 py-2 last:border-b-0 sm:flex-row sm:gap-4"
                >
                  <dt class="w-[9rem] shrink-0 role-caption text-[var(--muted-foreground)]">
                    {t('app.library.book.identifier')}
                  </dt>
                  <dd class="m-0 min-w-0 role-body" data-testid="book-property-identifier">
                    {book.identifier}
                  </dd>
                </div>
              {/if}
            </dl>
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
        Технические сведения о файле — в самом низу: путь, размер и дата
        добавления нужны редко, и им не место среди свойств книги.
      -->
      {#if path || book.size !== undefined || added}
        <dl
          class="m-0 flex flex-col gap-1 border-t border-[var(--divider)] pt-4 role-caption text-[var(--muted-foreground)]"
          data-testid="book-file"
        >
          {#if path}
            <div class="flex flex-wrap items-center gap-2">
              <dt class="w-[9rem] shrink-0">{t('app.library.book.path')}</dt>
              <dd class="m-0 min-w-0 break-all font-mono" data-testid="book-property-path">
                {path}
              </dd>
              <Button
                variant="ghost"
                size="icon"
                title={t('app.library.book.openFolder')}
                ariaLabel={t('app.library.book.openFolder')}
                testId="book-open-folder"
                onclick={onOpenFolder}
              >
                <Icon name="folder" />
              </Button>
            </div>
          {/if}
          {#if book.size !== undefined}
            <div class="flex flex-wrap items-center gap-2">
              <dt class="w-[9rem] shrink-0">{t('app.library.book.size')}</dt>
              <dd class="m-0 min-w-0" data-testid="book-property-size">{formatBytes(book.size)}</dd>
            </div>
          {/if}
          {#if added}
            <div class="flex flex-wrap items-center gap-2">
              <dt class="w-[9rem] shrink-0">{t('app.library.book.added')}</dt>
              <dd class="m-0 min-w-0" data-testid="book-property-added">{added}</dd>
            </div>
          {/if}
        </dl>
      {/if}
    </div>
  </div>

  <!--
    Правка сведений: пустое поле оставляет значение из файла, «Взять из файла»
    убирает правку книги целиком. Файл не меняется.
  -->
  <Dialog bind:open={editing} title={t('app.library.book.edit')}>
    <div class="flex flex-col gap-3" data-testid="book-edit-form">
      <Input
        bind:value={editTitle}
        placeholder={t('app.library.book.field.title')}
        ariaLabel={t('app.library.book.field.title')}
      />
      <Input
        bind:value={editAuthors}
        placeholder={t('app.library.book.field.authors')}
        ariaLabel={t('app.library.book.field.authors')}
      />
      <div class="flex flex-col gap-2 sm:flex-row">
        <Input
          bind:value={editLanguage}
          placeholder={t('app.library.book.field.language')}
          ariaLabel={t('app.library.book.field.language')}
          class="sm:flex-1"
        />
        <Input
          bind:value={editPublished}
          placeholder={t('app.library.book.field.published')}
          ariaLabel={t('app.library.book.field.published')}
          class="sm:flex-1"
        />
      </div>
      <Input
        bind:value={editPublisher}
        placeholder={t('app.library.book.field.publisher')}
        ariaLabel={t('app.library.book.field.publisher')}
      />
      <Input
        bind:value={editIdentifier}
        placeholder={t('app.library.book.field.identifier')}
        ariaLabel={t('app.library.book.field.identifier')}
      />
      <Input
        bind:value={editTags}
        placeholder={t('app.library.book.field.tags')}
        ariaLabel={t('app.library.book.field.tags')}
      />
      <div class="flex flex-wrap items-center justify-between gap-2 pt-1">
        <Button variant="ghost" size="sm" testId="book-edit-reset" onclick={resetToFile}>
          {t('app.library.book.reset')}
        </Button>
        <Button variant="primary" size="sm" testId="book-edit-save" onclick={submitEdit}>
          {t('app.library.book.save')}
        </Button>
      </div>
    </div>
  </Dialog>
</div>
