<script lang="ts">
  import { t } from '@context/i18n';
  import { untrack } from 'svelte';
  import {
    ActionMenu,
    Badge,
    Icon,
    MetaList,
    NameDescriptionEditor,
    RowActions,
    SidePanel,
    Input,
    TAB_ICON_NAMES,
    type IconName,
    type MenuAction,
    type MenuColor,
    type MenuIcon,
    type MetaItem,
  } from '@context/ui';
  import {
    openAvailability,
    TAB_COLORS,
    type TabColor,
    type TabAppearancePatch,
    type WorkspaceTab,
  } from './workplace';
  import { noteColorLabel, NOTE_COLOR_SWATCHES } from '../notes/notes';
  import { pushDismissLayer } from '../hotkeys/dismiss-layer';
  import { openBookFile } from '../reader/reader';
  import { tabColorMark, tabFormatLabel, tabLabel, tabTooltip } from './tab-appearance';
  import { trackPointerDrag } from './pointer-drag';

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
    /** Перемещение вкладки на новую позицию в составе рабочего места. */
    onReorder: (id: string, toIndex: number) => void;
    /** Правка оформления вкладки. */
    onEditAppearance: (id: string, patch: TabAppearancePatch) => void;
    /** Закрытие панели (на узком окне панель перекрывает содержимое). */
    onClosePanel?: () => void;
    /** Панель накрывает книгу, а не стоит рядом с ней. */
    overlay?: boolean;
  }

  let {
    tabs,
    activeTabId,
    openTabsLimit,
    onSelect,
    onClose,
    onDuplicate,
    onReorder,
    onEditAppearance,
    onClosePanel,
    overlay = false,
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

  /** Значение поля правки у открытой формы. */
  const editingValue = $derived.by(() => {
    const tab = tabs.find((item) => item.id === editingTabId);
    if (!tab || !editingField) {
      return '';
    }
    return editingField === 'name' ? (tab.name ?? '') : (tab.description ?? '');
  });

  /** Подпись поля правки: имя или описание вкладки. */
  const editingLabel = $derived(
    editingField === 'description'
      ? t('app.workplace.tab.descriptionLabel')
      : t('app.workplace.tab.nameLabel'),
  );

  /** Escape снимает правку, не закрывая панель.
   *
   * Клавиша приходит от общего диспетчера: собственного обработчика `Escape`
   * у формы нет, иначе одно нажатие закрывало бы два слоя сразу.
   */
  $effect(() => {
    if (editingTabId === null) {
      return;
    }
    return pushDismissLayer(() => {
      cancelEditing();
    });
  });

  /** Список вкладок: по нему прокручивается активная. */
  let listEl = $state<HTMLUListElement | undefined>();

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

  /**
   * Показ активной вкладки в списке.
   *
   * Вкладку переключают и в полосе сверху, а не только в самой панели. Если
   * выбранная вкладка оказалась за пределами видимой части списка, прокрутка
   * подводится к ней. Список при этом сдвигается ровно настолько, насколько
   * нужно: полностью видимая строка остаётся на месте, и при каждом
   * переключении список не «дёргается». Фильтр поиска может скрыть активную
   * вкладку: тогда строки нет, и прокручивать нечего.
   */
  $effect(() => {
    // Активная вкладка, состав видимых строк и сам список — зависимости
    // эффекта: список привязывается после первого кадра, и без него эффект
    // выполнился бы вхолостую, оставив активную вкладку за пределами видимой
    // части.
    const id = activeTabId;
    const shown = visible;
    const el = listEl;
    if (id === null || !el || shown.length === 0) {
      return;
    }
    // Эффект выполняется после отрисовки, когда строки уже в списке.
    untrack(() => {
      const active = Array.from(
        el.querySelectorAll<HTMLElement>('[data-testid="open-books-item"]'),
      ).find((item) => item.dataset.tabId === id);
      if (!active) {
        return;
      }
      // Сдвиг считается по границам видимой части списка и самой строки:
      // прокручивается только список, а не страница целиком.
      const list = el.getBoundingClientRect();
      const row = active.getBoundingClientRect();
      if (row.top < list.top) {
        el.scrollTop += row.top - list.top;
      } else if (row.bottom > list.bottom) {
        el.scrollTop += row.bottom - list.bottom;
      }
    });
  });

  /** Номер вкладки в составе рабочего места (с единицы).
   *
   * Нумерация берётся из полного состава, а не из отфильтрованного списка: иначе
   * при поиске номера «переезжали» бы и перестали совпадать с полосой вкладок.
   */
  function tabNumber(id: string): number {
    return tabs.findIndex((tab) => tab.id === id) + 1;
  }

  /** Пункты меню вкладки.
   *
   * Название и описание называются по состоянию: пока значения нет, пункт
   * предлагает добавить его, а после — редактировать. Пользователь видит, что
   * произойдёт, не открывая пункт. Иконка есть у каждого пункта: меню длинное, и
   * значок помогает найти действие, не читая подписи.
   */
  function appearanceActions(tab: WorkspaceTab): MenuAction[] {
    const hasName = Boolean(tab.name?.trim());
    const hasDescription = Boolean(tab.description?.trim());
    return [
      {
        id: 'rename',
        label: hasName ? t('app.workplace.tab.editName') : t('app.workplace.tab.addName'),
        icon: 'tag',
      },
      {
        id: 'describe',
        label: hasDescription
          ? t('app.workplace.tab.editDescription')
          : t('app.workplace.tab.addDescription'),
        icon: 'text',
      },
      { id: 'duplicate', label: t('app.workplace.tab.duplicate'), icon: 'duplicate', disabled: openBlocked },
      { id: 'external', label: t('app.workplace.tab.openExternal'), icon: 'external-link' },
      { id: 'reset', label: t('app.workplace.tab.reset'), icon: 'refresh', destructive: true },
      { id: 'close', label: t('app.workplace.tab.close'), icon: 'close', destructive: true },
    ];
  }

  /** Образцы выбора цвета вкладки: общая палитра заметок, текущий цвет отмечен. */
  function colorOptions(current?: TabColor): MenuColor[] {
    return TAB_COLORS.map((color) => ({
      id: color,
      label: noteColorLabel(color),
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
   * за файл, даже когда вкладки одной книги открыты несколько раз. Вместо иконки
   * каталога перед путём стоит метка формата книги: она и различает одинаково
   * названные вкладки разных форматов.
   */
  function metaItems(tab: WorkspaceTab): MetaItem[] {
    const items: MetaItem[] = [];
    const book = tab.title.trim();
    if (book && book !== tabLabel(tab)) {
      // Название книги под чужим именем вкладки — главное, по чему вкладку
      // узнают, поэтому оно выделено начертанием, а не тонет в мелкой строке.
      items.push({
        icon: 'book',
        value: book,
        strong: true,
        title: t('app.workplace.tab.book', { book }),
      });
    }
    if (tab.path) {
      items.push({
        badge: tabFormatLabel(tab),
        value: tab.path,
        title: tab.path,
        testId: 'open-books-item-path',
      });
    }
    return items;
  }

  /** Классы пункта с учётом активности.
   *
   * Ровно как в полосе вкладок: активный пункт — светлой поверхностью
   * содержимого (в тёмных наборах — тёмной), неактивный плашки не рисует и
   * отличается только приглушённой подписью. Раньше список шёл обратным ходом:
   * в светлой теме неактивные строки были светлыми карточками, а активная —
   * тёмной, и два места одного рабочего места выглядели по-разному.
   */
  function itemFillClass(tab: WorkspaceTab): string {
    return tab.id === activeTabId
      ? 'bg-[var(--tab-active-surface)] text-[var(--tab-active-foreground)]'
      : 'text-[var(--muted-foreground)] hover:bg-[var(--tab-hover-surface)] hover:text-[var(--tab-active-foreground)]';
  }

  /** Идентификатор перетаскиваемой вкладки; `null` — перетаскивания нет. */
  let draggingId = $state<string | null>(null);

  /** Идентификатор вкладки, на которую сейчас наведён перенос. */
  let dropTargetId = $state<string | null>(null);

  /** Начало переноса вкладки в списке: запоминается нажатие до сдвига.
   *
   * Перенос строится на событиях указателя: нативное перетаскивание в окне
   * приложения оставляло строку серой и заедало курсор.
   */
  function startDrag(event: PointerEvent, tab: WorkspaceTab) {
    if (event.button !== 0) {
      return;
    }
    // Нажатие на кнопку меню и на поле формы не начинает перенос: это их
    // действия. Кнопка выбора строки, наоборот, покрывает весь пункт — иначе
    // перенос не начался бы нигде.
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, [aria-haspopup="menu"]')) {
      return;
    }
    trackPointerDrag({
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      hitTest: (x, y) => tabAtPoint(x, y),
      onStart: () => {
        draggingId = tab.id;
        dropTargetId = null;
      },
      onMove: (target2) => {
        dropTargetId = target2;
      },
      onEnd: (target2, moved) => {
        draggingId = null;
        dropTargetId = null;
        if (!moved || target2 === null || target2 === tab.id) {
          return;
        }
        const to = tabs.findIndex((item) => item.id === target2);
        if (to >= 0) {
          onReorder(tab.id, to);
        }
      },
    });
  }

  /** Идентификатор вкладки под точкой экрана; `null` — точки вне строк. */
  function tabAtPoint(x: number, y: number): string | null {
    const el = listEl;
    if (!el) {
      return null;
    }
    for (const item of Array.from(el.querySelectorAll<HTMLElement>('[data-tab-id]'))) {
      const box = item.getBoundingClientRect();
      if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) {
        return item.dataset.tabId ?? null;
      }
    }
    return null;
  }

  /** Начало правки текстового свойства вкладки. */
  function startEditing(tab: WorkspaceTab, field: 'name' | 'description') {
    editingTabId = tab.id;
    editingField = field;
  }

  /** Завершение правки текстового свойства без сохранения. */
  function cancelEditing() {
    editingTabId = null;
    editingField = null;
  }

  /** Сохранение изменённого текстового свойства вкладки. */
  function commitEditing(value: string) {
    if (editingTabId === null || editingField === null) {
      return;
    }
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
    if (action === 'external') {
      cancelEditing();
      // Книга открывается системным приложением, привязанным к её формату:
      // рабочее место остаётся как есть, вкладка не меняется.
      void openBookFile(tab.path);
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
  title={t('app.workplace.tabs')}
  testId="open-books-panel"
  side="left"
  {overlay}
  responsive={false}
  class="w-[var(--notes-panel-width)]"
  onClose={onClosePanel}
>
  {#snippet headerActions()}
    <Badge variant={overLimit ? 'warning' : 'outline'}>{tabs.length} / {openTabsLimit}</Badge>
  {/snippet}

  {#snippet search()}
    <Input
      bind:value={query}
      placeholder={t('app.search.tabs.placeholder')}
      ariaLabel={t('app.search.tabs.placeholder')}
      icon="search"
      clearable
    />
  {/snippet}

  <ul
    bind:this={listEl}
    class="m-0 flex min-h-0 flex-1 list-none flex-col gap-2 overflow-y-auto p-2"
    data-testid="open-books-list"
  >
    {#each visible as tab (tab.id)}
      <li
        class="relative flex shrink-0 cursor-grab flex-col overflow-hidden rounded-[var(--radius)] px-3 py-2.5 transition-[background-color,color,opacity,box-shadow] {itemFillClass(
          tab,
        )} {draggingId === tab.id ? 'opacity-40' : ''} {dropTargetId === tab.id &&
        draggingId !== tab.id
          ? 'ring-2 ring-[var(--ring)]/60'
          : ''}"
        data-testid="open-books-item"
        data-tab-id={tab.id}
        data-active={tab.id === activeTabId ? 'true' : 'false'}
        onpointerdown={(event) => startDrag(event, tab)}
      >
        <!--
          Вся строка — одна кнопка выбора: нажатие в любом месте пункта, включая
          путь и дату, открывает вкладку. Раньше кликабельно было только
          название, и над путём файла курсор терял отзыв. Меню и форма правки
          стоят поверх кнопки и нажатие перехватывают сами.
        -->
        <button
          type="button"
          class="absolute inset-0 cursor-pointer [font:inherit] focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none focus-visible:ring-inset"
          aria-pressed={tab.id === activeTabId}
          aria-label={tabLabel(tab)}
          title={tabTooltip(tab)}
          onclick={() => onSelect(tab.id)}
        ></button>
        <div class="pointer-events-none relative z-[1] flex items-start gap-2">
          <!--
            Номер — место вкладки в составе рабочего места, тот же, что в полосе
            вкладок: по нему вкладку находят в обоих местах. При поиске нумерация
            не меняется. В списке номер нейтрален: цвет вкладки живёт только на
            полосе, чтобы полосы и строки читались одинаково.
          -->
          <span
            class="shrink-0 tabular-nums opacity-60 role-caption"
            data-testid="open-books-item-number"
            >{tabNumber(tab.id)}</span
          >
          <span class="flex min-w-0 flex-1 items-center gap-2 truncate text-left role-body">
            {#if tab.icon}
              <Icon name={tab.icon} class="h-3.5 w-3.5 flex-none" />
            {/if}
            <span class="min-w-0 flex-1 truncate">{tabLabel(tab)}</span>
          </span>
          <RowActions class="pointer-events-auto">
            <ActionMenu
              ariaLabel={t('app.workplace.tab.appearance')}
              title={overLimit ? t('app.workplace.limitExceeded') : t('app.workplace.tab.appearance')}
              class="h-7 w-7 {overLimit ? 'text-destructive' : ''}"
              mark={tabColorMark(tab.color, { active: tab.id === activeTabId })}
              items={appearanceActions(tab)}
              icons={iconOptions(tab.icon)}
              iconsLabel={t('app.workplace.tab.iconLabel')}
              oniconselect={(icon) => onEditAppearance(tab.id, { icon })}
              colors={colorOptions(tab.color)}
              colorsLabel={t('app.workplace.tab.colorLabel')}
              oncolorselect={(color) => onEditAppearance(tab.id, { color: color as TabColor })}
              onselect={(action) => runAppearanceAction(tab, action)}
            />
          </RowActions>
        </div>
        {#if tab.description}
          <p
            class="pointer-events-none whitespace-pre-wrap break-words pb-1.5 role-caption text-[var(--muted-foreground)]"
            data-testid="open-books-item-description"
          >
            {tab.description}
          </p>
        {/if}
        <!--
          Форма правки стоит сразу под описанием и выше сведений о книге: она
          меняет то, что пользователь видит первым, и не должна оказаться ниже
          названия книги и пути, которые от неё не зависят.
        -->
        {#if editingTabId === tab.id && editingField}
          {@const field = editingField}
          <div class="relative z-[1] pb-1.5" data-testid="open-books-item-editor">
            {#key `${tab.id}:${field}`}
              <NameDescriptionEditor
                label={editingLabel}
                value={editingValue}
                multiline={field === 'description'}
                onSave={commitEditing}
                onCancel={cancelEditing}
              />
            {/key}
          </div>
        {/if}
        {#if metaItems(tab).length > 0}
          <!-- Путь и служебные сведения читаются приглушённой подписью: это
               ориентир, а не главное в строке, поэтому они не должны бросаться
               в глаза рядом с названием вкладки. Исключение — выделенная
               книга: её начертание сильнее, потому что по нему вкладку и
               узнают. -->
          <div class="pointer-events-none pb-1.5" data-testid="open-books-item-meta">
            <MetaList items={metaItems(tab)} />
          </div>
        {/if}
      </li>
    {:else}
      <li
        class="px-2 py-4 text-center role-body text-[var(--muted-foreground)]"
        data-testid={tabs.length > 0 ? 'open-books-search-empty' : 'open-books-empty'}
      >
        {tabs.length > 0 ? t('app.workplace.tabsNotFound') : t('app.workplace.noOpenBooks')}
      </li>
    {/each}
  </ul>
</SidePanel>
