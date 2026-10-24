<script lang="ts">
  import {
    ActionMenu,
    Badge,
    Button,
    Icon,
    IconButton,
    Input,
    MetaList,
    RowActions,
    SidePanel,
    Textarea,
    TAB_ICON_NAMES,
    type IconName,
    type MenuAction,
    type MenuColor,
    type MenuIcon,
    type MetaItem,
  } from '@texture/ui';
  import {
    openAvailability,
    TAB_COLORS,
    type TabColor,
    type TabAppearancePatch,
    type WorkspaceTab,
  } from './workplace';
  import { NOTE_COLOR_LABELS, NOTE_COLOR_SWATCHES } from '../notes/notes';
  import { tabAccent, tabColorFill, tabLabel, tabTooltip } from './tab-appearance';

  interface Props {
    /** Вкладки рабочего места. */
    tabs: WorkspaceTab[];
    /** Активная вкладка. */
    activeTabId: string | null;
    /** Лимит числа открытых вкладок рабочего места. */
    openTabsLimit: number;
    /** Выбор книги. */
    onSelect: (id: string) => void;
    /** Закрытие вкладки. */
    onClose: (id: string) => void;
    /** Дублирование вкладки. */
    onDuplicate: (id: string) => void;
    /** Правка оформления вкладки. */
    onEditAppearance: (id: string, patch: TabAppearancePatch) => void;
    /** Закрытие панели (на узком окне панель перекрывает содержимое). */
    onClosePanel?: () => void;
  }

  let {
    tabs,
    activeTabId,
    openTabsLimit,
    onSelect,
    onClose,
    onDuplicate,
    onEditAppearance,
    onClosePanel,
  }: Props = $props();

  /** Доступность создания новых вкладок при текущем лимите. */
  const availability = $derived(openAvailability(tabs.length, openTabsLimit));

  /** Создание новых вкладок заблокировано: лимит достигнут или превышен. */
  const openBlocked = $derived(availability !== 'available');

  /** Лимит превышен: вкладок больше, чем разрешено. */
  const overLimit = $derived(availability === 'over-limit');

  /** Строка поиска по вкладкам. */
  let query = $state('');

  /** Идентификатор вкладки, у которой открыта правка имени или описания. */
  let editingTabId: string | null = $state(null);

  /** Какое текстовое свойство правится: имя или описание. */
  let editingField: 'name' | 'description' | null = $state(null);

  /** Черновик правки текстового свойства. */
  let draft = $state('');

  /** Вкладки, отфильтрованные поиском по имени, названию книги и описанию. */
  const visible = $derived.by(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return tabs;
    }
    return tabs.filter(
      (tab) =>
        tabLabel(tab).toLowerCase().includes(needle) ||
        tab.title.toLowerCase().includes(needle) ||
        (tab.description ?? '').toLowerCase().includes(needle),
    );
  });

  /** Пункты меню оформления вкладки: каждое свойство меняется отдельно. */
  const appearanceActions = $derived<MenuAction[]>([
    { id: 'rename', label: 'Название' },
    { id: 'describe', label: 'Описание' },
    { id: 'duplicate', label: 'Дублировать вкладку', disabled: openBlocked },
    { id: 'reset', label: 'Сбросить оформление', destructive: true },
    { id: 'close', label: 'Закрыть вкладку', destructive: true },
  ]);

  /** Образцы выбора цвета вкладки: общая палитра заметок, текущий цвет отмечен. */
  function colorOptions(current?: TabColor): MenuColor[] {
    return TAB_COLORS.map((color) => ({
      id: color,
      label: NOTE_COLOR_LABELS[color],
      color: NOTE_COLOR_SWATCHES[color],
      selected: color === current,
    }));
  }

  /** Образцы выбора иконки вкладки: текущая иконка отмечена. */
  function iconOptions(current?: IconName): MenuIcon[] {
    return TAB_ICON_NAMES.map((icon) => ({ id: icon, label: icon, selected: icon === current }));
  }

  /** Метаинформация пункта: книга и путь к её файлу.
   *
   * Название книги показывается, только если вкладка переименована: иначе оно
   * уже стоит подписью пункта. Путь показывается всегда — по нему видно, что это
   * за файл, даже когда вкладки одной книги открыты несколько раз.
   */
  function metaItems(tab: WorkspaceTab): MetaItem[] {
    const items: MetaItem[] = [];
    const book = tab.title.trim();
    if (book && book !== tabLabel(tab)) {
      items.push({ icon: 'book', value: book, title: `Книга: ${book}` });
    }
    if (tab.path) {
      items.push({
        icon: 'folder',
        value: tab.path,
        title: tab.path,
        testId: 'open-books-item-path',
      });
    }
    return items;
  }

  /** Стиль пункта: фон и обводка пользовательским цветом.
   *
   * Пункт повторяет вид строки заметок: у неактивного фон карточки, у выбранного
   * — тон выбора. Если у вкладки задан цвет, он подмешивается в этот фон, а
   * обводка выбранного пункта рисуется самим цветом вкладки — той же краской, что
   * и у заметки с цветом.
   */
  function itemFill(tab: WorkspaceTab): string {
    const base = tabColorFill(tab.color, 'var(--card)', false);
    const active = tabColorFill(tab.color, 'var(--card)', true);
    const edge = tabAccent(tab.color);
    const fill = base && active ? ` --item-fill: ${base}; --item-fill-active: ${active};` : '';
    return `${fill} --item-edge: ${edge ?? 'var(--primary-border)'};`;
  }

  /** Классы пункта с учётом пользовательского цвета и активности.
   *
   * Как в списке заметок: у пункта нет обводки, неактивный стоит на фоне
   * карточки и подсвечивается наведением, выбранный — фоном выбора и обводкой.
   * Обводка выбранного берёт цвет вкладки, если он задан, иначе общий акцентный.
   */
  function itemFillClass(tab: WorkspaceTab): string {
    if (tab.id === activeTabId) {
      return tab.color
        ? 'bg-[var(--item-fill-active)] border-[var(--item-edge)]'
        : 'bg-[var(--surface-selected)] border-[var(--item-edge)]';
    }
    return tab.color
      ? 'bg-[var(--item-fill)] border-transparent hover:bg-[var(--surface-hover)]'
      : 'bg-[var(--card)] border-transparent hover:bg-[var(--surface-hover)]';
  }

  /** Начало правки текстового свойства вкладки. */
  function startEditing(tab: WorkspaceTab, field: 'name' | 'description') {
    editingTabId = tab.id;
    editingField = field;
    draft = field === 'name' ? (tab.name ?? '') : (tab.description ?? '');
  }

  /** Завершение правки текстового свойства без сохранения. */
  function cancelEditing() {
    editingTabId = null;
    editingField = null;
    draft = '';
  }

  /** Сохранение изменённого текстового свойства вкладки. */
  function commitEditing() {
    if (editingTabId === null || editingField === null) {
      return;
    }
    const value = draft.trim();
    onEditAppearance(editingTabId, { [editingField]: value || undefined });
    cancelEditing();
  }

  /** Обработка пункта меню оформления вкладки. */
  function runAppearanceAction(tab: WorkspaceTab, action: string) {
    if (action === 'rename') {
      startEditing(tab, 'name');
    }
    if (action === 'describe') {
      startEditing(tab, 'description');
    }
    if (action === 'duplicate') {
      cancelEditing();
      onDuplicate(tab.id);
    }
    if (action === 'reset') {
      cancelEditing();
      onEditAppearance(tab.id, {
        name: undefined,
        description: undefined,
        icon: undefined,
        color: undefined,
      });
    }
    if (action === 'close') {
      cancelEditing();
      onClose(tab.id);
    }
  }
</script>

<SidePanel
  title="Открытые вкладки книг"
  testId="open-books-panel"
  class="w-[var(--notes-panel-width)]"
  onClose={onClosePanel}
>
  {#snippet headerActions()}
    <Badge variant={overLimit ? 'warning' : 'outline'}>{tabs.length} / {openTabsLimit}</Badge>
  {/snippet}

  {#snippet search()}
    <Input
      bind:value={query}
      placeholder="Поиск по вкладкам"
      ariaLabel="Поиск по вкладкам"
      icon="search"
      clearable
    />
  {/snippet}

  <ul class="m-0 flex min-h-0 flex-1 list-none flex-col gap-2 overflow-y-auto p-2">
    {#each visible as tab (tab.id)}
      <li
        class="relative flex shrink-0 flex-col overflow-hidden rounded-[var(--radius)] border py-2.5 pr-2 pl-4 transition-colors {itemFillClass(
          tab,
        )}"
        style={itemFill(tab)}
        data-testid="open-books-item"
        data-active={tab.id === activeTabId ? 'true' : 'false'}
      >
        <div class="flex items-start gap-2">
          <button
            type="button"
            class="flex min-w-0 flex-1 cursor-pointer items-center gap-2 truncate text-left role-body [font:inherit]"
            aria-pressed={tab.id === activeTabId}
            title={tabTooltip(tab)}
            onclick={() => onSelect(tab.id)}
          >
            {#if tab.icon}
              <Icon name={tab.icon} class="h-3.5 w-3.5 flex-none" />
            {/if}
            <span class="min-w-0 flex-1 truncate">{tabLabel(tab)}</span>
          </button>
          <RowActions>
            <ActionMenu
              ariaLabel="Оформление вкладки"
              title={overLimit ? 'Превышен лимит открытых вкладок' : 'Оформление'}
              class="h-7 w-7 {overLimit ? 'text-destructive' : ''}"
              items={appearanceActions}
              icons={iconOptions(tab.icon)}
              iconsLabel="Иконка вкладки"
              oniconselect={(icon) => onEditAppearance(tab.id, { icon })}
              colors={colorOptions(tab.color)}
              colorsLabel="Цвет вкладки"
              oncolorselect={(color) => onEditAppearance(tab.id, { color: color as TabColor })}
              onselect={(action) => runAppearanceAction(tab, action)}
            />
          </RowActions>
        </div>
        {#if tab.description}
          <p
            class="truncate pb-1.5 role-caption text-[var(--muted-foreground)]"
            data-testid="open-books-item-description"
          >
            {tab.description}
          </p>
        {/if}
        {#if metaItems(tab).length > 0}
          <div class="pb-1.5" data-testid="open-books-item-meta">
            <MetaList items={metaItems(tab)} />
          </div>
        {/if}
        {#if editingTabId === tab.id && editingField}
          <div class="flex flex-col gap-2 pb-2" data-testid="open-books-item-editor">
            {#if editingField === 'name'}
              <Input bind:value={draft} placeholder="Название" ariaLabel="Название вкладки" />
            {:else}
              <Textarea
                bind:value={draft}
                placeholder="Описание"
                ariaLabel="Описание вкладки"
                rows={2}
              />
            {/if}
            <div class="flex items-center justify-between gap-2">
              <IconButton
                action="delete"
                title="Очистить"
                ariaLabel="Очистить поле"
                disabled={!draft}
                onclick={() => {
                  draft = '';
                  commitEditing();
                }}
              />
              <div class="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="icon"
                  title="Отмена"
                  ariaLabel="Отмена"
                  onclick={cancelEditing}
                >
                  <Icon name="close" />
                </Button>
                <Button
                  variant="primary"
                  size="icon"
                  title="Сохранить"
                  ariaLabel="Сохранить"
                  onclick={commitEditing}
                >
                  <Icon name="check" />
                </Button>
              </div>
            </div>
          </div>
        {/if}
      </li>
    {:else}
      <li
        class="px-2 py-4 text-center role-body text-[var(--muted-foreground)]"
        data-testid={tabs.length > 0 ? 'open-books-search-empty' : 'open-books-empty'}
      >
        {tabs.length > 0 ? 'Вкладок по запросу не найдено.' : 'Нет открытых книг'}
      </li>
    {/each}
  </ul>
</SidePanel>
