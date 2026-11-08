<script lang="ts">
  import { untrack } from 'svelte';
  import { BookCover, Button, ErrorState, Icon, Input, PathField, Textarea } from '@context/ui';
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

  /**
   * Ссылка-кнопка: выглядит текстом, но остаётся настоящей кнопкой.
   *
   * Все кликабельные значения страницы — автор, теги, форматы, язык — выглядят
   * одинаково: линия точками показывает, что это переход. Толщина линии задана
   * числом, а не наследуется от кегля, поэтому у крупного автора точки того же
   * размера, что у мелких тегов.
   */
  const linkClass =
    'cursor-pointer bg-transparent text-left underline decoration-dotted decoration-[var(--muted-foreground)] decoration-[1px] underline-offset-[0.3em] transition-colors [font:inherit] hover:text-[var(--primary)] hover:decoration-[var(--primary)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none';

  /** Компактная кнопка правки поля: одна и та же на всей странице. */
  const fieldButtonClass = 'h-7 shrink-0 px-1.5';

  /** Тег книги: та же ссылка-переход, что автор и формат, — один стиль на странице. */
  const tagClass = linkClass;

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

  /** Отмена режима правки: открытое поле закрывается без сохранения. */
  function cancelEditing() {
    cancelActive();
    editing = false;
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
      <Button
        variant="primary"
        size="icon"
        title={t('app.library.book.save')}
        ariaLabel={t('app.library.book.save')}
        testId="book-edit-save"
        onclick={save}
      >
        <Icon name="check" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        title={t('app.action.undo')}
        ariaLabel={t('app.action.undo')}
        onclick={cancelActive}
      >
        <Icon name="close" />
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
      {#if editing}
        <Button
          variant="ghost"
          size="icon"
          title={t('app.action.undo')}
          ariaLabel={t('app.action.undo')}
          testId="book-edit-cancel"
          onclick={cancelEditing}
        >
          <Icon name="close" />
        </Button>
      {/if}
      <Button
        variant={editing ? 'primary' : 'secondary'}
        size="icon"
        ariaPressed={editing}
        title={editing ? t('app.library.book.editDone') : t('app.library.book.edit')}
        ariaLabel={editing ? t('app.library.book.editDone') : t('app.library.book.edit')}
        testId="book-edit-toggle"
        onclick={() => (editing ? cancelEditing() : (editing = true))}
      >
        <Icon name={editing ? 'check' : 'pencil'} />
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
      class="mx-auto grid w-full max-w-[var(--book-page-max-width)] grid-cols-[6.5rem_minmax(0,1fr)] items-start gap-x-4 gap-y-6 px-4 py-6 [grid-template-areas:'cover_head'_'actions_actions'_'body_body'_'meta_meta'] md:px-8 md:py-8 @min-[34rem]:grid-cols-[9rem_minmax(0,1fr)] @min-[34rem]:gap-x-6 @min-[34rem]:[grid-template-areas:'cover_head'_'cover_actions'_'body_body'_'meta_meta'] @min-[56rem]:flex @min-[56rem]:items-start @min-[56rem]:gap-10 wide:gap-12 ultra:gap-14"
    >
      <div
        class="contents @min-[56rem]:flex @min-[56rem]:w-[14rem] @min-[56rem]:shrink-0 @min-[56rem]:flex-col @min-[56rem]:gap-8 wide:w-[16rem] ultra:w-[18rem]"
      >
        <div class="w-full [grid-area:cover] @min-[56rem]:w-[14rem] wide:w-[16rem] ultra:w-[18rem]">
          <BookCover src={book.coverUri ?? null} class="rounded-[var(--radius)]" />
        </div>

        <!--
          Сведения: в левой колонке под обложкой — так они не оттесняют
          описание. На телефоне идут последними, после содержания.
        -->
        <div class="flex min-w-0 flex-col gap-6 [grid-area:meta]">
          {#if published || book.language || book.publisher || book.identifier || editing}
            <section class="flex min-w-0 flex-col gap-3" aria-label={t('app.library.book.details')}>
              <dl class="m-0 flex min-w-0 flex-col gap-3" data-testid="book-properties">
                {#if published || editing}
                  <div class="flex min-w-0 flex-col gap-0.5">
                    <dt
                      class="flex min-w-0 items-center gap-2 role-caption text-[var(--muted-foreground)]"
                    >
                      <span class="shrink-0">{t('app.library.book.published')}</span>
                      <span
                        class="min-w-6 flex-1 border-b border-[var(--divider)]"
                        aria-hidden="true"
                      ></span>
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
                        {#if editing}
                          {@render fieldActions(
                            t('app.library.book.field.published'),
                            editPublished,
                          )}
                        {/if}
                        <span
                          class="min-w-0 break-words role-body"
                          data-testid="book-property-published">{published || '—'}</span
                        >
                      </dd>
                    {/if}
                  </div>
                {/if}

                {#if book.language || editing}
                  <div class="flex min-w-0 flex-col gap-0.5">
                    <dt
                      class="flex min-w-0 items-center gap-2 role-caption text-[var(--muted-foreground)]"
                    >
                      <span class="shrink-0">{t('app.library.book.language')}</span>
                      <span
                        class="min-w-6 flex-1 border-b border-[var(--divider)]"
                        aria-hidden="true"
                      ></span>
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
                        {#if editing}
                          {@render fieldActions(
                            t('app.library.book.field.language'),
                            editLanguage,
                          )}
                        {/if}
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
                      </dd>
                    {/if}
                  </div>
                {/if}

                {#if book.publisher || editing}
                  <div class="flex min-w-0 flex-col gap-0.5">
                    <dt
                      class="flex min-w-0 items-center gap-2 role-caption text-[var(--muted-foreground)]"
                    >
                      <span class="shrink-0">{t('app.library.book.publisher')}</span>
                      <span
                        class="min-w-6 flex-1 border-b border-[var(--divider)]"
                        aria-hidden="true"
                      ></span>
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
                        {#if editing}
                          {@render fieldActions(
                            t('app.library.book.field.publisher'),
                            editPublisher,
                          )}
                        {/if}
                        <span
                          class="min-w-0 break-words role-body"
                          data-testid="book-property-publisher">{book.publisher || '—'}</span
                        >
                      </dd>
                    {/if}
                  </div>
                {/if}

                {#if book.identifier || editing}
                  <div class="flex min-w-0 flex-col gap-0.5">
                    <dt
                      class="flex min-w-0 items-center gap-2 role-caption text-[var(--muted-foreground)]"
                    >
                      <span class="shrink-0">{t('app.library.book.identifier')}</span>
                      <span
                        class="min-w-6 flex-1 border-b border-[var(--divider)]"
                        aria-hidden="true"
                      ></span>
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
                        {#if editing}
                          {@render fieldActions(
                            t('app.library.book.field.identifier'),
                            editIdentifier,
                          )}
                        {/if}
                        <span
                          class="min-w-0 break-words role-body"
                          data-testid="book-property-identifier">{book.identifier || '—'}</span
                        >
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
        <!-- Титул: автор, название, теги. -->
        <div class="flex min-w-0 flex-col gap-2 [grid-area:head]">
          {#if editing}
            <div class="flex flex-col gap-2" data-testid="book-authors-edit">
              {#each authors as author, index (index)}
                {#if activeField === `author-${index}`}
                  {@render editor(t('app.library.book.field.author'), () => commitActive())}
                {:else}
                  <div class="flex min-w-0 items-center gap-1" data-testid="book-author-{index}">
                    <span class="flex shrink-0 items-center gap-0.5">
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
                    <span class="min-w-0 break-words role-heading">{author}</span>
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
            <p class="m-0 role-heading">
              <button
                type="button"
                class="{linkClass} text-[var(--muted-foreground)]"
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
            <div class="mt-2 flex min-w-0 items-start gap-1">
              {#if editing}
                {@render fieldActions(t('app.library.book.field.title'), editTitle)}
              {/if}
              <h1 class="min-w-0 role-display text-[var(--foreground)]" data-testid="book-title">
                {book.title}
              </h1>
            </div>
          {/if}

          <!--
            Теги — строкой под названием, через запятую, без заголовка:
            перечисление понятно без подписи. В режиме правки здесь же список
            тегов со своими действиями.
          -->
          {#if editing}
            <div
              class="mt-2 flex flex-col gap-2 pt-3"
              data-testid="book-tags-edit"
            >
              {#each tags as tag, index (index)}
                {#if activeField === `tag-${index}`}
                  {@render editor(t('app.library.book.field.tag'), () => commitActive())}
                {:else}
                  <div class="flex min-w-0 items-center gap-1" data-testid="book-tag-{index}">
                    <span class="flex shrink-0 items-center gap-0.5">
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
                    <span class="min-w-0 break-words role-body">{tag}</span>
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
          {:else if tags.length > 0}
            <p
              class="m-0 mt-2 flex flex-wrap items-center pt-3 role-body"
              data-testid="book-tags"
            >
              {#each tags as tag, index (tag)}
                {#if index > 0}
                  <span
                    class="mx-2 text-[var(--muted-foreground)]"
                    aria-hidden="true">·</span
                  >
                {/if}
                <button
                  type="button"
                  class={tagClass}
                  title={t('app.library.book.filterBy', { value: tag })}
                  onclick={() => onFilterBy('tag', tag)}
                >
                  {tag}
                </button>
              {/each}
            </p>
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
            <!--
              Форматы — строки таблицы: слева формат, справа его действия.
              Разделители только между строками, а сама таблица чуть отличается
              от фона врезкой: этого достаточно, чтобы прочитать её как единый
              блок, и мало, чтобы она спорила с содержимым страницы.
            -->
            <div
              class="flex flex-col divide-y divide-[var(--divider)] rounded-[var(--radius)] bg-[var(--surface-inset)]"
              role="list"
              data-testid="book-formats"
            >
              {#each formats as entry (entry.format)}
                <div
                  class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 py-3"
                  role="listitem"
                  data-testid="book-format-{entry.format}"
                >
                  <button
                    type="button"
                    class="{linkClass} text-sm font-medium tracking-[0.04em]"
                    title={t('app.library.book.filterBy', { value: entry.format.toUpperCase() })}
                    data-testid="book-format-link-{entry.format}"
                    onclick={() => onFilterBy('format', entry.format)}
                  >
                    {entry.format.toUpperCase()}
                  </button>
                  <span class="flex shrink-0 items-center gap-2">
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
                      title={t('app.library.book.openHint')}
                      disabled={openingFormat === entry.format}
                      testId="book-open-{entry.format}"
                      onclick={() => onOpen(entry.format)}
                    >
                      <Icon name="external-link" />
                      {openingFormat === entry.format
                        ? t('app.library.book.opening')
                        : t('app.action.open')}
                    </Button>
                  </span>
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
                {#if editing && activeField !== 'description'}
                  {@render fieldActions(t('app.library.book.field.description'), editDescription)}
                {/if}
                <h2 id="book-about-title" class="role-title text-[var(--foreground)]">
                  {t('app.library.book.description')}
                </h2>
              </div>
              {#if activeField === 'description'}
                {@render editor(t('app.library.book.descriptionField'), () => commitActive(), true)}
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

          <!--
            Разделитель принадлежит описанию, а не файлу: без описания он не
            нужен, иначе линия отделяла бы пустоту от файла.
          -->
          {#if description}
            <div class="border-t border-[var(--divider)]" aria-hidden="true"></div>
          {/if}

          {#if openError}
            <ErrorState message={openError} />
          {/if}

          {#if path || book.size !== undefined || added}
            <!--
              Файл — одна строка: действие, размер и дата добавления. Подписи
              заменены иконками, а размер и дата читаются и без слов: рядом
              стоят два числа в разных форматах. Путь — подписью к строке.
            -->
            <section class="flex min-w-0 flex-col gap-2" data-testid="book-file">
              <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
                {#if path}
                  <Button
                    variant="secondary"
                    size="sm"
                    title={t('app.library.book.openFolder')}
                    testId="book-open-folder"
                    onclick={onOpenFolder}
                  >
                    <Icon name="folder" />
                    {t('app.library.book.openFolderShort')}
                  </Button>
                {/if}
                {#if book.size !== undefined}
                  <span
                    class="inline-flex items-center gap-1.5 role-caption text-[var(--muted-foreground)]"
                    title={t('app.library.book.size')}
                    aria-label={`${t('app.library.book.size')}: ${formatBytes(book.size)}`}
                  >
                    <Icon name="layers" class="h-3.5 w-3.5" />
                    <span data-testid="book-property-size">{formatBytes(book.size)}</span>
                  </span>
                {/if}
                {#if added}
                  <span
                    class="inline-flex items-center gap-1.5 role-caption text-[var(--muted-foreground)]"
                    title={t('app.library.book.added')}
                    aria-label={`${t('app.library.book.added')}: ${added}`}
                  >
                    <Icon name="calendar" class="h-3.5 w-3.5" />
                    <span data-testid="book-property-added">{added}</span>
                  </span>
                {/if}
              </div>
              {#if path}
                <!-- Путь — общий компонент системы: отдельная врезка на адрес
                     и отдельное действие копирования. -->
                <PathField
                  value={path}
                  label={t('app.library.book.path')}
                  testId="book-property-path"
                />
              {/if}
            </section>
          {/if}
        </div>
      </div>
    </div>
  </div>
</div>
