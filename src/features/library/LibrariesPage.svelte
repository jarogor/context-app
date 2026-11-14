<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import {
    ActionMenu,
    Badge,
    Button,
    EntityList,
    Icon,
    NameDescriptionEditor,
    PageShell,
    Dialog,
    PathField,
    Progress,
    SearchField,
    SegmentedControl,
    SortControl,
    Spinner,
    type MenuAction,
    type MenuColor,
    type MenuIcon,
    type MetaItem,
    type SortDirection,
  } from '@context/ui';
  import { invokeCommand, listenEvent, openDialog } from '../../shared/app-bridge';
  import { t } from '@context/i18n';
  import { formatDateTime } from '../../shared/format';
  import { currentLocale } from '@context/i18n';
  import { lastSegment } from '../../shared/path';
  import { activeLibrary } from '../../shared/base-plugin';
  import { PHONE_MAX_WIDTH } from '../../shared/breakpoints';
  import { noteColorLabel } from '../notes/model';
  import {
    LIBRARY_COLORS,
    LIBRARY_COLOR_SWATCHES,
    LIBRARY_ICONS,
    libraryColorFill,
    libraryColorLine,
    normalizeLibraryColor,
    normalizeLibraryIcon,
    optionalLibraryText,
    type LibraryColor,
    type LibraryIcon,
  } from './library-appearance';
  import appConfig from './app-config.json';

  interface Props {
    /** Вызывается после успешного открытия библиотеки. */
    onOpened: () => void;
  }

  let { onOpened }: Props = $props();

  /** Запись истории открытых библиотек. */
  interface HistoryEntry {
    /** Путь библиотеки. */
    path: string;
    /** Идентификатор провайдера. */
    provider: string;
    /** Человекочитаемое имя провайдера. */
    providerName: string;
    /** Время открытия записи (Unix, мс). */
    addedAtMillis: number;
    /** Доступна ли библиотека на диске. */
    available: boolean;
    /** Пользовательское название библиотеки; отсутствует, если не задано. */
    name?: string;
    /** Пользовательское описание библиотеки; отсутствует, если не задано. */
    description?: string;
    /** Иконка оформления библиотеки; отсутствует, если не задана. */
    icon?: LibraryIcon;
    /** Цвет оформления библиотеки; отсутствует, если не задан. */
    color?: LibraryColor;
  }

  /** Нормализация записи истории из ответа команды (snake_case → camelCase). */
  function normalizeHistoryEntry(value: unknown): HistoryEntry {
    const record = (value ?? {}) as Record<string, unknown>;
    const entry: HistoryEntry = {
      path: String(record.path ?? ''),
      provider: String(record.provider ?? ''),
      providerName: String(record.provider_name ?? ''),
      addedAtMillis: Number(record.added_at_millis ?? 0),
      available: Boolean(record.available),
    };
    // Оформление необязательно: неизвестные иконка и цвет отбрасываются, а
    // пустые строки читаются как «не задано».
    const name = optionalLibraryText(record.name);
    const description = optionalLibraryText(record.description);
    const icon = normalizeLibraryIcon(record.icon);
    const color = normalizeLibraryColor(record.color);
    if (name !== undefined) {
      entry.name = name;
    }
    if (description !== undefined) {
      entry.description = description;
    }
    if (icon !== undefined) {
      entry.icon = icon;
    }
    if (color !== undefined) {
      entry.color = color;
    }
    return entry;
  }

  let entries: HistoryEntry[] = $state([]);
  let loading: boolean = $state(false);
  let openingPath: string | null = $state(null);
  /** Номер последнего запроса открытия: ответы устаревших запросов отбрасываются. */
  let loadToken = 0;
  let activePath: string | null = $state(null);
  let error: string | null = $state(null);
  /** Прогресс построения индекса открываемой библиотеки (в процентах). */
  let progress: { done: number; total: number; percent: number } | null = $state(null);

  /** Строка поиска по имени библиотеки. */
  let query = $state('');

  /** Режим показа библиотек: строки или плитка. */
  let viewMode = $state<'list' | 'grid'>('list');

  /** Варианты переключателя режима показа библиотек. */
  const viewModeItems = $derived([
    { value: 'grid', label: t('app.library.mode.tiles'), icon: 'grid' as const },
    { value: 'list', label: t('app.library.mode.list'), icon: 'list' as const },
  ]);

  /**
   * Смартфон: плитка и список выглядят одинаково (оба — одна колонка), поэтому
   * переключатель вида на нём скрыт, а список всегда строчный. Маленький
   * планшет — другая ширина: там переключатель остаётся, различать виды есть
   * смысл.
   */
  let phoneWindow = $state(false);

  /** Режим показа с учётом смартфона: там всегда строки. */
  const effectiveViewMode = $derived(phoneWindow ? 'list' : viewMode);

  /** Запоминание режима показа в браузере: он переживает перезапуск. */
  function chooseViewMode(mode: 'list' | 'grid') {
    viewMode = mode;
    try {
      localStorage.setItem('libraries-view-mode', mode);
    } catch {
      /* Хранилище недоступно — режим остаётся в состоянии страницы. */
    }
  }

  /** Порядок списка: по имени или по времени последнего открытия. */
  let sortField = $state<'name' | 'opened'>('opened');

  /** Направление порядка: свежие и А–Я считаются по-разному. */
  let sortDirection = $state<'asc' | 'desc'>('desc');

  /** Варианты порядка списка библиотек. */
  const sortOptions = $derived([
    { value: 'opened', label: t('app.library.libraries.sort.opened') },
    { value: 'name', label: t('app.library.libraries.sort.name') },
  ]);

  /** Смена поля порядка: направление берётся удобное для поля. */
  function chooseSort(value: string) {
    sortField = value === 'name' ? 'name' : 'opened';
    sortDirection = sortField === 'name' ? 'asc' : 'desc';
    rememberSort();
  }

  /**
   * Переключение направления порядка.
   *
   * Направление сохраняется вместе с полем: перезапуск возвращает и выбранный
   * порядок, и его сторону.
   */
  function chooseSortDirection(next: SortDirection) {
    sortDirection = next;
    rememberSort();
  }

  /** Запоминание порядка списка в браузере: он переживает перезапуск. */
  function rememberSort() {
    try {
      localStorage.setItem('libraries-sort', sortField);
      localStorage.setItem('libraries-sort-direction', sortDirection);
    } catch {
      /* Хранилище недоступно — порядок остаётся в состоянии страницы. */
    }
  }

  /**
   * Выбранная библиотека — та, что показана панелью слева.
   *
   * Выбор и открытие разделены, как в реестре наборов заметок: клик по строке
   * загружает библиотеку и показывает её сведения, но книги не открывает.
   * Книги открываются явным действием карточки — тогда пользователь точно
   * понимает, куда перешёл.
   */
  let selectedPath = $state<string | null>(null);

  /**
   * Только что открытая библиотека, которой ещё нет в ответе истории.
   *
   * Ядро записывает историю в конце открытия, а ответ истории может прийти
   * раньше: без резерва карточка на мгновение показывала «не выбрана», хотя
   * библиотека уже открыта.
   */
  let openedEntryFallback = $state<HistoryEntry | null>(null);

  /** Запись, показанная панелью: выбранная, а без выбора — открытая. */
  const selectedEntry = $derived(
    entries.find((entry) => entry.path === (selectedPath ?? activePath)) ??
      (openedEntryFallback?.path === (selectedPath ?? activePath) ? openedEntryFallback : null),
  );

  /** Идёт ли открытие библиотеки. */
  const opening = $derived(openingPath !== null);

  /**
   * Имя библиотеки, которая сейчас загружается.
   *
   * Пока идёт загрузка, карточка показывает прогресс и называет библиотеку, но
   * не показывает сведения о ней: состояние «Загружена» ещё не подтверждено.
   */
  const openingName = $derived(openingPath === null ? '' : libraryName(openingPath));

  /** Идёт ли открытие пути, которого ещё нет в истории. */
  const openingNew = $derived(
    openingPath !== null && !entries.some((entry) => entry.path === openingPath),
  );

  /** Записи списка, отфильтрованные поиском и упорядоченные выбранным полем. */
  const filtered = $derived.by(() => {
    const needle = query.trim().toLowerCase();
    // Поиск идёт и по подписи, и по имени папки: оформленное название не должно
    // прятать библиотеку от запроса по её директории.
    const found = needle
      ? entries.filter(
          (entry) =>
            libraryLabel(entry).toLowerCase().includes(needle) ||
            libraryName(entry.path).toLowerCase().includes(needle),
        )
      : [...entries];
    const factor = sortDirection === 'asc' ? 1 : -1;
    return found.sort((left, right) => {
      if (sortField === 'name') {
        return factor * libraryLabel(left).localeCompare(libraryLabel(right), currentLocale());
      }
      // По времени открытия: у записей без времени порядок задаёт имя.
      const delta = (left.addedAtMillis ?? 0) - (right.addedAtMillis ?? 0);
      return delta !== 0
        ? factor * delta
        : libraryLabel(left).localeCompare(libraryLabel(right), currentLocale());
    });
  });

  /** Имя библиотеки по последнему сегменту пути. */
  function libraryName(path: string): string {
    return lastSegment(path);
  }

  /**
   * Подпись библиотеки: пользовательское название или имя папки.
   *
   * Оформление дополняет вид, а не заменяет его: без названия остаётся имя
   * директории, по которому библиотеку и узнают.
   */
  function libraryLabel(entry: HistoryEntry): string {
    return entry.name?.trim() || libraryName(entry.path);
  }

  /**
   * Имя провайдера для показа.
   *
   * Идентификаторы плагинов — служебные (`books-source`, `books-source-calibre`);
   * пользователь видит источник по короткому имени: `context` для общего
   * источника книг и `calibre` для библиотеки Calibre. Неизвестный провайдер
   * показывается как есть — выдумывать ему имя нельзя.
   */
  function providerLabel(provider: string): string {
    const id = provider.trim().toLowerCase();
    if (id === 'books-source') {
      return 'context';
    }
    if (id === 'books-source-calibre') {
      return 'calibre';
    }
    return provider;
  }

  /**
   * Метаинформация записи истории: дата открытия.
   *
   * Описание принадлежит карточке библиотеки, а путь и состояние — тоже её
   * сведениям: в строке списка остаются название, тип и дата.
   */
  function metaItems(entry: HistoryEntry): MetaItem[] {
    const opened = formatDateTime(entry.addedAtMillis);
    if (!opened) {
      return [];
    }
    return [
      {
        icon: 'clock',
        value: opened,
        title: t('app.library.libraries.opened', { date: opened }),
      },
    ];
  }

  /**
   * Пункты меню записи истории.
   *
   * «Открыть папку» показывает директорию библиотеки в файловом менеджере:
   * открыть саму библиотеку можно кликом по строке, поэтому пункт делает то,
   * чего клик не умеет. Оформление (название, описание, сброс) стоит отдельной
   * группой — оно меняет вид записи, а не работу с библиотекой.
   */
  function entryActions(entry: HistoryEntry): MenuAction[] {
    const hasName = Boolean(entry.name?.trim());
    const hasDescription = Boolean(entry.description?.trim());
    const appearance: MenuAction[] = [
      {
        id: 'rename',
        label: hasName ? t('app.library.libraries.editName') : t('app.library.libraries.addName'),
      },
      {
        id: 'describe',
        label: hasDescription
          ? t('app.library.libraries.editDescription')
          : t('app.library.libraries.addDescription'),
      },
      {
        id: 'reset',
        label: t('app.library.libraries.reset'),
        destructive: true,
      },
    ];
    // У отсутствующей библиотеки открывать нечего: остаётся оформление и
    // удаление записи.
    if (!entry.available) {
      return [
        ...appearance,
        {
          id: 'forget',
          label: t('app.library.libraries.forget'),
          separatorBefore: true,
          destructive: true,
        },
      ];
    }
    return [
      { id: 'open-folder', label: t('app.library.libraries.openFolder') },
      ...appearance,
      {
        id: 'forget',
        label: t('app.library.libraries.forget'),
        separatorBefore: true,
        destructive: true,
      },
    ];
  }

  /** Образцы выбора цвета библиотеки: общая палитра, текущий цвет отмечен. */
  function colorOptions(entry: HistoryEntry): MenuColor[] {
    return LIBRARY_COLORS.map((color) => ({
      id: color,
      label: noteColorLabel(color),
      color: LIBRARY_COLOR_SWATCHES[color],
      selected: color === entry.color,
    }));
  }

  /** Образцы выбора иконки библиотеки: текущая иконка отмечена. */
  function iconOptions(entry: HistoryEntry): MenuIcon[] {
    return LIBRARY_ICONS.map((icon) => ({
      id: icon,
      label: icon,
      selected: icon === entry.icon,
    }));
  }

  /** CSS-переменные заливки и обводки строки или карточки библиотеки.
   *
   * Переменные задаются только при заданном цвете: без цвета фон и обводку
   * берут классы. Обводка приглушена для всех состояний: она обозначает цвет
   * записи, но не спорит с заливкой, текстом и выбором.
   */
  function colorStyle(entry: HistoryEntry, base: string, selectedBase: string): string {
    if (!entry.color) {
      return '';
    }
    const fill = libraryColorFill(entry.color, { base });
    const selected = libraryColorFill(entry.color, { base: selectedBase, selected: true });
    const line = libraryColorLine(entry.color, { strong: false });
    return `--row-fill: ${fill}; --row-fill-selected: ${selected}; --row-line: ${line};`;
  }

  /** Цвет строки списка: заливка поверх карточки, обводка — цветом записи. */
  function rowStyle(entry: HistoryEntry): string {
    return colorStyle(entry, 'var(--card)', 'var(--card)');
  }

  /** Цвет карточки: шапка и подвал лежат на разных поверхностях.
   *
   * Цвет применяется к самой карточке, поэтому выбирается её собственный фон:
   * шапка стоит на карточке, а не на странице.
   */
  const cardStyle = $derived(
    selectedEntry ? colorStyle(selectedEntry, 'var(--card)', 'var(--card)') : undefined,
  );

  /** Пункты меню карточки: те же действия, что у записи списка. */
  const cardActions = $derived(selectedEntry ? entryActions(selectedEntry) : []);

  /** Библиотека, оформление которой правится диалогом; `null` — диалог закрыт. */
  let editingEntry = $state<HistoryEntry | null>(null);

  /** Поле оформления, которое правится диалогом. */
  let editingField = $state<'name' | 'description' | null>(null);

  /** Заголовок, подпись и вид открытой формы оформления. */
  const editingDialog = $derived.by(() => {
    if (editingField === 'description') {
      return {
        title: t('app.library.libraries.descriptionLabel'),
        label: t('app.library.libraries.descriptionLabel'),
        multiline: true,
      };
    }
    return {
      title: t('app.library.libraries.nameLabel'),
      label: t('app.library.libraries.nameLabel'),
      multiline: false,
    };
  });

  /** Значение поля открытой формы оформления. */
  const editingValue = $derived(
    editingField === 'description'
      ? (editingEntry?.description ?? '')
      : (editingEntry?.name ?? ''),
  );

  /** Запись пользовательского оформления библиотеки. */
  async function saveAppearance(path: string, patch: Partial<HistoryEntry>) {
    // Снимок записи с новым оформлением: список показывает изменение сразу, не
    // дожидаясь ответа истории.
    const updated = entries.map((entry) =>
      entry.path === path ? { ...entry, ...patch } : entry,
    );
    entries = updated;
    const entry = updated.find((item) => item.path === path);
    if (!entry) {
      return;
    }
    try {
      await invokeCommand('library_history_appearance', {
        path,
        name: entry.name ?? null,
        description: entry.description ?? null,
        icon: entry.icon ?? null,
        color: entry.color ?? null,
      });
      error = null;
      // Ответ истории уточняет выдачу ядра: оформление остаётся тем, что легло
      // на диск, а не тем, что успел показать интерфейс.
      await loadHistory();
    } catch (e) {
      error = String(e);
      // Оформление не сохранилось — список возвращается к состоянию ядра.
      await loadHistory();
    }
  }

  /** Сброс оформления: пустое значение в каждом поле снимает его. */
  function resetAppearance(path: string) {
    void saveAppearance(path, {
      name: undefined,
      description: undefined,
      icon: undefined,
      color: undefined,
    });
  }

  /** Начало правки текстового оформления библиотеки. */
  function startEditing(entry: HistoryEntry, field: 'name' | 'description') {
    editingEntry = entry;
    editingField = field;
  }

  /** Закрытие формы оформления без сохранения. */
  function cancelEditing() {
    editingEntry = null;
    editingField = null;
  }

  /** Сохранение введённого текста оформления; пустая строка снимает значение. */
  function commitEditing(value: string) {
    const entry = editingEntry;
    const field = editingField;
    if (!entry || !field) {
      return;
    }
    const text = optionalLibraryText(value);
    void saveAppearance(entry.path, { [field]: text });
    cancelEditing();
  }

  /** Загрузка истории открытых библиотек. */
  async function loadHistory() {
    loading = true;
    try {
      const response = (await invokeCommand('library_history_list', {})) as {
        entries?: unknown[];
      };
      entries = (response.entries ?? []).map(normalizeHistoryEntry);
      error = null;
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
    }
  }

  /** Загрузка сведений об активной библиотеке. */
  async function loadActive() {
    try {
      const response = await activeLibrary();
      activePath = response?.path ?? null;
    } catch {
      // Отсутствие активной библиотеки не является ошибкой страницы.
    }
  }

  /**
   * Загрузка библиотеки: каталог строится, сведения показываются в панели.
   *
   * Переход к книгам не выполняется: библиотека только выбирается. Так выбор
   * библиотеки в списке не уносит пользователя из раздела, а карточка слева
   * успевает показать, что именно выбрано.
   *
   * Новый выбор не ждёт конца предыдущей загрузки: пользователь вправе передумать.
   * Ответ устаревшего запроса отбрасывается по номеру (`loadToken`), иначе
   * карточка переключилась бы обратно на библиотеку, которую уже не выбирали.
   */
  async function loadLibrary(path: string) {
    const token = ++loadToken;
    selectedPath = path;
    openingPath = path;
    error = null;
    progress = null;
    try {
      // Уже открытая библиотека не переоткрывается: ядро вернёт её без опроса
      // source-плагинов и переиндексации (см. `select_source_library`).
      const response = (await invokeCommand('select_source_library', {
        path,
        storageRoot: appConfig.state_dir,
      })) as { provider?: string; provider_name?: string } | null;
      // Пока шёл запрос, выбрали другую библиотеку: этот ответ устарел.
      if (token !== loadToken) {
        return;
      }

      const provider = String(response?.provider ?? '');
      // Оформление уже известной записи не сбрасывается: ядро сохраняет его при
      // повторном открытии, и локальная запись должна показать то же.
      const previous = entries.find((entry) => entry.path === path);
      const opened: HistoryEntry = {
        path,
        provider,
        providerName: String(response?.provider_name ?? provider),
        addedAtMillis: Date.now(),
        available: true,
        ...(previous?.name !== undefined ? { name: previous.name } : {}),
        ...(previous?.description !== undefined ? { description: previous.description } : {}),
        ...(previous?.icon !== undefined ? { icon: previous.icon } : {}),
        ...(previous?.color !== undefined ? { color: previous.color } : {}),
      };

      // Запись появляется в списке сразу: ядро пишет историю в конце открытия,
      // но ответ истории может прийти раньше её записи, и новая библиотека
      // «терялась» — открыта, а в списке её нет.
      entries = [...entries.filter((entry) => entry.path !== path), opened];
      activePath = path;
      selectedPath = path;
      openedEntryFallback = opened;
    } catch (e) {
      if (token === loadToken) {
        error = String(e);
      }
    } finally {
      if (token === loadToken) {
        openingPath = null;
        progress = null;
        // История перечитывается, но локальная запись не должна из-за этого
        // пропасть: пока ядро не отдало её, она подставляется из резерва.
        void loadHistory();
      }
    }
  }

  /**
   * Выбор библиотеки строкой списка.
   *
   * Отсутствующая библиотека тоже выбирается: пользователь должен увидеть её
   * путь и понять, что запись ведёт в никуда. Открытие книг для неё закрыто
   * отдельно — в панели.
   */
  function pickEntry(entry: HistoryEntry) {
    if (!entry.available) {
      // Загружать нечего: показываются сведения записи без обращения к диску.
      selectedPath = entry.path;
      return;
    }
    void loadLibrary(entry.path);
  }

  /** Переход к книгам выбранной библиотеки: её каталог уже загружен выбором. */
  function openLibraryBooks() {
    onOpened();
  }

  /** Выбор новой папки библиотеки. */
  async function pickLibrary() {
    if (opening) {
      return;
    }
    error = null;
    try {
      const selected = await openDialog({ directory: true, multiple: false });
      if (typeof selected === 'string') {
        await loadLibrary(selected);
      }
    } catch (e) {
      error = String(e);
    }
  }

  /** Удаление записи из истории. */
  async function forget(path: string) {
    try {
      const response = (await invokeCommand('library_history_forget', { path })) as {
        released?: boolean;
      } | null;
      // Удалённая библиотека была активной: ядро выгрузило её, и выбранной
      // записи больше нет — панель не должна показывать сведения о ней.
      if (response?.released) {
        activePath = null;
        selectedPath = null;
        openedEntryFallback = null;
      }
      await loadHistory();
    } catch (e) {
      error = String(e);
    }
  }

  /** Выбор действия записи истории из меню. */
  function runEntryAction(entry: HistoryEntry, action: string) {
    if (action === 'open-folder') {
      void openFolder(entry.path);
    }
    if (action === 'rename') {
      startEditing(entry, 'name');
    }
    if (action === 'describe') {
      startEditing(entry, 'description');
    }
    if (action === 'reset') {
      resetAppearance(entry.path);
    }
    if (action === 'forget') {
      void forget(entry.path);
    }
  }

  /** Открытие директории библиотеки системным файловым менеджером. */
  async function openFolder(path: string) {
    try {
      await invokeCommand('open_folder', { path });
    } catch (e) {
      error = String(e);
    }
  }

  onMount(() => {
    // Смартфон: переключатель вида скрыт, всегда показывается список.
    const phoneQuery = window.matchMedia(PHONE_MAX_WIDTH);
    phoneWindow = phoneQuery.matches;
    const onPhoneChange = (event: MediaQueryListEvent) => {
      phoneWindow = event.matches;
    };
    phoneQuery.addEventListener('change', onPhoneChange);
    // Режим показа переживает перезапуск: он хранится в браузере, как у книг.
    try {
      const stored = localStorage.getItem('libraries-view-mode');
      if (stored === 'list' || stored === 'grid') {
        viewMode = stored;
      }
      // Порядок списка тоже переживает перезапуск: иначе каждое открытие
      // возвращало бы порядок по дате, хотя выбран алфавитный. Сторона порядка
      // хранится отдельно — пользователь мог переключить её вручную.
      const storedSort = localStorage.getItem('libraries-sort');
      if (storedSort === 'name' || storedSort === 'opened') {
        sortField = storedSort;
        sortDirection = storedSort === 'name' ? 'asc' : 'desc';
      }
      const storedDirection = localStorage.getItem('libraries-sort-direction');
      if (storedDirection === 'asc' || storedDirection === 'desc') {
        sortDirection = storedDirection;
      }
    } catch {
      /* Хранилище недоступно — режим по умолчанию остаётся. */
    }
    let unlisten: (() => void) | undefined;
    void (async () => {
      unlisten = await listenEvent('library-index-progress', (value) => {
        const payload = value as { done?: number; total?: number; percent?: number };
        if (openingPath !== null && typeof payload?.percent === 'number') {
          progress = {
            done: payload.done ?? 0,
            total: payload.total ?? 0,
            percent: payload.percent,
          };
        }
      });
    })();
    void loadHistory();
    void loadActive();
    return () => {
      phoneQuery.removeEventListener('change', onPhoneChange);
      unlisten?.();
    };
  });
</script>

<PageShell
  testId="libraries-page"
  width="full"
  loading={loading && entries.length === 0}
  loadingText={t('app.loading')}
  empty={entries.length === 0}
  emptyIcon="library"
  emptyTitle={t('app.library.libraries.empty.title')}
  emptyText={t('app.library.libraries.empty.description')}
>
  {#snippet emptyAction()}
    <Button variant="primary" disabled={opening} onclick={pickLibrary}>
      {#if openingNew}
        <Spinner class="h-4 w-4" />
      {/if}
      <Icon name="folder" />
      {t('app.library.libraries.add')}
    </Button>
  {/snippet}

  {#snippet controls()}
    <!--
      Полоса управления как в библиотеке книг: добавление, поиск и счётчик —
      слева, сортировка и переключатель вида — справа в той же строке. Только
      на планшете им не хватает места: там они переносятся на свою
      строку, а поиск сохраняет ширину. На широком окне всё стоит в один ряд.
    -->
    <div class="flex w-full min-w-0 flex-wrap items-center gap-2">
      <Button
        variant="primary"
        disabled={opening}
        title={t('app.library.libraries.add')}
        ariaLabel={t('app.library.libraries.add')}
        onclick={pickLibrary}
      >
        {#if openingNew}
          <Spinner class="h-4 w-4" />
        {/if}
        <Icon name="folder" />
        <span class="max-large-tablet:hidden">{t('app.library.libraries.addShort')}</span>
      </Button>
      <SearchField
        bind:value={query}
        placeholder={t('app.search.library.placeholder')}
        ariaLabel={t('app.search.library.placeholder')}
        shown={filtered.length}
        total={entries.length}
        counterTestId="libraries-filter-counter"
        clearable
        class="min-w-0 flex-1 tablet:max-w-[22rem]"
      />
      <!--
        Порядок и вид всегда справа. На узком окне группа занимает всю ширину,
        но её содержимое прижато к правому краю: переключатель вида не обрезается
        и не уезжает влево, сжимается только список порядка.
      -->
      <div class="flex w-full min-w-0 items-center justify-end gap-2 tablet:ml-auto tablet:w-auto">
        <div class="min-w-0 tablet:flex-none">
          <SortControl
            items={sortOptions}
            value={sortField}
            direction={sortDirection}
            ariaLabel={t('app.library.libraries.sort.label')}
            testId="libraries-sort"
            class="min-w-0"
            selectClass="min-w-0 tablet:w-[15rem] tablet:shrink-0"
            onchange={(value) => chooseSort(value)}
            ondirection={(next) => chooseSortDirection(next)}
          />
        </div>
        {#if !phoneWindow}
          <SegmentedControl
            items={viewModeItems}
            value={viewMode}
            ariaLabel={t('app.library.modeLabel')}
            onchange={(next) => chooseViewMode(next as 'list' | 'grid')}
          />
        {/if}
      </div>
    </div>
  {/snippet}

  {#if error}
    <p class="role-body text-[var(--destructive)]" data-testid="libraries-error">{error}</p>
  {/if}

  <!--
    Две колонки на всю доступную ширину: слева панель выбранной библиотеки,
    справа список всех библиотек. Выбор в списке только загружает библиотеку и
    показывает её сведения; книги открываются нажатием на название в панели.
  -->
  <div
    class="grid min-w-0 gap-4 large-tablet:h-full large-tablet:min-h-0 large-tablet:flex-1 large-tablet:grid-cols-[22rem_minmax(0,1fr)] large-tablet:items-start large-tablet:gap-6 desktop:grid-cols-[26rem_minmax(0,1fr)]"
  >
    <!-- Панель стоит на месте всегда: без загруженной библиотеки она объясняет,
         что та не загружена, а не исчезает, сдвигая список. -->
    <aside
      class="relative flex w-full min-w-0 flex-col self-start overflow-hidden rounded-[var(--radius)] border border-[var(--row-line,var(--border))] bg-[var(--card)] large-tablet:h-full large-tablet:min-h-0"
      style={cardStyle}
      data-testid="library-card"
    >
      {#if opening}
        <!--
          Пока библиотека загружается и индексируется, карточка показывает
          прогресс вместо сведений: состояние «Загружена» ещё не подтверждено, а
          кнопка перехода к книгам была бы заблокирована и выглядела сломанной.
          Сведения появляются, как только загрузка закончилась.
        -->
        <div class="flex flex-col gap-2 px-4 py-3" data-testid="library-card-progress">
          <span class="m-0 break-words role-heading text-[var(--foreground)]">{openingName}</span>
          <span class="role-caption text-[var(--muted-foreground)]">
            {t('app.library.libraries.indexing')}
          </span>
          <Progress value={progress?.percent ?? 0} />
          {#if progress}
            <span class="role-caption text-[var(--muted-foreground)]">
              {t('app.library.libraries.indexingCount', {
                done: progress.done,
                total: progress.total,
              })}
            </span>
          {/if}
        </div>
      {:else if selectedEntry}
        <!--
          Шапка карточки — единственный вход к книгам: выбор в списке только
          показывает сведения, а переход начинается здесь. Кликабельна вся
          шапка целиком — название и описание: описание относится к библиотеке,
          а не к её состоянию, поэтому стоит в кликабельной области, увеличивая её.

          Кнопка-наложение только ловит нажатие: фон наведения рисует сама шапка,
          иначе заливка кнопки легла бы поверх текста. Меню стоит в своей колонке
          у верхнего правого края — при длинном тексте оно не уезжает в середину
          названия, а текст занимает оставшуюся ширину и не обрезается.
        -->
        <div
          class="relative flex w-full items-start gap-2 border-b border-[var(--row-line,var(--border))] bg-[var(--row-fill-selected,var(--card))] py-4 pr-4 pl-4 transition-colors hover:bg-[color-mix(in_oklab,var(--primary)_8%,var(--row-fill-selected,var(--card)))]"
        >
          <button
            type="button"
            class="absolute inset-0 cursor-pointer [font:inherit] focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none focus-visible:ring-inset disabled:cursor-not-allowed"
            title={t('app.library.libraries.toBooks')}
            aria-label={t('app.library.libraries.toBooks')}
            disabled={!selectedEntry.available}
            data-testid="library-card-open"
            onclick={() => openLibraryBooks()}
          ></button>

          <span class="pointer-events-none flex min-w-0 flex-1 flex-col gap-2">
            <span class="flex min-w-0 items-start gap-2">
              {#if selectedEntry.icon}
                <Icon name={selectedEntry.icon} class="mt-1 h-4 w-4 shrink-0" />
              {/if}
              <span class="block min-w-0 break-words role-heading text-[var(--foreground)]">
                {libraryLabel(selectedEntry)}
              </span>
            </span>
            {#if selectedEntry.description}
              <span
                class="m-0 block whitespace-pre-wrap break-words role-body text-[var(--muted-foreground)]"
                data-testid="library-card-description"
              >
                {selectedEntry.description}
              </span>
            {/if}
          </span>

          <!-- Меню карточки: то же оформление, что у записи списка. -->
          <span class="relative z-[1] flex shrink-0">
            <ActionMenu
              ariaLabel={t('app.library.libraries.actionsLabel')}
              title={t('app.library.libraries.actionsLabel')}
              items={cardActions}
              icons={iconOptions(selectedEntry)}
              iconsLabel={t('app.library.libraries.iconLabel')}
              oniconselect={(icon) =>
                void saveAppearance(selectedEntry!.path, { icon: normalizeLibraryIcon(icon) })}
              colors={colorOptions(selectedEntry)}
              colorsLabel={t('app.library.libraries.colorLabel')}
              oncolorselect={(color) =>
                void saveAppearance(selectedEntry!.path, { color: normalizeLibraryColor(color) })}
              onselect={(action) => runEntryAction(selectedEntry!, action)}
            />
          </span>
        </div>

        <!-- Состояние и тип библиотеки — справочные сведения: они стоят ниже
             кликабельной шапки, чтобы нажатие всегда открывало книги. -->
        <div class="flex flex-col gap-3 overflow-y-auto px-4 py-3">
          <span class="flex flex-wrap items-center gap-1.5">
            {#if selectedEntry.available}
              <Badge variant="success">{t('app.library.libraries.loaded')}</Badge>
            {:else}
              <Badge variant="warning">{t('app.library.libraries.missing')}</Badge>
            {/if}
            <Badge variant="outline">{providerLabel(selectedEntry.providerName)}</Badge>
          </span>
          <dl class="m-0 flex flex-col gap-2">
            {#if selectedEntry.addedAtMillis}
              <div class="flex flex-col gap-0.5">
                <dt class="role-caption text-[var(--muted-foreground)]">
                  {t('app.library.libraries.openedLabel')}
                </dt>
                <dd class="m-0 role-body">
                  {formatDateTime(selectedEntry.addedAtMillis)}
                </dd>
              </div>
            {/if}
            <!-- Расположение — общий компонент пути: адрес отдельным блоком,
                 копирование рядом, отсутствие подписано под адресом. -->
            <div class="flex flex-col gap-0.5">
              <dd class="m-0">
                <PathField
                  value={selectedEntry.path}
                  label={t('app.library.libraries.locationShort')}
                  tone={selectedEntry.available ? undefined : 'danger'}
                  note={selectedEntry.available ? '' : t('app.library.libraries.missing')}
                  testId="library-card-path"
                />
              </dd>
            </div>
          </dl>

          <Button
            variant="secondary"
            size="sm"
            class="self-start"
            disabled={!selectedEntry.available}
            testId="library-card-folder"
            onclick={() => void openFolder(selectedEntry.path)}
          >
            <Icon name="folder" />
            {t('app.library.libraries.openShort')}
          </Button>
        </div>
      {:else}
        <div
          class="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-6 text-center"
          data-testid="library-card-empty"
        >
          <span
            class="flex size-12 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-inset)] text-[var(--muted-foreground)]"
            aria-hidden="true"
          >
            <Icon name="library" class="h-6 w-6" />
          </span>
          <span class="role-body text-[var(--muted-foreground)]">
            {t('app.library.libraries.noSelection.title')}
          </span>
        </div>
      {/if}
    </aside>

    <!--
      Список библиотек: строки или плитка. Обе раскладки показывают одно и то же
      содержимое, поэтому переключение вида не меняет данные, а только подачу.
    -->
    <div
      class="flex min-w-0 flex-col large-tablet:h-full large-tablet:min-h-0 large-tablet:overflow-y-auto"
      data-testid="libraries-view"
    >
      {#if filtered.length === 0}
        <p class="text-[var(--muted-foreground)]" data-testid="libraries-not-found">
          {entries.length > 0 ? t('app.library.libraries.notFound') : t('app.list.notFound')}
        </p>
      {:else if effectiveViewMode === 'grid'}
        <ul
          class="grid list-none gap-3 p-0 [grid-template-columns:repeat(auto-fill,minmax(min(100%,20rem),1fr))]"
          data-testid="libraries-grid"
        >
          {#each filtered as entry (entry.path)}
            <li data-testid="library-item">
              <!--
                Плитка устроена как строка списка: кликабельна вся карточка, а
                меню действий стоит поверх и нажатий карточки не перехватывает.
                Активная библиотека выделяется тем же фоном, что и в списке, а
                наведение подсвечивает карточку так же, как строку: отклик
                одинаков в обеих раскладках.
              -->
              <article
                class="relative flex h-full flex-col gap-2 rounded-[var(--radius)] border p-3 transition-colors {entry.path ===
                selectedEntry?.path
                  ? 'border-[var(--row-line,var(--border))] bg-[var(--row-fill-selected,var(--surface-selected))]'
                  : 'border-[var(--row-line,var(--border))] bg-[var(--row-fill,var(--card))] hover:bg-[color-mix(in_oklab,var(--primary)_8%,var(--row-fill,var(--card)))]'} {entry.available ? '' : 'opacity-60'}"
                style={rowStyle(entry)}
                data-selected={entry.path === selectedEntry?.path ? 'true' : undefined}
              >
                <button
                  type="button"
                  class="absolute inset-0 cursor-pointer rounded-[var(--radius)] [font:inherit] focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none"
                  aria-label={libraryLabel(entry)}
                  data-testid="library-open"
                  onclick={() => pickEntry(entry)}
                ></button>

                <div class="pointer-events-none flex min-w-0 items-start gap-2">
                  {#if entry.icon}
                    <Icon name={entry.icon} class="mt-0.5 h-4 w-4 shrink-0" />
                  {/if}
                  <span class="min-w-0 flex-1 truncate role-title" data-testid="library-name">
                    {libraryLabel(entry)}
                  </span>
                </div>

                <!-- Тип — лейбл слева внизу, дата — под ним. -->
                <div class="pointer-events-none mt-auto flex min-w-0 flex-col items-start gap-1">
                  <!-- Лейбл стоит на фоне карточки, как меню действий: цвет строки
                       сквозь него не просвечивает и подпись не меняет цвет. -->
                  <Badge variant="outline" class="bg-[var(--card)]">
                    {providerLabel(entry.providerName)}
                  </Badge>
                  {#if formatDateTime(entry.addedAtMillis)}
                    <span
                      class="flex items-center gap-1.5 role-caption text-[var(--muted-foreground)]"
                    >
                      <Icon name="clock" class="h-3.5 w-3.5 shrink-0" />
                      {formatDateTime(entry.addedAtMillis)}
                    </span>
                  {/if}
                </div>

                <!-- Меню действий поверх наложения карточки. -->
                <span class="absolute top-2 right-2 z-[1] flex">
                  <ActionMenu
                    ariaLabel={t('app.library.libraries.actionsLabel')}
                    title={t('app.library.libraries.actionsLabel')}
                    items={entryActions(entry)}
                    icons={iconOptions(entry)}
                    iconsLabel={t('app.library.libraries.iconLabel')}
                    oniconselect={(icon) =>
                      void saveAppearance(entry.path, { icon: normalizeLibraryIcon(icon) })}
                    colors={colorOptions(entry)}
                    colorsLabel={t('app.library.libraries.colorLabel')}
                    oncolorselect={(color) =>
                      void saveAppearance(entry.path, { color: normalizeLibraryColor(color) })}
                    onselect={(action) => runEntryAction(entry, action)}
                  />
                </span>
              </article>
            </li>
          {/each}
        </ul>
      {:else}
        <EntityList
          items={filtered}
          key={(entry) => entry.path}
          itemTestId="library-item"
          notFound={entries.length > 0 && filtered.length === 0}
          notFoundTestId="libraries-not-found"
          selected={(entry) => entry.path === selectedEntry?.path}
          onSelect={(entry) => pickEntry(entry)}
          metaItems={metaItems}
          metaTestId="library-meta"
          rowStyle={rowStyle}
          actions={entryActions}
          actionsLabel={t('app.library.libraries.actionsLabel')}
          colors={colorOptions}
          colorsLabel={t('app.library.libraries.colorLabel')}
          onColorSelect={(entry, color) =>
            void saveAppearance(entry.path, { color: normalizeLibraryColor(color) })}
          icons={iconOptions}
          iconsLabel={t('app.library.libraries.iconLabel')}
          onIconSelect={(entry, icon) =>
            void saveAppearance(entry.path, { icon: normalizeLibraryIcon(icon) })}
          onAction={runEntryAction}
        >
          {#snippet titleContent(entry)}
            <!-- Индикатора доступности нет: состояние видно по метаданным. -->
            {#if entry.icon}
              <Icon name={entry.icon} class="h-3.5 w-3.5 shrink-0" />
            {/if}
            <strong class="min-w-0 flex-1 truncate role-title" data-testid="library-name">
              {libraryLabel(entry)}
            </strong>
          {/snippet}

          {#snippet trailing(entry)}
            <!-- Лейбл стоит на фоне карточки, как меню действий: цвет строки
                 сквозь него не просвечивает и подпись не меняет цвет. -->
            <Badge variant="outline" class="bg-[var(--card)]">
              {providerLabel(entry.providerName)}
            </Badge>
          {/snippet}
        </EntityList>
      {/if}
    </div>
  </div>

  <!--
    Правка названия и описания — диалогом: список показывается и списком, и
    плиткой, а встраиваемая форма не поместилась бы в узкую плитку. Сама форма —
    общий компонент дизайн-системы, тот же, что у вкладки.
  -->
  <Dialog
    open={editingEntry !== null && editingField !== null}
    title={editingDialog.title}
    onOpenChange={(next) => !next && cancelEditing()}
  >
    {#if editingField}
      {#key `${editingEntry?.path}:${editingField}`}
        <NameDescriptionEditor
          label={editingDialog.label}
          value={editingValue}
          multiline={editingDialog.multiline}
          testId="library-appearance-editor"
          onSave={commitEditing}
          onCancel={cancelEditing}
        />
      {/key}
    {/if}
  </Dialog>
</PageShell>
