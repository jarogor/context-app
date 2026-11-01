/** Контроллер заметок активной книги: состояние набора и операции хранилища.
 *
 * Оболочка владеет только книгой активной вкладки (её ключом и доступными
 * типами) и отображением; загрузка наборов, заметок и их изменение выполняются
 * здесь. Контроллер инкапсулирует состояние (`notes`/`sets`/`setId`), отбрасывает
 * ответы устаревших запросов по номеру и повторяет прежние эффекты загрузки:
 * при смене книги и при внешнем изменении хранилища (`revision`).
 */

import { untrack } from 'svelte';
import {
  addQuote,
  addShapeNote,
  addTextNote,
  changeNoteColor,
  createSet,
  deleteNote,
  deleteSet,
  DEFAULT_NOTE_TOOL,
  defaultSetName,
  getSet,
  listSets,
  loadSets,
  noteList,
  normalizeNoteTool,
  renameSet,
  resetToolTypeAfterCreate,
  resolveActiveSetId,
  setActiveSet,
  updateNoteDetails,
  updateNotePlacement,
  updateNoteText,
  type Note,
  type NoteColor,
  type NoteListItem,
  type NoteSetSummary,
  type NoteTool,
  type NoteType,
  type ShapeKind,
} from './notes';
import type { QuoteAnchor } from '../reader/reader/anchor';

/** Результат создания контроллера заметок активной книги. */
export type NotesController = ReturnType<typeof createNotesController>;

/** Функция-геттер ключа книги активной вкладки. */
type BookKeyGetter = () => string | null;

/** Функция-геттер доступных типов заметок активной книги. */
type AllowedTypesGetter = () => readonly NoteType[];

/** Функция-геттер отображаемого имени книги активной вкладки. */
type BookTitleGetter = () => string;

/** Создание контроллера заметок активной книги.
 *
 * @param bookKeyOf Ключ книги активной вкладки (для набора и хранилища).
 * @param allowedTypesOf Доступные типы заметок текущего формата.
 * @param bookTitleOf Отображаемое имя книги для создаваемого набора.
 */
export function createNotesController(
  bookKeyOf: BookKeyGetter,
  allowedTypesOf: AllowedTypesGetter,
  bookTitleOf: BookTitleGetter,
) {
  /** Заметки набора активной книги. */
  let notes: Note[] = $state([]);

  /** Идёт ли загрузка заметок книги. */
  let loading = $state(false);

  /** Наборы заметок книги активной вкладки. */
  let sets: NoteSetSummary[] = $state([]);

  /** Идентификатор активного набора заметок книги. */
  let setId: string | null = $state(null);

  /** Активный инструмент создания заметок (оболочка владеет выбором). */
  let tool: NoteTool = $state({ ...DEFAULT_NOTE_TOOL });

  /** Ошибка операций заметок для сообщения в шапке. */
  let error = $state<string | null>(null);

  /** Номер внешнего изменения заметок из события хранилища. */
  let revision = $state(0);

  /** Активный набор заметок по книге: ключ книги → идентификатор выбранного набора. */
  let activeSetByBook: Record<string, string> = {};

  /** Загруженные заметки наборов книги: идентификатор набора → заметки. */
  let loadedNotesSets: Record<string, Note[]> = {};

  /** Идентификатор книги, к которой относятся загруженные наборы. */
  let loadedNotesBook: string | null = null;

  /** Номер последнего запроса заметок: ответы устаревших запросов отбрасываются. */
  let loadToken = 0;

  /** Элементы списка заметок для панели: только доступные типы текущего формата.
   *
   * В текучем формате (EPUB) недоступные типы (текст, фигура) не показываются
   * ни в панели, ни в книге — те же элементы идут и в читалку. Данные сохраняются.
   */
  const items = $derived(
    noteList(notes.filter((note) => allowedTypesOf().includes(note.type))),
  );

  /** Смена активного инструмента заметок. */
  function setTool(value: NoteTool) {
    tool = normalizeNoteTool(value, allowedTypesOf());
  }

  /** Сброс инструмента на «цитату» после создания текста или фигуры.
   *
   * Пользователь сам выбирает кнопку «текст» или «фигура», ставит заметку — и
   * возвращается к цитате, чтобы следующая заметка по умолчанию снова была
   * цитатой. Выбранный цвет и вид фигуры сохраняются.
   */
  function resetToolAfterCreate() {
    tool = resetToolTypeAfterCreate(tool);
  }

  /** Показ заметок набора, запоминание выбора для книги и кеш загруженных наборов. */
  function showSetNotes(key: string | null, nextSetId: string, value: Note[]) {
    setId = nextSetId;
    notes = value;
    loadedNotesSets = { ...loadedNotesSets, [nextSetId]: value };
    if (key) {
      activeSetByBook = { ...activeSetByBook, [key]: nextSetId };
      // Выбор дублируется в хранилище: активный набор переживает перезапуск.
      void setActiveSet(key, nextSetId).catch((cause) => {
        error = String(cause);
      });
    }
  }

  /** Сброс состояния заметок, относящегося к прежней книге.
   *
   * Наборы принадлежат книге, поэтому при смене ключа книги список наборов и
   * заметки активного набора очищаются синхронно, не дожидаясь ответа хранилища.
   * Иначе до ответа (или при ошибке загрузки) панель показывала бы наборы и
   * заметки прежней книги — «протечка» между книгами.
   */
  function resetForBook(key: string | null) {
    loadedNotesBook = key;
    loadedNotesSets = {};
    sets = [];
    notes = [];
    setId = null;
    loading = false;
    loadToken += 1;
  }

  /** Загрузка наборов заметок книги и заметок активного набора.
   *
   * Активный набор выбирается на книгу: предпочтительный сохраняется, пока
   * принадлежит книге, иначе им становится первый набор. Заметки набора берутся
   * из кеша, если уже загружались: переключение вкладок не перечитывает их и не
   * показывает содержимое другого набора. Ответы устаревших запросов
   * отбрасываются по номеру запроса, чтобы фоновое событие не перетёрло
   * результат только что созданного или выбранного набора.
   */
  async function load() {
    const key = bookKeyOf();
    if (!key) {
      resetForBook(null);
      return;
    }
    if (loadedNotesBook !== key) {
      resetForBook(key);
    }
    const token = ++loadToken;
    const preferredId = activeSetByBook[key] ?? null;
    loading = preferredId === null || loadedNotesSets[preferredId] === undefined;
    try {
      const { sets: loaded, activeSetId } = await loadSets(key);
      if (token !== loadToken) {
        return;
      }
      // Сохранённый в хранилище выбор используется, пока не выбран другой набор
      // в этом сеансе: так активный набор переживает перезапуск приложения.
      const preferred = activeSetByBook[key] ?? activeSetId ?? null;
      const activeId = resolveActiveSetId(loaded, preferred);
      sets = loaded;
      if (!activeId) {
        setId = null;
        notes = [];
        error = null;
        return;
      }
      const cached = loadedNotesSets[activeId];
      if (cached !== undefined) {
        showSetNotes(key, activeId, cached);
        error = null;
        return;
      }
      const set = await getSet(activeId);
      if (token !== loadToken) {
        return;
      }
      showSetNotes(key, activeId, set.notes);
      error = null;
    } catch (cause) {
      if (token !== loadToken) {
        return;
      }
      error = String(cause);
    } finally {
      if (token === loadToken) {
        loading = false;
      }
    }
  }

  /** Переключение активного набора книги. */
  async function selectSet(nextSetId: string) {
    const key = bookKeyOf();
    if (!key || nextSetId === setId) {
      return;
    }
    const token = ++loadToken;
    const cached = loadedNotesSets[nextSetId];
    if (cached !== undefined) {
      showSetNotes(key, nextSetId, cached);
      error = null;
      loading = false;
      return;
    }
    setId = nextSetId;
    loading = true;
    try {
      const set = await getSet(nextSetId);
      if (token !== loadToken) {
        return;
      }
      showSetNotes(key, nextSetId, set.notes);
      error = null;
    } catch (cause) {
      if (token !== loadToken) {
        return;
      }
      error = String(cause);
    } finally {
      if (token === loadToken) {
        loading = false;
      }
    }
  }

  /** Создание набора книги с непустым именем; он становится активным и пустым. */
  async function createSetForActiveBook(name: string) {
    const key = bookKeyOf();
    const trimmed = name.trim();
    if (!key || !trimmed) {
      return;
    }
    try {
      const set = await createSet(key, trimmed, bookTitleOf());
      // Пользователь мог переключить книгу, пока набор создавался: результат
      // принадлежит прежней книге и в текущей панели показываться не должен.
      if (bookKeyOf() !== key) {
        return;
      }
      // Новый набор — самый свежий запрос: фоновое событие `notes:changed`
      // не должно перетереть показанный пустой набор прежним активным.
      loadToken += 1;
      sets = await listSets(key);
      if (bookKeyOf() !== key) {
        return;
      }
      showSetNotes(key, set.id, set.notes);
      error = null;
      loading = false;
    } catch (cause) {
      error = String(cause);
    }
  }

  /** Переименование набора книги. */
  async function renameSetForActiveBook(nextSetId: string, name: string) {
    const key = bookKeyOf();
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    try {
      await renameSet(nextSetId, trimmed);
      if (key && bookKeyOf() === key) {
        const loaded = await listSets(key);
        if (bookKeyOf() === key) {
          sets = loaded;
        }
      }
      error = null;
    } catch (cause) {
      error = String(cause);
    }
  }

  /** Удаление набора книги; активным становится оставшийся набор. */
  async function removeSetForActiveBook(removeId: string) {
    const key = bookKeyOf();
    if (!key) {
      return;
    }
    try {
      await deleteSet(removeId);
      // Список и активный набор пересчитываются только для той же книги:
      // ответ по прежней книге не должен подменять текущую панель.
      if (bookKeyOf() !== key) {
        return;
      }
      loadToken += 1;
      const remaining = { ...loadedNotesSets };
      delete remaining[removeId];
      loadedNotesSets = remaining;
      const remembered =
        activeSetByBook[key] === removeId ? null : (activeSetByBook[key] ?? null);
      const loaded = await listSets(key);
      if (bookKeyOf() !== key) {
        return;
      }
      const activeId = resolveActiveSetId(loaded, remembered);
      sets = loaded;
      if (!activeId) {
        setId = null;
        notes = [];
        const cleared = { ...activeSetByBook };
        delete cleared[key];
        activeSetByBook = cleared;
        error = null;
        return;
      }
      const active = remaining[activeId];
      if (active !== undefined) {
        showSetNotes(key, activeId, active);
        error = null;
        return;
      }
      notes = (await getSet(activeId)).notes;
      if (bookKeyOf() !== key) {
        return;
      }
      showSetNotes(key, activeId, notes);
      error = null;
    } catch (cause) {
      error = String(cause);
    }
  }

  /** Получение активного набора книги, при отсутствии — его создание. */
  async function ensureActiveSet(key: string): Promise<string | null> {
    let activeId = activeSetByBook[key] ?? setId;
    if (!activeId) {
      const set = await createSet(key, defaultSetName(), bookTitleOf());
      activeId = set.id;
      sets = await listSets(key);
    }
    return activeId;
  }

  /** Добавление заметки-цитаты, созданной выделением в книге, в активный набор. */
  async function addQuoteFromSelection(anchor: QuoteAnchor, color: NoteColor) {
    const key = bookKeyOf();
    if (!key) {
      return;
    }
    try {
      let activeId = activeSetByBook[key] ?? setId;
      if (!activeId) {
        const set = await createSet(key, defaultSetName(), bookTitleOf());
        activeId = set.id;
        sets = await listSets(key);
      }
      const updated = await addQuote(
        key,
        anchor,
        {
          id: activeId,
          bookKey: key,
          bookTitle: bookTitleOf(),
          name: '',
          createdAtMillis: 0,
          notes,
        },
        color,
      );
      showSetNotes(key, activeId, updated.notes);
      error = null;
    } catch (cause) {
      error = String(cause);
    }
  }

  /** Добавление текстовой карточки в точке книги в активный набор. */
  async function addTextNoteAtPoint(anchor: QuoteAnchor, text: string, color: NoteColor) {
    const key = bookKeyOf();
    const activeId = key ? await ensureActiveSet(key) : null;
    if (!key || !activeId) {
      return;
    }
    try {
      const updated = await addTextNote(key, activeId, anchor, text, color);
      showSetNotes(key, activeId, updated.notes);
      error = null;
      resetToolAfterCreate();
    } catch (cause) {
      error = String(cause);
    }
  }

  /** Добавление заметки-фигуры, нарисованной в книге, в активный набор. */
  async function addShapeFromDrawing(
    anchor: QuoteAnchor,
    shape: ShapeKind,
    geometry: string,
    color: NoteColor,
  ) {
    const key = bookKeyOf();
    const activeId = key ? await ensureActiveSet(key) : null;
    if (!key || !activeId) {
      return;
    }
    try {
      const updated = await addShapeNote(key, activeId, anchor, shape, geometry, color);
      showSetNotes(key, activeId, updated.notes);
      error = null;
      resetToolAfterCreate();
    } catch (cause) {
      error = String(cause);
    }
  }

  /** Идентификатор активного набора книги, к которому относится заметка. */
  function activeSetForNote(): { key: string; setId: string } | null {
    const key = bookKeyOf();
    if (!key) {
      return null;
    }
    const activeId = activeSetByBook[key] ?? setId;
    return activeId ? { key, setId: activeId } : null;
  }

  /** Смена цвета подсветки существующей заметки. */
  async function recolor(noteId: string, color: NoteColor) {
    const active = activeSetForNote();
    if (!active) {
      return;
    }
    try {
      const updated = await changeNoteColor(active.key, active.setId, noteId, color);
      showSetNotes(active.key, active.setId, updated.notes);
      error = null;
    } catch (cause) {
      error = String(cause);
    }
  }

  /** Изменение названия и комментария существующей заметки. */
  async function editDetails(noteId: string, details: { title: string; comment: string }) {
    const active = activeSetForNote();
    if (!active) {
      return;
    }
    try {
      const updated = await updateNoteDetails(active.key, active.setId, noteId, details);
      showSetNotes(active.key, active.setId, updated.notes);
      error = null;
    } catch (cause) {
      error = String(cause);
    }
  }

  /** Изменение текста и цвета текстовой карточки из её контекстного меню.
   *
   * Правка доступна прямо на странице: текст и цвет идут одним патчем, а
   * обновлённые заметки немедленно отражаются на карточке в книге и в списке.
   */
  async function editText(noteId: string, text: string, color: NoteColor) {
    const active = activeSetForNote();
    if (!active) {
      return;
    }
    try {
      const updated = await updateNoteText(active.key, active.setId, noteId, { text, color });
      showSetNotes(active.key, active.setId, updated.notes);
      error = null;
    } catch (cause) {
      error = String(cause);
    }
  }

  /** Перемещение заметки на странице или сдвиг границ её цитаты. */
  async function place(noteId: string, anchor: QuoteAnchor, geometry?: string) {
    const active = activeSetForNote();
    if (!active) {
      return;
    }
    try {
      const updated = await updateNotePlacement(active.key, active.setId, noteId, {
        anchor: JSON.stringify(anchor),
        quote: anchor.quote,
        chapter: String(anchor.chapter),
        percent: anchor.percent,
        geometry,
      });
      showSetNotes(active.key, active.setId, updated.notes);
      error = null;
    } catch (cause) {
      error = String(cause);
    }
  }

  /** Удаление заметки-цитаты. */
  async function remove(noteId: string) {
    const active = activeSetForNote();
    if (!active) {
      return;
    }
    try {
      const updated = await deleteNote(active.key, active.setId, noteId);
      showSetNotes(active.key, active.setId, updated.notes);
      error = null;
    } catch (cause) {
      error = String(cause);
    }
  }

  /** Поиск заметки в активном наборе по идентификатору. */
  function findNote(noteId: string): Note | undefined {
    return notes.find((candidate) => candidate.id === noteId);
  }

  /** Загрузка заметок при смене книги активной вкладки.
   *
   * Состояние прежней книги сбрасывается внутри самой загрузки, поэтому панель
   * не показывает наборы и заметки прошлой книги даже до ответа хранилища.
   */
  $effect(() => {
    if (!bookKeyOf()) {
      resetForBook(null);
      return;
    }
    void load();
  });

  /** Перечитывание заметок при внешнем изменении хранилища. */
  $effect(() => {
    const marker = revision;
    if (marker === 0) {
      return;
    }
    // Внешнее изменение могло затронуть любой набор: кеш заметок книги
    // сбрасывается, чтобы панель показала актуальное состояние.
    loadedNotesSets = {};
    void load();
  });

  /** Приведение инструмента к доступным типам при смене книги активной вкладки.
   *
   * Если активным был инструмент, недоступный текучему формату (например,
   * «фигура»), он становится цитатой; цвет сохраняется. Иначе скрытый инструмент
   * остался бы активным и создавал недоступную заметку.
   */
  $effect(() => {
    const types = allowedTypesOf();
    const next = normalizeNoteTool(tool, types);
    if (next !== tool) {
      tool = next;
    }
  });

  /** Отметка внешнего изменения заметок для перечитывания. */
  function markChanged() {
    revision += 1;
  }

  /** Запоминание активного набора книги до загрузки её заметок.
   *
   * Используется при переходе из реестра заметок: набор становится активным для
   * книги ещё до появления вкладки, поэтому `load` выберет именно его.
   */
  function rememberActiveSet(key: string, setId: string) {
    activeSetByBook = { ...activeSetByBook, [key]: setId };
    void setActiveSet(key, setId).catch((cause) => {
      error = String(cause);
    });
  }

  return {
    /** Заметки набора активной книги. */
    get notes() {
      return notes;
    },
    /** Элементы списка заметок для панели. */
    get items() {
      return items;
    },
    /** Наборы заметок книги. */
    get sets() {
      return sets;
    },
    /** Идентификатор активного набора. */
    get setId() {
      return setId;
    },
    /** Идёт ли загрузка. */
    get loading() {
      return loading;
    },
    /** Ошибка операций заметок. */
    get error() {
      return error;
    },
    /** Активный инструмент заметок. */
    get tool() {
      return tool;
    },
    setTool,
    load,
    selectSet,
    createSet: createSetForActiveBook,
    renameSet: renameSetForActiveBook,
    removeSet: removeSetForActiveBook,
    addQuote: addQuoteFromSelection,
    addTextNote: addTextNoteAtPoint,
    addShape: addShapeFromDrawing,
    recolor,
    editDetails,
    editText,
    place,
    remove,
    findNote,
    markChanged,
    rememberActiveSet,
  };
}
