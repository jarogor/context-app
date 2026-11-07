<script lang="ts">
  import {
    Badge,
    BookCover,
    Button,
    Dialog,
    Disclosure,
    ErrorState,
    Icon,
    IconButton,
    Input,
  } from '@context/ui';
  import { t } from '@context/i18n';
  import { formatBytes, formatDateTime } from '../../shared/format';
  import type { BookPropertyEntry } from './book-properties';
  import { formatPublishedDate, type BookFormatInfo, type BookWithCover } from './library';

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
  }: Props = $props();

  /** Строка свойств: подпись и значение (только заполненные строки). */
  interface PropertyRow {
    /** Идентификатор свойства (метка для тестов). */
    id: string;
    /** Подпись свойства. */
    label: string;
    /** Значение. */
    text: string;
    /** Моноширинный текст (путь к файлу). */
    mono?: boolean;
  }

  /** Группа свойств, которую можно править. */
  type EditGroup = 'main' | 'edition' | 'tags';

  /** Раздел свойств: заголовок и заполненные строки. */
  interface PropertySection {
    /** Идентификатор раздела. */
    id: 'main' | 'edition' | 'tags' | 'file';
    /** Заголовок раздела. */
    title: string;
    /** Строки с заполненными значениями. */
    rows: PropertyRow[];
  }

  /** Авторы одной строкой. */
  const authors = $derived(book.authors.map((author) => author.name).join(', '));

  /** Авторы списком (для правки). */
  const authorList = $derived(book.authors.map((author) => author.name));

  /** Серии одной строкой. */
  const series = $derived(book.series.map((entry) => entry.series.name).join(', '));

  /** Теги книги одной строкой. */
  const tags = $derived(book.tags.map((tag) => tag.name).join(', '));

  /** Форматы файлов книги списком. */
  const formatsText = $derived(
    [...new Set(book.files.filter((file) => file.kind === 'book').map((file) => file.format))]
      .filter(Boolean)
      .map((format) => format.toUpperCase())
      .join(', '),
  );

  /** Дата выхода книги для показа. */
  const published = $derived(formatPublishedDate(book.published));

  /** Дата добавления файла в библиотеку. */
  const added = $derived(book.addedAtMillis ? formatDateTime(book.addedAtMillis) : '');

  /** Описание книги: это текст, а не строка таблицы. */
  const description = $derived(book.description?.trim() ?? '');

  /** Разделы свойств: пустые строки и пустые разделы не показываются. */
  const sections = $derived(
    ([
      {
        id: 'main',
        title: t('app.library.book.section.main'),
        rows: [
          authors && { id: 'authors', label: t('app.library.book.authors'), text: authors },
          formatsText && { id: 'format', label: t('app.library.book.format'), text: formatsText },
          series && { id: 'series', label: t('app.library.book.series'), text: series },
        ].filter((row): row is PropertyRow => Boolean(row)),
      },
      {
        id: 'edition',
        title: t('app.library.book.section.edition'),
        rows: [
          published && {
            id: 'published',
            label: t('app.library.book.published'),
            text: published,
          },
          book.language && {
            id: 'language',
            label: t('app.library.book.language'),
            text: book.language,
          },
          book.publisher && {
            id: 'publisher',
            label: t('app.library.book.publisher'),
            text: book.publisher,
          },
          book.identifier && {
            id: 'identifier',
            label: t('app.library.book.identifier'),
            text: book.identifier,
          },
        ].filter((row): row is PropertyRow => Boolean(row)),
      },
      {
        id: 'tags',
        title: t('app.library.book.section.tags'),
        rows: tags
          ? [{ id: 'tags', label: t('app.library.book.tags'), text: tags } as PropertyRow]
          : [],
      },
      {
        id: 'file',
        title: t('app.library.book.section.file'),
        rows: [
          book.size !== undefined && {
            id: 'size',
            label: t('app.library.book.size'),
            text: formatBytes(book.size),
          },
          path && { id: 'path', label: t('app.library.book.path'), text: path, mono: true },
          added && { id: 'added', label: t('app.library.book.added'), text: added },
        ].filter((row): row is PropertyRow => Boolean(row)),
      },
    ] as PropertySection[]).filter((section) => section.rows.length > 0),
  );

  /** Открытые разделы: закрыты, пока пользователь сам не раскроет. */
  let openSections = $state<Record<string, boolean>>({
    main: false,
    edition: false,
    tags: false,
    file: false,
    description: false,
  });

  /** Открытая группа правки. */
  let editGroup = $state<EditGroup | null>(null);

  /** Открыт ли диалог правки. */
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

  /** Заголовок диалога правки — название группы. */
  const editTitleText = $derived(
    editGroup === 'edition'
      ? t('app.library.book.section.edition')
      : editGroup === 'tags'
        ? t('app.library.book.section.tags')
        : t('app.library.book.section.main'),
  );

  /** Открытие правки группы свойств. */
  function openGroup(group: EditGroup) {
    editGroup = group;
    if (group === 'main') {
      editTitle = book.title;
      editAuthors = authorList.join(', ');
    } else if (group === 'edition') {
      editLanguage = book.language ?? '';
      editPublished = book.published ?? '';
      editPublisher = book.publisher ?? '';
      editIdentifier = book.identifier ?? '';
    } else {
      editTags = tags;
    }
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

  /** Сохранение правки: меняются только поля открытой группы. */
  function submitGroup() {
    const entry: BookPropertyEntry = { ...userEntry };
    if (editGroup === 'main') {
      entry.title = fieldText(editTitle);
      const editedAuthors = splitList(editAuthors);
      entry.authors = editedAuthors.length > 0 ? editedAuthors : undefined;
    } else if (editGroup === 'edition') {
      entry.language = fieldText(editLanguage);
      entry.published = fieldText(editPublished);
      entry.publisher = fieldText(editPublisher);
      entry.identifier = fieldText(editIdentifier);
    } else if (editGroup === 'tags') {
      const editedTags = splitList(editTags);
      entry.tags = editedTags.length > 0 ? editedTags : undefined;
    }
    onSaveProperties(entry);
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
    Шапка страницы книги: возврат к списку слева. Имя книги не дублируется
    здесь: оно и есть заголовок карточки. Правка — в шапках разделов свойств:
    правится группа, а не вся страница.
  -->
  <header
    class="flex flex-none items-center gap-3 border-b border-[var(--border)] bg-[var(--panel)] px-4 py-2.5 md:px-6"
  >
    <Button variant="ghost" size="sm" ariaLabel={t('app.library.book.back')} onclick={onClose}>
      <Icon name="chevron-left" />
      {t('app.library.book.back')}
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
        {t('app.library.book.formatUnsupported')}
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

        <!--
          Свойства книги: разделы закрыты, пока пользователь сам не раскроет.
          Показываются только заполненные строки — пустых заглушек нет, а
          правится группа целиком, а не вся страница.
        -->
        <div class="flex flex-col gap-1" data-testid="book-properties">
          {#each sections as section (section.id)}
            <Disclosure
              bind:open={openSections[section.id]}
              title={section.title}
              testId="book-section-{section.id}"
            >
              {#snippet actions()}
                {#if section.id !== 'file'}
                  <IconButton
                    action="edit"
                    size="sm"
                    title={t('app.library.book.edit')}
                    ariaLabel={t('app.library.book.edit')}
                    onclick={() => openGroup(section.id as EditGroup)}
                  />
                {/if}
              {/snippet}
              <dl
                class="m-0 flex flex-col overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)]"
              >
                {#each section.rows as row (row.id)}
                  <div
                    class="flex flex-col gap-1 border-b border-[var(--divider)] px-3 py-2.5 last:border-b-0 sm:flex-row sm:items-center sm:gap-4"
                  >
                    <dt class="w-[7.5rem] shrink-0 role-caption text-[var(--muted-foreground)]">
                      {row.label}
                    </dt>
                    <dd
                      class="m-0 min-w-0 flex-1 break-words role-body"
                      class:font-mono={row.mono}
                      data-testid="book-property-{row.id}"
                    >
                      {row.text}
                    </dd>
                    {#if row.mono}
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
                    {/if}
                  </div>
                {/each}
              </dl>
            </Disclosure>
          {/each}

          {#if description}
            <Disclosure
              bind:open={openSections.description}
              title={t('app.library.book.description')}
              testId="book-section-description"
            >
              <p
                class="m-0 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 role-body"
                data-testid="book-description"
              >
                {description}
              </p>
            </Disclosure>
          {/if}
        </div>

        {#if openError}
          <ErrorState message={openError} />
        {/if}
      </div>
    </div>
  </div>

  <!--
    Правка выбранной группы: пустое поле оставляет значение из файла,
    «Взять из файла» убирает правку книги целиком. Файл не меняется.
  -->
  <Dialog bind:open={editing} title={editTitleText}>
    <div class="flex flex-col gap-3" data-testid="book-edit-form">
      {#if editGroup === 'main'}
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
      {:else if editGroup === 'edition'}
        <Input
          bind:value={editLanguage}
          placeholder={t('app.library.book.field.language')}
          ariaLabel={t('app.library.book.field.language')}
        />
        <Input
          bind:value={editPublished}
          placeholder={t('app.library.book.field.published')}
          ariaLabel={t('app.library.book.field.published')}
        />
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
      {:else}
        <Input
          bind:value={editTags}
          placeholder={t('app.library.book.field.tags')}
          ariaLabel={t('app.library.book.field.tags')}
        />
      {/if}
      <div class="flex flex-wrap items-center justify-between gap-2 pt-1">
        <Button variant="ghost" size="sm" testId="book-edit-reset" onclick={resetToFile}>
          {t('app.library.book.reset')}
        </Button>
        <Button variant="primary" size="sm" testId="book-edit-save" onclick={submitGroup}>
          {t('app.library.book.save')}
        </Button>
      </div>
    </div>
  </Dialog>
</div>
