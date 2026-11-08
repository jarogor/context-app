<script lang="ts">
  import { untrack } from 'svelte';
  import { BookCover, Button, ErrorState, Icon, Input, Textarea } from '@context/ui';
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
  const authors = $derived(book.authors.map((author) => author.name));

  /** Теги книги. */
  const tags = $derived(book.tags.map((tag) => tag.name));

  /** Дата выхода книги. */
  const published = $derived(formatPublishedDate(book.published));

  /** Подсказка кнопки чтения: называет рабочее место, куда пойдёт книга. */
  const readHint = $derived(
    targetWorkspaceName
      ? t('app.library.book.readIn', { name: targetWorkspaceName })
      : t('app.library.book.readHint'),
  );

  /** Дата добавления файла в библиотеку. */
  const added = $derived(book.addedAtMillis ? formatDateTime(book.addedAtMillis) : '');

  /** Описание книги. */
  const description = $derived(book.description?.trim() ?? '');

  /** Есть ли у книги правка, которую можно снять. */
  const hasOverrides = $derived(
    userEntry.title !== undefined ||
      (userEntry.authors?.length ?? 0) > 0 ||
      userEntry.language !== undefined ||
      userEntry.published !== undefined ||
      userEntry.publisher !== undefined ||
      userEntry.identifier !== undefined ||
      userEntry.description !== undefined ||
      (userEntry.tags?.length ?? 0) > 0,
  );

  /** Режим правки сведений: включён переключателем в шапке. */
  let editing = $state(false);

  /** Поле, открытое для правки по месту (или null). */
  let activeField = $state<string | null>(null);

  /** Значение поля в правке. */
  let draft = $state('');

  /** Сохранение открытого поля: у каждого поля своё. */
  let activeCommit: (() => void) | null = null;

  /** Поле ввода однострочного значения. */
  let fieldInput = $state<HTMLInputElement | undefined>();

  /** Поле ввода описания. */
  let fieldArea = $state<HTMLTextAreaElement | undefined>();

  /** Черновик нового автора. */
  let newAuthor = $state('');

  /** Черновик нового тега. */
  let newTag = $state('');

  /** Ссылка-кнопка: выглядит текстом, но остаётся настоящей кнопкой. */
  const linkClass =
    'cursor-pointer rounded-[var(--radius)] bg-transparent text-left underline-offset-2 [font:inherit] hover:text-[var(--primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]';

  /** Компактная кнопка правки поля: одна и та же на всей странице. */
  const fieldButtonClass = 'h-7 shrink-0 px-1.5';

  /** Тег книги: компактная метка-переход к списку книг с тем же тегом. */
  const tagClass =
    'cursor-pointer rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-sm text-[var(--muted-foreground)] transition-colors [font:inherit] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none';

  /** Подпись поля правки: «Изменить: <поле>». */
  function editLabel(field: string): string {
    return t('app.library.book.editField', { field });
  }

  /** Открытие правки поля по месту. */
  function startField(id: string, value: string, commit: () => void) {
    activeField = id;
    draft = value;
    activeCommit = commit;
  }

  /** Сохранение открытого поля. */
  function commitActive() {
    const commit = activeCommit;
    activeCommit = null;
    activeField = null;
    commit?.();
  }

  /** Отказ от правки поля без сохранения. */
  function cancelActive() {
    activeCommit = null;
    activeField = null;
    draft = '';
  }

  /** Enter сохраняет однострочное поле; Shift+Enter остаётся переносом строки. */
  function onFieldKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      commitActive();
    }
  }

  /** Непустое значение поля; пустое означает «как в файле». */
  function fieldText(value: string): string | undefined {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }

  /** Правка книги с изменением одного или нескольких полей. */
  function applyPatch(patch: Partial<BookPropertyEntry>) {
    onSaveProperties({
      title: userEntry.title,
      authors: userEntry.authors,
      language: userEntry.language,
      published: userEntry.published,
      publisher: userEntry.publisher,
      identifier: userEntry.identifier,
      description: userEntry.description,
      tags: userEntry.tags,
      ...patch,
    });
  }

  /** Правка названия. */
  function editTitle() {
    startField('title', book.title, () => applyPatch({ title: fieldText(draft) }));
  }

  /** Правка описания. */
  function editDescription() {
    startField('description', description, () =>
      applyPatch({ description: fieldText(draft) }),
    );
  }

  /** Правка языка. */
  function editLanguage() {
    startField('language', book.language ?? '', () =>
      applyPatch({ language: fieldText(draft) }),
    );
  }

  /** Правка даты выхода. */
  function editPublished() {
    startField('published', book.published ?? '', () =>
      applyPatch({ published: fieldText(draft) }),
    );
  }

  /** Правка издателя. */
  function editPublisher() {
    startField('publisher', book.publisher ?? '', () =>
      applyPatch({ publisher: fieldText(draft) }),
    );
  }

  /** Правка идентификатора издания. */
  function editIdentifier() {
    startField('identifier', book.identifier ?? '', () =>
      applyPatch({ identifier: fieldText(draft) }),
    );
  }

  /** Правка одного автора; пустое значение убирает его из списка. */
  function editAuthor(index: number) {
    startField(`author-${index}`, authors[index] ?? '', () => {
      const next = [...authors];
      const value = draft.trim();
      if (value) {
        next[index] = value;
      } else {
        next.splice(index, 1);
      }
      applyPatch({ authors: next.length > 0 ? next : undefined });
    });
  }

  /** Удаление автора из списка. */
  function removeAuthor(index: number) {
    const next = authors.filter((_, position) => position !== index);
    applyPatch({ authors: next.length > 0 ? next : undefined });
  }

  /** Добавление автора в конец списка. */
  function addAuthor() {
    const value = newAuthor.trim();
    if (!value) {
      return;
    }
    applyPatch({ authors: [...authors, value] });
    newAuthor = '';
  }

  /** Правка одного тега; пустое значение убирает его из списка. */
  function editTag(index: number) {
    startField(`tag-${index}`, tags[index] ?? '', () => {
      const next = [...tags];
      const value = draft.trim();
      if (value) {
        next[index] = value;
      } else {
        next.splice(index, 1);
      }
      applyPatch({ tags: next.length > 0 ? next : undefined });
    });
  }

  /** Удаление тега из списка. */
  function removeTag(index: number) {
    const next = tags.filter((_, position) => position !== index);
    applyPatch({ tags: next.length > 0 ? next : undefined });
  }

  /** Добавление тега в конец списка. */
  function addTag() {
    const value = newTag.trim();
    if (!value) {
      return;
    }
    applyPatch({ tags: [...tags, value] });
    newTag = '';
  }

  /** Возврат к значениям файла. */
  function resetToFile() {
    onResetProperties();
  }

  /** Смена книги закрывает правку: поля прежней книги к новой не относятся. */
  $effect(() => {
    void book.id;
    untrack(() => {
      editing = false;
      cancelActive();
    });
  });

  /** Фокус в поле правки сразу после его открытия. */
  $effect(() => {
    if (activeField === null) {
      return;
    }
    const element = fieldInput ?? fieldArea;
    if (!element) {
      return;
    }
    element.focus();
    if (element instanceof HTMLInputElement) {
      element.select();
    }
  });

  // Escape закрывает поле правки, а если оно не открыто — режим правки.
  $effect(() => {
    if (activeField !== null) {
      return pushDismissLayer(cancelActive);
    }
    if (editing) {
      return pushDismissLayer(() => (editing = false));
    }
  });
</script>


{#snippet fieldActions(label: string, onclick: () => void)}
  <Button
    variant="ghost"
    size="sm"
    class={fieldButtonClass}
    title={editLabel(label)}
    ariaLabel={editLabel(label)}
    {onclick}
  >
    <Icon name="pencil" class="h-3.5 w-3.5" />
  </Button>
{/snippet}

{#snippet editor(label: string, save: () => void, multiline = false)}
  <div class="flex w-full min-w-0 flex-col gap-2">
    {#if multiline}
      <Textarea
        bind:value={draft}
        bind:element={fieldArea}
        ariaLabel={label}
        rows={6}
        onkeydown={onFieldKeydown}
      />
    {:else}
      <Input
        bind:value={draft}
        bind:element={fieldInput}
        ariaLabel={label}
        onkeydown={onFieldKeydown}
      />
    {/if}
    <div class="flex flex-wrap items-center gap-2">
      <Button variant="primary" size="sm" testId="book-edit-save" onclick={save}>
        {t('app.library.book.save')}
      </Button>
      <Button variant="ghost" size="sm" onclick={cancelActive}>
        {t('app.action.undo')}
      </Button>
    </div>
  </div>
{/snippet}

<div class="@container flex min-h-0 min-w-0 flex-1 flex-col" data-testid="book-page">
  <!--
    Шапка страницы книги: возврат к списку, сброс правок и переключатель режима
    правки. Правка идёт по месту и по одному полю, поэтому здесь только режим,
    а не форма: страница остаётся той же, меняются лишь значения.
  -->
  <header
    class="flex flex-none flex-wrap items-center gap-2 border-b border-[var(--border)] bg-[var(--background)] px-4 py-2 md:px-6"
  >
    <Button variant="ghost" size="sm" ariaLabel={t('app.library.book.back')} onclick={onClose}>
      <Icon name="chevron-left" />
      {t('app.library.book.back')}
    </Button>
    <div class="ml-auto flex flex-wrap items-center gap-2">
      {#if editing && hasOverrides}
        <Button variant="ghost" size="sm" testId="book-edit-reset" onclick={resetToFile}>
          <Icon name="refresh" />
          {t('app.library.book.reset')}
        </Button>
      {/if}
      <Button
        variant={editing ? 'primary' : 'secondary'}
        size="sm"
        ariaPressed={editing}
        testId="book-edit-toggle"
        title={editing ? t('app.library.book.editDone') : t('app.library.book.edit')}
        onclick={() => {
          editing = !editing;
          cancelActive();
        }}
      >
        <Icon name={editing ? 'check' : 'pencil'} />
        {editing ? t('app.library.book.editDone') : t('app.library.book.edit')}
      </Button>
    </div>
  </header>

  <div class="min-h-0 flex-1 overflow-y-auto">
    <!--
      Три компоновки одной разметки, без отдельных мобильных копий.
      Телефон: обложка рядом с титулом, действия во всю ширину, ниже главное
      содержание (описание и теги), последними — сведения и файл.
      Планшет: та же последовательность, но обложка шире и действия стоят
      справа от неё.
      Широкое окно: обложка и сведения — левая колонка, титул, действия и
      описание — правая. Обёртки колонок на узком окне «растворяются»
      (`contents`), поэтому разметка одна, а порядок блоков задаёт сетка.
    -->
    <div
      class="mx-auto grid w-full max-w-[68rem] grid-cols-[6.5rem_minmax(0,1fr)] items-start gap-x-4 gap-y-6 px-4 py-6 [grid-template-areas:'cover_head'_'actions_actions'_'body_body'_'meta_meta'] md:px-8 md:py-8 @min-[34rem]:grid-cols-[9rem_minmax(0,1fr)] @min-[34rem]:gap-x-6 @min-[34rem]:[grid-template-areas:'cover_head'_'cover_actions'_'body_body'_'meta_meta'] @min-[56rem]:flex @min-[56rem]:items-start @min-[56rem]:gap-10"
    >
      <div
        class="contents @min-[56rem]:flex @min-[56rem]:w-[14rem] @min-[56rem]:shrink-0 @min-[56rem]:flex-col @min-[56rem]:gap-8"
      >
        <div class="w-full [grid-area:cover]">
          <BookCover src={book.coverUri ?? null} class="rounded-[var(--radius)]" />
        </div>

        <!--
          Сведения: в левой колонке под обложкой — так они не оттесняют
          описание. На телефоне идут последними, после содержания.
        -->
        <div class="flex min-w-0 flex-col gap-6 [grid-area:meta]">
          {#if published || book.language || book.publisher || book.identifier || editing}
            <section class="flex min-w-0 flex-col gap-3" aria-labelledby="book-details-title">
              <h2 id="book-details-title" class="role-title text-[var(--foreground)]">
                {t('app.library.book.details')}
              </h2>
              <dl class="m-0 flex min-w-0 flex-col gap-3" data-testid="book-properties">
                {#if published || editing}
                  <div class="flex min-w-0 flex-col gap-0.5">
                    <dt class="role-caption text-[var(--muted-foreground)]">
                      {t('app.library.book.published')}
                    </dt>
                    {#if activeField === 'published'}
                      <dd class="m-0">
                        {@render editor(
                          t('app.library.book.field.published'),
                          () => commitActive(),
                        )}
                      </dd>
                    {:else}
                      <dd class="m-0 flex min-w-0 items-center gap-1">
                        <span
                          class="min-w-0 break-words role-body"
                          data-testid="book-property-published">{published || '—'}</span
                        >
                        {#if editing}
                          {@render fieldActions(
                            t('app.library.book.field.published'),
                            editPublished,
                          )}
                        {/if}
                      </dd>
                    {/if}
                  </div>
                {/if}

                {#if book.language || editing}
                  <div class="flex min-w-0 flex-col gap-0.5">
                    <dt class="role-caption text-[var(--muted-foreground)]">
                      {t('app.library.book.language')}
                    </dt>
                    {#if activeField === 'language'}
                      <dd class="m-0">
                        {@render editor(
                          t('app.library.book.field.language'),
                          () => commitActive(),
                        )}
                      </dd>
                    {:else}
                      <dd class="m-0 flex min-w-0 items-center gap-1">
                        {#if book.language}
                          <button
                            type="button"
                            class="{linkClass} min-w-0 break-words role-body"
                            title={t('app.library.book.filterBy', { value: book.language })}
                            data-testid="book-property-language"
                            onclick={() => onFilterBy('language', book.language as string)}
                          >
                            {book.language}
                          </button>
                        {:else}
                          <span class="min-w-0 role-body text-[var(--muted-foreground)]">—</span>
                        {/if}
                        {#if editing}
                          {@render fieldActions(
                            t('app.library.book.field.language'),
                            editLanguage,
                          )}
                        {/if}
                      </dd>
                    {/if}
                  </div>
                {/if}

                {#if book.publisher || editing}
                  <div class="flex min-w-0 flex-col gap-0.5">
                    <dt class="role-caption text-[var(--muted-foreground)]">
                      {t('app.library.book.publisher')}
                    </dt>
                    {#if activeField === 'publisher'}
                      <dd class="m-0">
                        {@render editor(
                          t('app.library.book.field.publisher'),
                          () => commitActive(),
                        )}
                      </dd>
                    {:else}
                      <dd class="m-0 flex min-w-0 items-center gap-1">
                        <span
                          class="min-w-0 break-words role-body"
                          data-testid="book-property-publisher">{book.publisher || '—'}</span
                        >
                        {#if editing}
                          {@render fieldActions(
                            t('app.library.book.field.publisher'),
                            editPublisher,
                          )}
                        {/if}
                      </dd>
                    {/if}
                  </div>
                {/if}

                {#if book.identifier || editing}
                  <div class="flex min-w-0 flex-col gap-0.5">
                    <dt class="role-caption text-[var(--muted-foreground)]">
                      {t('app.library.book.identifier')}
                    </dt>
                    {#if activeField === 'identifier'}
                      <dd class="m-0">
                        {@render editor(
                          t('app.library.book.field.identifier'),
                          () => commitActive(),
                        )}
                      </dd>
                    {:else}
                      <dd class="m-0 flex min-w-0 items-center gap-1">
                        <span
                          class="min-w-0 break-words role-body"
                          data-testid="book-property-identifier">{book.identifier || '—'}</span
                        >
                        {#if editing}
                          {@render fieldActions(
                            t('app.library.book.field.identifier'),
                            editIdentifier,
                          )}
                        {/if}
                      </dd>
                    {/if}
                  </div>
                {/if}
              </dl>
            </section>
          {/if}

        </div>
      </div>

      <div
        class="contents @min-[56rem]:flex @min-[56rem]:min-w-0 @min-[56rem]:flex-1 @min-[56rem]:flex-col @min-[56rem]:gap-8"
      >
        <!-- Титул: автор и название. -->
        <div class="flex min-w-0 flex-col gap-1 [grid-area:head]">
          {#if editing}
            <div class="flex flex-col gap-2" data-testid="book-authors-edit">
              <span class="role-caption text-[var(--muted-foreground)]">
                {t('app.library.book.authors')}
              </span>
              {#each authors as author, index (index)}
                {#if activeField === `author-${index}`}
                  {@render editor(t('app.library.book.field.author'), () => commitActive())}
                {:else}
                  <div
                    class="flex min-w-0 items-center gap-1"
                    data-testid="book-author-{index}"
                  >
                    <span class="min-w-0 break-words text-sm">{author}</span>
                    <span class="flex shrink-0 items-center gap-1">
                      {@render fieldActions(
                        t('app.library.book.field.author'),
                        () => editAuthor(index),
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        class={fieldButtonClass}
                        title={t('app.library.book.removeAuthor')}
                        ariaLabel={t('app.library.book.removeAuthor')}
                        testId="book-author-remove-{index}"
                        onclick={() => removeAuthor(index)}
                      >
                        <Icon name="close" class="h-3.5 w-3.5" />
                      </Button>
                    </span>
                  </div>
                {/if}
              {/each}
              <div class="flex min-w-0 items-center gap-2">
                <Input
                  bind:value={newAuthor}
                  ariaLabel={t('app.library.book.addAuthor')}
                  placeholder={t('app.library.book.addAuthor')}
                  onkeydown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addAuthor();
                    }
                  }}
                />
                <Button
                  variant="secondary"
                  size="icon"
                  title={t('app.library.book.addAuthor')}
                  ariaLabel={t('app.library.book.addAuthor')}
                  testId="book-author-add"
                  disabled={!newAuthor.trim()}
                  onclick={addAuthor}
                >
                  <Icon name="plus" />
                </Button>
              </div>
            </div>
          {:else if authors.length > 0}
            <p class="m-0 role-body text-[var(--muted-foreground)]">
              <button
                type="button"
                class={linkClass}
                title={t('app.library.book.filterBy', { value: authors.join(', ') })}
                data-testid="book-author-link"
                onclick={() => onFilterBy('author', authors[0])}
              >
                {authors.join(', ')}
              </button>
            </p>
          {/if}

          {#if activeField === 'title'}
            {@render editor(t('app.library.book.field.title'), () => commitActive())}
          {:else}
            <div class="flex min-w-0 flex-wrap items-start gap-1">
              <h1 class="min-w-0 role-display text-[var(--foreground)]" data-testid="book-title">
                {book.title}
              </h1>
              {#if editing}
                {@render fieldActions(t('app.library.book.field.title'), editTitle)}
              {/if}
            </div>
          {/if}
        </div>

        <!-- Действия: все файлы книги равноправны, без «основного» формата. -->
        <div class="flex min-w-0 flex-col gap-3 [grid-area:actions]">
          {#if formatsLoading}
            <div
              class="flex flex-col gap-2"
              role="status"
              aria-label={t('app.loading')}
              data-testid="book-formats-loading"
            >
              <span
                class="h-9 w-full max-w-[18rem] animate-pulse rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)]"
                aria-hidden="true"
              ></span>
              <span
                class="h-9 w-full max-w-[18rem] animate-pulse rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)]"
                aria-hidden="true"
              ></span>
            </div>
          {:else if formats.length > 0}
            <div class="flex flex-col gap-2" data-testid="book-formats">
              {#each formats as entry (entry.format)}
                <div
                  class="flex flex-wrap items-center gap-2"
                  data-testid="book-format-{entry.format}"
                >
                  <!--
                    Метка формата — той же высоты и кегля, что и кнопки рядом:
                    это часть строки действия, а не подпись под ней. Нажатие
                    оставляет в библиотеке книги того же формата.
                  -->
                  <button
                    type="button"
                    class="inline-flex h-9 min-w-[4.5rem] cursor-pointer items-center justify-center rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] px-3 text-sm font-medium tracking-[0.04em] text-[var(--foreground)] transition-colors [font:inherit] hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none"
                    title={t('app.library.book.filterBy', { value: entry.format.toUpperCase() })}
                    data-testid="book-format-link-{entry.format}"
                    onclick={() => onFilterBy('format', entry.format)}
                  >
                    {entry.format.toUpperCase()}
                  </button>
                  {#if entry.readable}
                    <Button
                      variant="primary"
                      title={readHint}
                      testId="book-read-{entry.format}"
                      onclick={() => onAdd(entry.format)}
                    >
                      <Icon name="book" />
                      {t('app.library.book.read')}
                    </Button>
                  {/if}
                  <Button
                    variant="secondary"
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

          {#if !formatsLoading && !canRead}
            <p
              class="flex items-start gap-2 role-body text-[var(--warning)]"
              data-testid="book-unsupported"
            >
              <Icon name="flag" class="mt-0.5 h-4 w-4 shrink-0" />
              <span>{t('app.library.book.formatUnsupported')}</span>
            </p>
          {/if}
        </div>

        <!-- Описание и теги: главное содержание страницы. -->
        <div class="flex min-w-0 flex-col gap-6 [grid-area:body]">
          {#if description || editing}
            <section class="flex min-w-0 flex-col gap-2" aria-labelledby="book-about-title">
              <div class="flex min-w-0 items-center gap-1">
                <h2 id="book-about-title" class="role-title text-[var(--foreground)]">
                  {t('app.library.book.about')}
                </h2>
                {#if editing && activeField !== 'description'}
                  {@render fieldActions(t('app.library.book.field.description'), editDescription)}
                {/if}
              </div>
              {#if activeField === 'description'}
                {@render editor(t('app.library.book.description'), () => commitActive(), true)}
              {:else if description}
                <p
                  class="m-0 max-w-[68ch] break-words whitespace-pre-line role-body text-[var(--foreground)]"
                  data-testid="book-description"
                >
                  {description}
                </p>
              {:else if editing}
                <button type="button" class={linkClass} onclick={editDescription}>
                  {t('app.library.book.addDescription')}
                </button>
              {/if}
            </section>
          {/if}

          {#if tags.length > 0 || editing}
            <section class="flex min-w-0 flex-col gap-2" aria-labelledby="book-tags-title">
              <h2 id="book-tags-title" class="role-title text-[var(--foreground)]">
                {t('app.library.book.tags')}
              </h2>
              {#if editing}
                <div class="flex flex-col gap-2" data-testid="book-tags-edit">
                  {#each tags as tag, index (index)}
                    {#if activeField === `tag-${index}`}
                      {@render editor(t('app.library.book.field.tag'), () => commitActive())}
                    {:else}
                      <div
                        class="flex min-w-0 items-center gap-1"
                        data-testid="book-tag-{index}"
                      >
                        <span class="min-w-0 break-words text-sm">{tag}</span>
                        <span class="flex shrink-0 items-center gap-1">
                          {@render fieldActions(
                            t('app.library.book.field.tag'),
                            () => editTag(index),
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            class={fieldButtonClass}
                            title={t('app.library.book.removeTag')}
                            ariaLabel={t('app.library.book.removeTag')}
                            testId="book-tag-remove-{index}"
                            onclick={() => removeTag(index)}
                          >
                            <Icon name="close" class="h-3.5 w-3.5" />
                          </Button>
                        </span>
                      </div>
                    {/if}
                  {/each}
                  <div class="flex min-w-0 items-center gap-2">
                    <Input
                      bind:value={newTag}
                      ariaLabel={t('app.library.book.addTag')}
                      placeholder={t('app.library.book.addTag')}
                      onkeydown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          addTag();
                        }
                      }}
                    />
                    <Button
                      variant="secondary"
                      size="icon"
                      title={t('app.library.book.addTag')}
                      ariaLabel={t('app.library.book.addTag')}
                      testId="book-tag-add"
                      disabled={!newTag.trim()}
                      onclick={addTag}
                    >
                      <Icon name="plus" />
                    </Button>
                  </div>
                </div>
              {:else}
                <div
                  class="flex flex-wrap items-center gap-2"
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
            </section>
          {/if}

          {#if openError}
            <ErrorState message={openError} />
          {/if}

          {#if path || book.size !== undefined || added}
            <section class="flex min-w-0 flex-col gap-2" data-testid="book-file">
              <h2 class="role-title text-[var(--foreground)]">
                {t('app.library.book.fileDetails')}
              </h2>
              {#if path}
                <p
                  class="m-0 break-all font-mono text-xs text-[var(--muted-foreground)]"
                  data-testid="book-property-path"
                >
                  {path}
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  class="self-start"
                  title={t('app.library.book.openFolder')}
                  testId="book-open-folder"
                  onclick={onOpenFolder}
                >
                  <Icon name="folder" />
                  {t('app.library.book.openFolder')}
                </Button>
              {/if}
              <dl class="m-0 flex flex-col gap-2 role-caption text-[var(--muted-foreground)]">
                {#if book.size !== undefined}
                  <div class="flex flex-col gap-0.5">
                    <dt>{t('app.library.book.size')}</dt>
                    <dd class="m-0" data-testid="book-property-size">{formatBytes(book.size)}</dd>
                  </div>
                {/if}
                {#if added}
                  <div class="flex flex-col gap-0.5">
                    <dt>{t('app.library.book.added')}</dt>
                    <dd class="m-0" data-testid="book-property-added">{added}</dd>
                  </div>
                {/if}
              </dl>
            </section>
          {/if}
        </div>
      </div>
    </div>
  </div>
</div>
