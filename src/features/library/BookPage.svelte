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
    /** Идёт ли загрузка списка форматов чтения. */
    formatsLoading?: boolean;
    /** Формат, файл которого сейчас открывается (или null). */
    openingFormat: string | null;
    /** Ошибка открытия файла книги. */
    openError: string | null;
    /** Имя текущего рабочего места; null — место ещё не выбрано. */
    targetWorkspaceName?: string | null;
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
    formatsLoading = false,
    openingFormat,
    openError,
    targetWorkspaceName = null,
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

  /**
   * Формат главного действия: первый читаемый файл книги.
   *
   * Порядок файлов задаёт источник, и первый из них может быть нечитаемым
   * (например, PDF без плагина). Главное действие должно вести туда, где книга
   * действительно открывается, а не в первый файл записи.
   */
  const primaryFormat = $derived(formats.find((entry) => entry.readable) ?? formats[0] ?? null);

  /** Остальные файлы книги: у них свои, второстепенные действия. */
  const otherFormats = $derived(
    primaryFormat ? formats.filter((entry) => entry.format !== primaryFormat.format) : [],
  );

  /** Подсказка главного действия: называет рабочее место, куда пойдёт книга. */
  const readHint = $derived(
    targetWorkspaceName
      ? t('app.library.book.readIn', { name: targetWorkspaceName })
      : t('app.library.book.readHint'),
  );

  /** Описание длиннее разумной высоты: показывается свёрнутым. */
  const longDescription = $derived(description.length > 420);

  /** Книга, у которой описание раскрыто; смена книги сворачивает его снова. */
  let expandedBookId = $state<string | null>(null);

  /** Раскрыто ли описание открытой книги. */
  const expanded = $derived(expandedBookId === book.id);

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

  /** Ссылка-кнопка: выглядит текстом, но остаётся настоящей кнопкой. */
  const linkClass =
    'cursor-pointer rounded-[var(--radius)] bg-transparent text-left underline-offset-2 [font:inherit] hover:text-[var(--primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]';

  /** Тег книги: компактная метка-переход к списку книг с тем же тегом. */
  const tagClass =
    'cursor-pointer rounded-full border border-[var(--border)] bg-[var(--card)] px-2.5 py-0.5 role-caption text-[var(--muted-foreground)] transition-colors [font:inherit] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]';

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
    class="flex flex-none items-center gap-3 border-b border-[var(--border)] bg-[var(--background)] px-4 py-2 md:px-6"
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
    <div class="mx-auto flex w-full max-w-[56rem] flex-col px-4 py-6 md:px-8 md:py-8">
      <!--
        Книжный разворот: обложка и титульный блок. На телефоне обложка стоит
        рядом с автором и названием, а действия занимают всю ширину под ними:
        узкая колонка справа от обложки не оставляет места кнопкам, а главное
        действие не должно уезжать за пределы первого экрана. На широком окне
        обложка остаётся слева, а титул и действия идут одной колонкой — без
        пустоты под названием, которую дал бы общий ряд сетки.
      -->
      <div
        class="grid grid-cols-[6.5rem_minmax(0,1fr)] items-start gap-x-4 gap-y-5 [grid-template-areas:'cover_title'_'actions_actions'] @min-[34rem]:grid-cols-[8.5rem_minmax(0,1fr)] @min-[34rem]:gap-x-6 @min-[46rem]:grid-cols-[10.5rem_minmax(0,1fr)] @min-[46rem]:gap-x-8 @min-[46rem]:[grid-template-areas:'cover_title'_'cover_actions']"
      >
        <div class="w-full [grid-area:cover]">
          <BookCover src={book.coverUri ?? null} class="rounded-[var(--radius)]" />
        </div>

        <div class="flex min-w-0 flex-col [grid-area:title]">
          <!--
            Автор — ссылка на список его книг. Отдельного свойства «автор» нет:
            он уже назван здесь, дублировать нечего.
          -->
          {#if authorList}
            <p class="m-0 role-body text-[var(--muted-foreground)]">
              <button
                type="button"
                class={linkClass}
                title={t('app.library.book.filterBy', { value: authorList })}
                data-testid="book-author-link"
                onclick={() => onFilterBy('author', book.authors[0]?.name ?? authorList)}
              >
                {authorList}
              </button>
            </p>
          {/if}

          <h1 class="mt-0.5 role-display text-[var(--foreground)]" data-testid="book-title">
            {book.title}
          </h1>
        </div>

        <div class="flex min-w-0 flex-col gap-4 [grid-area:actions]">
          <!--
            Действия книги: главное — чтение основного читаемого формата,
            остальные файлы уходят в отдельную группу. Пока форматы читалки
            грузятся, вместо ложного «формат не поддерживается» стоит заглушка.
          -->
          {#if formatsLoading}
            <div
              class="flex flex-wrap items-center gap-2"
              role="status"
              aria-label={t('app.loading')}
              data-testid="book-formats-loading"
            >
              <span
                class="h-8 w-14 animate-pulse rounded-full border border-[var(--border)] bg-[var(--muted)]"
                aria-hidden="true"
              ></span>
              <span
                class="h-9 w-32 animate-pulse rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)]"
                aria-hidden="true"
              ></span>
              <span
                class="h-9 w-24 animate-pulse rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)]"
                aria-hidden="true"
              ></span>
            </div>
          {:else if primaryFormat}
            <div class="flex flex-col gap-4" data-testid="book-formats">
              <div
                class="flex flex-wrap items-center gap-2"
                data-testid="book-format-{primaryFormat.format}"
              >
                <button
                  type="button"
                  class="cursor-pointer rounded-full bg-transparent p-0 [font:inherit] focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none"
                  title={t('app.library.book.filterBy', {
                    value: primaryFormat.format.toUpperCase(),
                  })}
                  data-testid="book-format-link-{primaryFormat.format}"
                  onclick={() => onFilterBy('format', primaryFormat.format)}
                >
                  <Badge variant={primaryFormat.readable ? 'outline' : 'muted'}>
                    {primaryFormat.format.toUpperCase()}
                  </Badge>
                </button>
                {#if primaryFormat.readable}
                  <Button
                    variant="primary"
                    size="md"
                    title={readHint}
                    testId="book-read-{primaryFormat.format}"
                    onclick={() => onAdd(primaryFormat.format)}
                  >
                    <Icon name="book" />
                    {t('app.library.book.read')}
                  </Button>
                {/if}
                <Button
                  variant={primaryFormat.readable ? 'secondary' : 'primary'}
                  size="md"
                  title={t('app.library.book.openHint')}
                  disabled={openingFormat === primaryFormat.format}
                  testId="book-open-{primaryFormat.format}"
                  onclick={() => onOpen(primaryFormat.format)}
                >
                  {openingFormat === primaryFormat.format
                    ? t('app.library.book.opening')
                    : t('app.action.open')}
                </Button>
              </div>

              <!-- Дополнительные файлы книги: компактные строки, а не ряд главных кнопок. -->
              {#if otherFormats.length > 0}
                <div
                  class="flex flex-col gap-2 border-t border-[var(--divider)] pt-3"
                  data-testid="book-other-formats"
                >
                  <span class="role-caption text-[var(--muted-foreground)]">
                    {t('app.library.book.otherFormats')}
                  </span>
                  {#each otherFormats as entry (entry.format)}
                    <div
                      class="flex flex-wrap items-center gap-2"
                      data-testid="book-format-{entry.format}"
                    >
                      <button
                        type="button"
                        class="cursor-pointer rounded-full bg-transparent p-0 [font:inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                        title={t('app.library.book.filterBy', {
                          value: entry.format.toUpperCase(),
                        })}
                        data-testid="book-format-link-{entry.format}"
                        onclick={() => onFilterBy('format', entry.format)}
                      >
                        <Badge variant={entry.readable ? 'outline' : 'muted'}>
                          {entry.format.toUpperCase()}
                        </Badge>
                      </button>
                      {#if entry.readable}
                        <Button
                          variant="secondary"
                          size="sm"
                          testId="book-read-{entry.format}"
                          onclick={() => onAdd(entry.format)}
                        >
                          {t('app.library.book.read')}
                        </Button>
                      {/if}
                      <Button
                        variant="ghost"
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
            </div>
          {/if}

          {#if !formatsLoading && !canRead}
            <p
              class="flex items-start gap-2 role-body text-[var(--warning)]"
              data-testid="book-unsupported"
            >
              <Icon name="flag" class="mt-0.5 h-4 w-4 shrink-0" />
              <span>{t('app.library.book.formatUnsupported')}</span>
            </p>
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
                  class={tagClass}
                  title={t('app.library.book.filterBy', { value: tag })}
                  onclick={() => onFilterBy('tag', tag)}
                >
                  {tag}
                </button>
              {/each}
            </div>
          {/if}

          {#if openError}
            <ErrorState message={openError} />
          {/if}
        </div>
      </div>

      <!--
        Содержательная часть: описание книги и сведения об издании. На телефоне
        сведения идут первыми — факты нужны раньше, чем длинный текст. Когда
        показывать нечего, блок не занимает места: пустая полоса с разделителем
        читалась бы как недогруженная страница.
      -->
      {#if description || published || book.language || book.publisher || book.identifier}
        <div
          class="mt-8 grid gap-8 border-t border-[var(--divider)] pt-6 @min-[46rem]:grid-cols-[minmax(0,1fr)_15rem] @min-[46rem]:gap-10"
        >
          {#if description}
            <section class="order-2 flex min-w-0 flex-col gap-2 @min-[46rem]:order-1">
              <h2 class="role-title text-[var(--foreground)]">{t('app.library.book.about')}</h2>
              <p
                class="m-0 max-w-[68ch] break-words whitespace-pre-line role-body text-[var(--foreground)]"
                class:line-clamp-6={longDescription && !expanded}
                data-testid="book-description"
              >
                {description}
              </p>
              {#if longDescription}
                <Button
                  variant="ghost"
                  size="sm"
                  class="-ml-2 self-start"
                  testId="book-description-toggle"
                  onclick={() => (expandedBookId = expanded ? null : book.id)}
                >
                  {expanded
                    ? t('app.library.book.descriptionLess')
                    : t('app.library.book.descriptionMore')}
                </Button>
              {/if}
            </section>
          {/if}

          {#if published || book.language || book.publisher || book.identifier}
            <section
              class="order-1 flex min-w-0 flex-col gap-3 @min-[46rem]:order-2"
              aria-labelledby="book-details-title"
            >
              <h2 id="book-details-title" class="role-title text-[var(--foreground)]">
                {t('app.library.book.details')}
              </h2>
              <dl
                class="m-0 grid grid-cols-2 gap-x-4 gap-y-4 @min-[46rem]:grid-cols-1"
                data-testid="book-properties"
              >
                {#if published}
                  <div class="flex min-w-0 flex-col gap-0.5">
                    <dt class="role-caption text-[var(--muted-foreground)]">
                      {t('app.library.book.published')}
                    </dt>
                    <dd class="m-0 min-w-0 role-body" data-testid="book-property-published">
                      {published}
                    </dd>
                  </div>
                {/if}
                {#if book.language}
                  <div class="flex min-w-0 flex-col gap-0.5">
                    <dt class="role-caption text-[var(--muted-foreground)]">
                      {t('app.library.book.language')}
                    </dt>
                    <dd class="m-0 min-w-0 role-body">
                      <button
                        type="button"
                        class={linkClass}
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
                  <div class="flex min-w-0 flex-col gap-0.5">
                    <dt class="role-caption text-[var(--muted-foreground)]">
                      {t('app.library.book.publisher')}
                    </dt>
                    <dd class="m-0 min-w-0 role-body" data-testid="book-property-publisher">
                      {book.publisher}
                    </dd>
                  </div>
                {/if}
                {#if book.identifier}
                  <div class="flex min-w-0 flex-col gap-0.5">
                    <dt class="role-caption text-[var(--muted-foreground)]">
                      {t('app.library.book.identifier')}
                    </dt>
                    <dd
                      class="m-0 min-w-0 break-words role-body"
                      data-testid="book-property-identifier"
                    >
                      {book.identifier}
                    </dd>
                  </div>
                {/if}
              </dl>
            </section>
          {/if}
        </div>
      {/if}

      <!--
        Технические сведения о файле свёрнуты: путь, размер и дата добавления
        нужны редко и не должны спорить с содержанием страницы.
      -->
      {#if path || book.size !== undefined || added}
        <details class="group mt-6 border-t border-[var(--divider)] pt-3" data-testid="book-file">
          <summary
            class="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-[var(--radius)] role-caption text-[var(--muted-foreground)] hover:text-[var(--foreground)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none [&::-webkit-details-marker]:hidden"
          >
            <Icon
              name="chevron-right"
              class="h-3.5 w-3.5 transition-transform group-open:rotate-90"
            />
            {t('app.library.book.fileDetails')}
          </summary>
          <dl class="m-0 mt-3 flex flex-col gap-2 role-caption text-[var(--muted-foreground)]">
            {#if path}
              <div class="flex flex-wrap items-center gap-2">
                <dt class="shrink-0">{t('app.library.book.path')}</dt>
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
            <div class="flex flex-wrap items-center gap-x-6 gap-y-1">
              {#if book.size !== undefined}
                <div class="flex items-center gap-2">
                  <dt class="shrink-0">{t('app.library.book.size')}</dt>
                  <dd class="m-0" data-testid="book-property-size">{formatBytes(book.size)}</dd>
                </div>
              {/if}
              {#if added}
                <div class="flex items-center gap-2">
                  <dt class="shrink-0">{t('app.library.book.added')}</dt>
                  <dd class="m-0" data-testid="book-property-added">{added}</dd>
                </div>
              {/if}
            </div>
          </dl>
        </details>
      {/if}
    </div>
  </div>

  <!--
    Правка сведений: пустое поле оставляет значение из файла, «Взять из файла»
    убирает правку книги целиком. Файл не меняется.
  -->
  <Dialog bind:open={editing} title={t('app.library.book.edit')}>
    <div class="flex flex-col gap-3" data-testid="book-edit-form">
      <label class="flex flex-col gap-1">
        <span class="role-caption text-[var(--muted-foreground)]">
          {t('app.library.book.field.title')}
        </span>
        <Input bind:value={editTitle} ariaLabel={t('app.library.book.field.title')} />
      </label>
      <label class="flex flex-col gap-1">
        <span class="role-caption text-[var(--muted-foreground)]">
          {t('app.library.book.field.authors')}
        </span>
        <Input bind:value={editAuthors} ariaLabel={t('app.library.book.field.authors')} />
      </label>
      <div class="flex flex-col gap-3 sm:flex-row">
        <label class="flex flex-1 flex-col gap-1">
          <span class="role-caption text-[var(--muted-foreground)]">
            {t('app.library.book.field.language')}
          </span>
          <Input bind:value={editLanguage} ariaLabel={t('app.library.book.field.language')} />
        </label>
        <label class="flex flex-1 flex-col gap-1">
          <span class="role-caption text-[var(--muted-foreground)]">
            {t('app.library.book.field.published')}
          </span>
          <Input bind:value={editPublished} ariaLabel={t('app.library.book.field.published')} />
        </label>
      </div>
      <label class="flex flex-col gap-1">
        <span class="role-caption text-[var(--muted-foreground)]">
          {t('app.library.book.field.publisher')}
        </span>
        <Input bind:value={editPublisher} ariaLabel={t('app.library.book.field.publisher')} />
      </label>
      <label class="flex flex-col gap-1">
        <span class="role-caption text-[var(--muted-foreground)]">
          {t('app.library.book.field.identifier')}
        </span>
        <Input bind:value={editIdentifier} ariaLabel={t('app.library.book.field.identifier')} />
      </label>
      <label class="flex flex-col gap-1">
        <span class="role-caption text-[var(--muted-foreground)]">
          {t('app.library.book.field.tags')}
        </span>
        <Input bind:value={editTags} ariaLabel={t('app.library.book.field.tags')} />
      </label>
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
