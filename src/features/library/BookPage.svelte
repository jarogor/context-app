<script lang="ts">
  import { Badge, BookCover, Button, ErrorState, Icon } from '@context/ui';
  import { t } from '@context/i18n';
  import { formatBytes } from '../../shared/format';
  import { formatPublishedDate, type BookFormatInfo, type BookWithCover } from './library';

  interface Props {
    /** Открытая книга. */
    book: BookWithCover;
    /** Абсолютный путь файла книги. */
    path: string;
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
    /** Открытие файла заданного формата вкладкой рабочего места. */
    onAdd: (format: string) => void;
    /** Открытие файла заданного формата. */
    onOpen: (format: string) => void;
  }

  let {
    book,
    path,
    formats,
    canRead,
    openingFormat,
    openError,
    onClose,
    onOpenFolder,
    onAdd,
    onOpen,
  }: Props = $props();

  /** Авторы одной строкой. */
  const authors = $derived(book.authors.map((author) => author.name).join(', '));

  /** Серии одной строкой. */
  const series = $derived(book.series.map((entry) => entry.series.name).join(', '));

  /** Теги источника одной строкой. */
  const tags = $derived(book.tags.map((tag) => tag.name).join(', '));

  /** Форматы файлов книги списком. */
  const formatsText = $derived(
    [...new Set(book.files.filter((file) => file.kind === 'book').map((file) => file.format))]
      .filter(Boolean)
      .map((format) => format.toUpperCase())
      .join(', '),
  );

  /** Подпись значения: пустое свойство читается как «не указано». */
  const value = (text: string | undefined): string =>
    text && text.trim() ? text.trim() : t('app.library.book.notSpecified');

  /** Строка свойств: подпись, значение и признак пустоты. */
  interface PropertyRow {
    /** Идентификатор свойства (метка для тестов). */
    id: string;
    /** Подпись свойства. */
    label: string;
    /** Значение либо «не указано». */
    text: string;
    /** Свойство не заполнено источником. */
    empty: boolean;
    /** Моноширинный текст (путь к файлу). */
    mono?: boolean;
  }

  /** Секция свойств книги. */
  interface PropertySection {
    /** Заголовок секции. */
    title: string;
    /** Строки секции. */
    rows: PropertyRow[];
  }

  /** Свойства книги по секциям: основное, файл, издание. */
  const sections = $derived<PropertySection[]>([
    {
      title: t('app.library.book.section.main'),
      rows: [
        { id: 'authors', label: t('app.library.book.authors'), text: value(authors), empty: !authors },
        { id: 'format', label: t('app.library.book.format'), text: value(formatsText), empty: !formatsText },
        { id: 'series', label: t('app.library.book.series'), text: value(series), empty: !series },
        { id: 'tags', label: t('app.library.book.tags'), text: value(tags), empty: !tags },
      ],
    },
    {
      title: t('app.library.book.section.file'),
      rows: [
        {
          id: 'size',
          label: t('app.library.book.size'),
          text: value(formatBytes(book.size)),
          empty: book.size === undefined,
        },
        { id: 'path', label: t('app.library.book.path'), text: value(path), empty: !path, mono: true },
      ],
    },
    {
      title: t('app.library.book.section.edition'),
      rows: [
        {
          id: 'published',
          label: t('app.library.book.published'),
          text: value(formatPublishedDate(book.published)),
          empty: !book.published,
        },
        { id: 'language', label: t('app.library.book.language'), text: value(book.language), empty: !book.language },
        {
          id: 'publisher',
          label: t('app.library.book.publisher'),
          text: value(book.publisher),
          empty: !book.publisher,
        },
        {
          id: 'identifier',
          label: t('app.library.book.identifier'),
          text: value(book.identifier),
          empty: !book.identifier,
        },
      ],
    },
  ]);

  /** Описание книги отдельным блоком: это текст, а не строка таблицы. */
  const description = $derived(book.description?.trim() ?? '');
</script>

<div class="@container flex min-h-0 min-w-0 flex-1 flex-col" data-testid="book-page">
  <!--
    Шапка страницы книги: возврат к списку слева. Имя книги не дублируется
    здесь: оно и есть заголовок карточки.
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
          Свойства книги: источник наполняет то, что умеет извлечь из файла, а
          незаполненное честно читается как «не указано» — пустых обещаний нет.
        -->
        <div class="flex flex-col gap-4" data-testid="book-properties">
          {#each sections as section (section.title)}
            <section class="flex flex-col gap-1.5">
              <h2 class="role-caption text-[var(--muted-foreground)]">{section.title}</h2>
              <dl
                class="m-0 flex flex-col overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)]"
              >
                {#each section.rows as row (row.id)}
                  <div
                    class="flex flex-col gap-1 border-b border-[var(--divider)] px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:gap-4"
                  >
                    <dt class="w-[7.5rem] shrink-0 role-caption text-[var(--muted-foreground)]">
                      {row.label}
                    </dt>
                    <dd
                      class="m-0 min-w-0 flex-1 break-words role-body"
                      class:text-[var(--muted-foreground)]={row.empty}
                      class:font-mono={row.mono}
                      data-testid="book-property-{row.id}"
                    >
                      {row.text}
                    </dd>
                    {#if row.mono && !row.empty}
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
            </section>
          {/each}

          {#if description}
            <section class="flex flex-col gap-1.5">
              <h2 class="role-caption text-[var(--muted-foreground)]">
                {t('app.library.book.description')}
              </h2>
              <p
                class="m-0 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] px-4 py-3 role-body"
                data-testid="book-description"
              >
                {description}
              </p>
            </section>
          {/if}
        </div>

        {#if openError}
          <ErrorState message={openError} />
        {/if}
      </div>
    </div>
  </div>
</div>
