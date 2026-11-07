<script lang="ts">
  import { BookCover, Button, EditableValue, ErrorState, Icon } from '@context/ui';
  import { t } from '@context/i18n';
  import { formatBytes, formatDateTime } from '../../shared/format';
  import type { BookPropertyEntry } from './book-properties';
  import { formatPublishedDate, type BookFormatInfo, type BookWithCover } from './library';

  /** Свойство книги, по которому можно перейти к списку с фильтром. */
  export type BookPropertyKind = 'author' | 'format' | 'language' | 'tag';

  /** Свойство книги, которое можно править по месту. */
  type EditableField = 'title' | 'authors' | 'language' | 'published' | 'publisher' | 'identifier' | 'tags';

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

  /** Поле, которое сейчас правится, либо `null`. */
  let editingField = $state<EditableField | null>(null);

  /** Черновик значения правимого поля. */
  let draft = $state('');

  /** Текущее значение поля в том виде, в каком оно правится. */
  function fieldValue(field: EditableField): string {
    switch (field) {
      case 'title':
        return book.title;
      case 'authors':
        return authors.join(', ');
      case 'tags':
        return tags.join(', ');
      case 'language':
        return book.language ?? '';
      case 'published':
        return book.published ?? '';
      case 'publisher':
        return book.publisher ?? '';
      case 'identifier':
        return book.identifier ?? '';
    }
  }

  /** Начало правки поля: в поле попадает текущее значение. */
  function startEdit(field: EditableField) {
    editingField = field;
    draft = fieldValue(field);
  }

  /** Отмена правки без изменений. */
  function cancelEdit() {
    editingField = null;
    draft = '';
  }

  /** Список значений из строки через запятую. */
  function splitList(value: string): string[] {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  /** Сохранение правки поля: пустое значение означает «как в файле». */
  function saveEdit() {
    if (!editingField) {
      return;
    }
    const entry: BookPropertyEntry = { ...userEntry };
    const text = draft.trim();
    if (editingField === 'authors') {
      const list = splitList(text);
      entry.authors = list.length > 0 ? list : undefined;
    } else if (editingField === 'tags') {
      const list = splitList(text);
      entry.tags = list.length > 0 ? list : undefined;
    } else if (editingField === 'title') {
      entry.title = text || undefined;
    } else {
      entry[editingField] = text || undefined;
    }
    onSaveProperties(entry);
    editingField = null;
    draft = '';
  }

  /** Снятие правки поля: значение снова берётся из файла. */
  function clearEdit() {
    if (!editingField) {
      return;
    }
    const entry: BookPropertyEntry = { ...userEntry };
    delete entry[editingField];
    onSaveProperties(entry);
    editingField = null;
    draft = '';
  }

  /** Есть ли у поля сохранённая правка (что снимать). */
  function canClear(field: EditableField): boolean {
    switch (field) {
      case 'authors':
        return (userEntry.authors?.length ?? 0) > 0;
      case 'tags':
        return (userEntry.tags?.length ?? 0) > 0;
      default:
        return userEntry[field] !== undefined;
    }
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
  <!-- Шапка страницы книги: возврат к списку. Правка — у каждого свойства. -->
  <header
    class="flex flex-none items-center gap-3 border-b border-[var(--border)] bg-[var(--panel)] px-4 py-2.5 md:px-6"
  >
    <Button variant="ghost" size="sm" ariaLabel={t('app.library.book.back')} onclick={onClose}>
      <Icon name="chevron-left" />
      {t('app.library.book.back')}
    </Button>
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

    <div class="mx-auto flex w-full max-w-[56rem] flex-col gap-6 px-4 py-6 md:px-6">
      <div class="flex flex-col gap-5 @min-[40rem]:flex-row @min-[40rem]:items-start">
        <div class="w-[8.5rem] shrink-0 self-start">
          <BookCover src={book.coverUri ?? null} class="rounded-[var(--radius)]" />
        </div>

        <div class="flex min-w-0 flex-1 flex-col gap-4">
          <EditableValue
            label={t('app.library.book.field.title')}
            editing={editingField === 'title'}
            bind:draft
            canClear={canClear('title')}
            onStart={() => startEdit('title')}
            onSave={saveEdit}
            onCancel={cancelEdit}
            onClear={clearEdit}
            testId="book-edit-title"
          >
            {#snippet display()}
              <h1 class="min-w-0 role-display text-[var(--foreground)]" data-testid="book-title">
                {book.title}
              </h1>
            {/snippet}
          </EditableValue>

          {#if authors.length > 0}
            <EditableValue
              label={t('app.library.book.field.authors')}
              editing={editingField === 'authors'}
              bind:draft
              canClear={canClear('authors')}
              onStart={() => startEdit('authors')}
              onSave={saveEdit}
              onCancel={cancelEdit}
              onClear={clearEdit}
              testId="book-edit-authors"
            >
              {#snippet display()}
                <span
                  class="flex min-w-0 flex-wrap items-center gap-x-1 role-subtitle text-[var(--muted-foreground)]"
                  data-testid="book-authors"
                >
                  {#each authors as author, index (author)}
                    {#if index > 0}<span>,</span>{/if}
                    {@render filterLink(author, 'author', author)}
                  {/each}
                </span>
              {/snippet}
            </EditableValue>
          {/if}

          {#if formats.length > 0}
            <div class="flex flex-col gap-2" data-testid="book-formats">
              {#each formats as entry (entry.format)}
                <div
                  class="flex flex-wrap items-center gap-2"
                  data-testid="book-format-{entry.format}"
                >
                  <span class="min-w-[3rem] role-caption">
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
                      : t('app.action.open')}
                  </Button>
                </div>
              {/each}
            </div>
          {/if}

          <EditableValue
            label={t('app.library.book.field.tags')}
            editing={editingField === 'tags'}
            bind:draft
            canClear={canClear('tags')}
            onStart={() => startEdit('tags')}
            onSave={saveEdit}
            onCancel={cancelEdit}
            onClear={clearEdit}
            testId="book-edit-tags"
          >
            {#snippet display()}
              <span class="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
                <span class="role-caption text-[var(--muted-foreground)]">
                  {t('app.library.book.tags')}:
                </span>
                {#if tags.length === 0}
                  <span class="role-caption text-[var(--muted-foreground)]">—</span>
                {:else}
                  {#each tags as tag, index (tag)}
                    {#if index > 0}<span class="text-[var(--muted-foreground)]">,</span>{/if}
                    {@render filterLink(tag, 'tag', tag)}
                  {/each}
                {/if}
              </span>
            {/snippet}
          </EditableValue>

          <!--
            Сведения об издании: короткие значения идут подряд с подписями —
            таблица из двух колонок заняла бы больше места, чем сами значения.
          -->
          {#if published || book.language || book.publisher || book.identifier}
            <div class="flex flex-wrap items-start gap-x-6 gap-y-2" data-testid="book-properties">
              {#if published}
                <span class="flex items-center gap-1">
                  <span class="role-caption text-[var(--muted-foreground)]">
                    {t('app.library.book.published')}:
                  </span>
                  <EditableValue
                    value={published}
                    label={t('app.library.book.field.published')}
                    editing={editingField === 'published'}
                    bind:draft
                    canClear={canClear('published')}
                    onStart={() => startEdit('published')}
                    onSave={saveEdit}
                    onCancel={cancelEdit}
                    onClear={clearEdit}
                    testId="book-edit-published"
                  />
                </span>
              {/if}
              {#if book.language}
                <span class="flex items-center gap-1">
                  <span class="role-caption text-[var(--muted-foreground)]">
                    {t('app.library.book.language')}:
                  </span>
                  <EditableValue
                    label={t('app.library.book.field.language')}
                    editing={editingField === 'language'}
                    bind:draft
                    canClear={canClear('language')}
                    onStart={() => startEdit('language')}
                    onSave={saveEdit}
                    onCancel={cancelEdit}
                    onClear={clearEdit}
                    testId="book-edit-language"
                  >
                    {#snippet display()}
                      {@render filterLink(book.language as string, 'language', book.language as string)}
                    {/snippet}
                  </EditableValue>
                </span>
              {/if}
              {#if book.publisher}
                <span class="flex items-center gap-1">
                  <span class="role-caption text-[var(--muted-foreground)]">
                    {t('app.library.book.publisher')}:
                  </span>
                  <EditableValue
                    value={book.publisher}
                    label={t('app.library.book.field.publisher')}
                    editing={editingField === 'publisher'}
                    bind:draft
                    canClear={canClear('publisher')}
                    onStart={() => startEdit('publisher')}
                    onSave={saveEdit}
                    onCancel={cancelEdit}
                    onClear={clearEdit}
                    testId="book-edit-publisher"
                  />
                </span>
              {/if}
              {#if book.identifier}
                <span class="flex items-center gap-1">
                  <span class="role-caption text-[var(--muted-foreground)]">
                    {t('app.library.book.identifier')}:
                  </span>
                  <EditableValue
                    value={book.identifier}
                    label={t('app.library.book.field.identifier')}
                    editing={editingField === 'identifier'}
                    bind:draft
                    canClear={canClear('identifier')}
                    onStart={() => startEdit('identifier')}
                    onSave={saveEdit}
                    onCancel={cancelEdit}
                    onClear={clearEdit}
                    testId="book-edit-identifier"
                  />
                </span>
              {/if}
            </div>
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
        Файл: путь и размер с датой добавления. Кнопка папки — обычная кнопка с
        подписью, а не значок: по одному значку непонятно, что это действие.
      -->
      {#if path || book.size !== undefined || added}
        <div
          class="flex flex-col gap-2 border-t border-[var(--divider)] pt-4"
          data-testid="book-file"
        >
          <span class="role-caption text-[var(--muted-foreground)]">
            {t('app.library.book.file')}
          </span>
          {#if path}
            <div class="flex flex-wrap items-center gap-3">
              <Button variant="secondary" size="sm" testId="book-open-folder" onclick={onOpenFolder}>
                <Icon name="folder" />
                {t('app.library.book.openFolder')}
              </Button>
              <span
                class="min-w-0 break-all font-mono role-caption text-[var(--muted-foreground)]"
                data-testid="book-property-path">{path}</span
              >
            </div>
          {/if}
          <div
            class="flex flex-wrap items-center gap-x-6 gap-y-1 role-caption text-[var(--muted-foreground)]"
          >
            {#if book.size !== undefined}
              <span data-testid="book-property-size">
                {t('app.library.book.size')}: {formatBytes(book.size)}
              </span>
            {/if}
            {#if added}
              <span data-testid="book-property-added">
                {t('app.library.book.added')}: {added}
              </span>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>
