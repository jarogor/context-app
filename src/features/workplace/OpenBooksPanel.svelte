<script lang="ts">
  import {
    ActionMenu,
    Button,
    Icon,
    IconButton,
    Input,
    Textarea,
    TAB_ICON_NAMES,
    type IconName,
    type MenuAction,
    type MenuColor,
    type MenuIcon,
  } from '@texture/ui';
  import {
    TAB_COLORS,
    type TabColor,
    type TabAppearancePatch,
    type WorkspaceTab,
  } from './workplace';
  import { NOTE_COLOR_LABELS, NOTE_COLOR_SWATCHES } from '../notes/notes';
  import { tabColorFill, tabLabel, tabTooltip } from './tab-appearance';

  interface Props {
    /** Вкладки рабочего места. */
    tabs: WorkspaceTab[];
    /** Активная вкладка. */
    activeTabId: string | null;
    /** Выбор книги. */
    onSelect: (id: string) => void;
    /** Закрытие вкладки. */
    onClose: (id: string) => void;
    /** Правка оформления вкладки. */
    onEditAppearance: (id: string, patch: TabAppearancePatch) => void;
  }

  let { tabs, activeTabId, onSelect, onClose, onEditAppearance }: Props = $props();

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

  /** Пункты меню оформления вкладки: каждое свойство меняется отдельно.
   *
   * Пунктов «изменить всё сразу» нет: пользователь трогает только то, что хочет,
   * а незаданные свойства не показываются и не меняются. Закрытие вкладки живёт
   * здесь же: отдельная кнопка у пункта опасна случайным нажатием и занимает
   * место, поэтому закрытие выполняется осознанным пунктом меню.
   */
  const appearanceActions: MenuAction[] = [
    { id: 'rename', label: 'Название' },
    { id: 'describe', label: 'Описание' },
    { id: 'reset', label: 'Сбросить оформление', destructive: true },
    { id: 'close', label: 'Закрыть вкладку', destructive: true },
  ];

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

  /** Стиль пункта: переменные мягкого тона пользовательского цвета; пусто, если цвета нет.
   *
   * Цвет задаётся переменными, а не напрямую фоном: классы активного состояния и
   * наведения должны оставаться сильнее базовой заливки, иначе у цветного пункта
   * пропало бы наведение. Пункт стоит на фоне карточки, поэтому тон смешивается
   * именно с ним; активный заливается плотнее, чтобы цвет не перебивал активность.
   */
  function itemFill(tab: WorkspaceTab): string {
    const base = tabColorFill(tab.color, 'var(--card)', false);
    const active = tabColorFill(tab.color, 'var(--card)', true);
    return base && active ? `--item-fill: ${base}; --item-fill-active: ${active}` : '';
  }

  /** Классы фона пункта с учётом пользовательского цвета и активности. */
  function itemFillClass(tab: WorkspaceTab): string {
    if (tab.color) {
      return tab.id === activeTabId
        ? 'bg-[var(--item-fill-active)]'
        : 'bg-[var(--item-fill)] hover:bg-[var(--muted)]';
    }
    return tab.id === activeTabId ? 'bg-[var(--primary-soft)]' : 'hover:bg-[var(--muted)]';
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

<aside
  class="flex w-[var(--notes-panel-width)] min-w-0 flex-none flex-col border-l border-[var(--border)] bg-[var(--card)] max-[899px]:absolute max-[899px]:inset-0 max-[899px]:w-auto max-[899px]:border-l-0"
  data-testid="open-books-panel"
>
  <div class="border-b border-[var(--border)] p-2">
    <Input
      bind:value={query}
      placeholder="Поиск по вкладкам"
      ariaLabel="Поиск по вкладкам"
      icon="search"
    />
  </div>
  <ul class="m-0 flex min-h-0 flex-1 list-none flex-col gap-2 overflow-y-auto p-2">
    {#each visible as tab (tab.id)}
      <!--
        Активная вкладка выделяется мягким тоном дизайн-системы, а наведение —
        приглушённым фоном: так активная вкладка читается во всех палитрах
        (в том числе Mist в светлой теме), а наведение не спорит с ней.
        Пользовательский цвет заливает весь пункт приглушённым оттенком; активный
        заливается плотнее, чтобы цвет не перебивал активность.
      -->
      <li
        class="relative flex shrink-0 flex-col overflow-hidden rounded-md border border-[var(--border)] transition-colors {itemFillClass(
          tab,
        )}"
        style={itemFill(tab)}
        data-testid="open-books-item"
        data-active={tab.id === activeTabId ? 'true' : 'false'}
      >
        <div class="flex items-stretch gap-1">
          <button
            type="button"
            class="flex min-w-0 flex-1 cursor-pointer items-center gap-1 truncate px-2 py-[6px] text-left text-[13px] [font:inherit]"
            aria-pressed={tab.id === activeTabId}
            title={tabTooltip(tab)}
            onclick={() => onSelect(tab.id)}
          >
            {#if tab.icon}
              <Icon name={tab.icon} class="h-3.5 w-3.5 flex-none" />
            {/if}
            <span class="min-w-0 flex-1 truncate">{tabLabel(tab)}</span>
          </button>
          <ActionMenu
            ariaLabel="Оформление вкладки"
            title="Оформление"
            class="my-[2px] h-7 w-7"
            items={appearanceActions}
            icons={iconOptions(tab.icon)}
            iconsLabel="Иконка вкладки"
            oniconselect={(icon) => onEditAppearance(tab.id, { icon })}
            colors={colorOptions(tab.color)}
            colorsLabel="Цвет вкладки"
            oncolorselect={(color) => onEditAppearance(tab.id, { color: color as TabColor })}
            onselect={(action) => runAppearanceAction(tab, action)}
          />
        </div>
        {#if tab.description}
          <p
            class="truncate px-2 pb-[6px] text-[11px] text-[var(--muted-foreground)]"
            data-testid="open-books-item-description"
          >
            {tab.description}
          </p>
        {/if}
        {#if editingTabId === tab.id && editingField}
          <!-- Правка одного свойства: общая форма с полем, сохранением и отменой. -->
          <div
            class="flex flex-col gap-2 px-2 pb-2"
            data-testid="open-books-item-editor"
          >
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
                  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                    <path
                      d="M6 6l12 12M18 6L6 18"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                    />
                  </svg>
                </Button>
                <Button
                  variant="primary"
                  size="icon"
                  title="Сохранить"
                  ariaLabel="Сохранить"
                  onclick={commitEditing}
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                    <path
                      d="M5 13l4 4L19 7"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                </Button>
              </div>
            </div>
          </div>
        {/if}
      </li>
    {:else}
      <li
        class="px-2 py-[6px] text-[13px] text-[var(--muted-foreground)]"
        data-testid={tabs.length > 0 ? 'open-books-search-empty' : 'open-books-empty'}
      >
        {tabs.length > 0 ? 'Вкладок по запросу не найдено.' : 'Нет открытых книг'}
      </li>
    {/each}
  </ul>
</aside>
