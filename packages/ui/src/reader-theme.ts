/** Тема области чтения: оформление чтения книги, отдельное от интерфейса.
 *
 * Область чтения — изолированный документ в песочнице плагина формата и не
 * наследует CSS оболочки. Поэтому значения темы задаются здесь как данные, а не
 * CSS-токенами оболочки: хост передаёт их плагину сообщением.
 *
 * Тема области чтения переиспользует реестр палитр дизайн-системы и выбирает
 * сторону (светлую или тёмную) независимо от темы интерфейса. Модуль чист от
 * Svelte и DOM: только данные и нормализация.
 */

import { normalizePaletteId, type PaletteId } from './palettes';

/** Сторона темы области чтения. */
export type ReaderThemeId = 'light' | 'dark';

/** Значение темы области чтения по умолчанию — светлая. */
export const DEFAULT_READER_THEME: ReaderThemeId = 'light';

/** Все допустимые значения темы области чтения. */
export const READER_THEMES = ['light', 'dark'] as const;

/** Гарнитура книги: с засечками или без. */
export type ReaderFontId = 'serif' | 'sans';

/** Гарнитура книги по умолчанию — с засечками: так набирают художественную прозу. */
export const DEFAULT_READER_FONT: ReaderFontId = 'serif';

/** Все допустимые значения гарнитуры книги. */
export const READER_FONTS = ['serif', 'sans'] as const;

/** Семейство шрифта книги для каждой гарнитуры.
 *
 * Шрифты только системные: приложение не поставляет своих, поэтому книга
 * выглядит одинаково предсказуемо и грузится без задержки.
 */
export const READER_FONT_FAMILIES: Record<ReaderFontId, string> = {
    serif: "Georgia, 'Times New Roman', 'PT Serif', serif",
    sans: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
};

/** Токены оформления области чтения. */
export interface ReaderThemeTokens {
    /** Фон области чтения. */
    background: string;
    /** Цвет текста книги. */
    text: string;
    /** Цвет вторичного текста. */
    muted: string;
    /** Цвет ссылок. */
    link: string;
    /** Базовый цвет выделения текста: синеватый, в тон палитре. */
    selection: string;
    /** Цвет вертикальных меток по краям активного выделения. */
    selectionEdge: string;
    /** Толщина вертикальных меток выделения, в пикселях. */
    selectionEdgeWidth: number;
    /** Тон подсветки найденного поиском. */
    search: string;
    /** Тон подсветки вхождения, к которому ведёт переход. */
    searchActive: string;
}

/** Идентификаторы цветов заметок, общие для всех областей. */
export const READER_NOTE_COLOR_IDS = ['yellow', 'green', 'blue', 'red', 'purple'] as const;

/** Идентификатор цвета заметки. */
export type ReaderNoteColorId = (typeof READER_NOTE_COLOR_IDS)[number];

/** Мягкие тона заметок: подсветка цитаты, заливка фигуры, фон карточки, метка. */
export type ReaderNoteTones = Record<ReaderNoteColorId, string>;

/** Проверка, что значение — известная тема области чтения. */
export function isReaderThemeId(value: unknown): value is ReaderThemeId {
    return value === 'light' || value === 'dark';
}

/** Приведение произвольного значения к теме области чтения.
 *
 * Неизвестное или отсутствующее значение трактуется как светлая тема, чтобы
 * некорректные данные не оставляли область чтения без оформления.
 */
export function normalizeReaderThemeId(value: unknown): ReaderThemeId {
    return isReaderThemeId(value) ? value : DEFAULT_READER_THEME;
}

/** Установка темы области чтения на корень области содержимого.
 *
 * Устанавливает атрибут `data-reader-theme` (по аналогии с `data-theme`
 * интерфейса). Значения набора выбираются правилами документа по этому атрибуту.
 */
export function applyReaderTheme(id: unknown, root: HTMLElement = document.documentElement): void {
    root.dataset.readerTheme = normalizeReaderThemeId(id);
}

/** Установка палитры области чтения на корень области содержимого.
 *
 * Документ книги хранит наборы всех палитр и выбирает нужный по атрибуту
 * `data-reader-palette`, поэтому смена палитры не пересобирает содержимое: позиция
 * чтения и разметка заметок сохраняются.
 */
export function applyReaderPalette(
    id: unknown,
    root: HTMLElement = document.documentElement,
): void {
    root.dataset.readerPalette = normalizePaletteId(id);
}

/** Токены области чтения для палитры и стороны. */
export function readerThemeTokens(palette: PaletteId, id: ReaderThemeId): ReaderThemeTokens {
    const base = id === 'dark' ? DARK_READER_TOKENS[palette] : LIGHT_READER_TOKENS[palette];
    // Тон найденного поиском — не цвет заметки. В светлой теме это жёлтый:
    // на бумаге он читается как «найдено» и не спорит с тёмным текстом.
    // Остальные вхождения достаточно плотные, чтобы их было видно на бумаге:
    // бледный жёлтый терялся, и находилось только текущее вхождение. В тёмной
    // теме жёлтый совпадал по светлоте с цветом текста и сливался с ним; там
    // подсветка синяя — другой оттенок, поэтому найденное видно, а буквы
    // остаются различимыми.
    //
    // Текущее вхождение отличается не только плотностью, но и оттенком:
    // янтарный против жёлтого. Одной плотности мало — на светлой бумаге
    // плотный жёлтый и янтарный почти неразличимы.
    return id === 'dark'
        ? { ...base, search: 'rgba(96, 140, 200, 0.55)', searchActive: 'rgba(125, 190, 255, 0.95)' }
        : { ...base, search: 'rgba(242, 205, 82, 0.95)', searchActive: 'rgba(238, 116, 12, 1)' };
}

/** Светлые тона заметок: насыщенные, но среднесветлые оттенки.
 *
 * Пастельные тона были слишком выбелены и читались «не собой»: зелёный уходил в
 * бирюзу, красный в розовый, фиолетовый в лаванду. Здесь каждый цвет задан в
 * своём оттенке с достаточной насыщенностью, но остаётся достаточно светлым,
 * чтобы тёмный текст книги читался поверх подсветки.
 */
const LIGHT_NOTE_TONES: ReaderNoteTones = {
    yellow: '#f2cd52',
    green: '#82d991',
    blue: '#84adf0',
    red: '#ef817b',
    purple: '#bba0e8',
};

/** Тёмные тона заметок палитры «Лён».
 *
 * Приглушённые цвета с верными оттенками, полупрозрачные: на тёмном фоне книги
 * дают спокойную цветную подложку, поверх которой светлый текст остаётся
 * читаемым; при осветлении на тёмной странице PDF не «вспыхивают».
 */
const LINEN_DARK_NOTE_TONES: ReaderNoteTones = {
    yellow: 'rgba(214, 158, 46, 0.4)',
    green: 'rgba(104, 168, 74, 0.45)',
    blue: 'rgba(69, 118, 176, 0.5)',
    red: 'rgba(198, 64, 58, 0.4)',
    purple: 'rgba(150, 96, 196, 0.45)',
};

/** Тёмные тона заметок палитры «Индиго»: те же верные оттенки, приглушённые
 * полупрозрачностью — тот же приём, что и у «Льна». */
const COBALT_DARK_NOTE_TONES: ReaderNoteTones = {
    yellow: 'rgba(202, 150, 40, 0.4)',
    green: 'rgba(74, 158, 96, 0.45)',
    blue: 'rgba(70, 120, 190, 0.5)',
    red: 'rgba(206, 70, 70, 0.4)',
    purple: 'rgba(146, 96, 190, 0.45)',
};

/** Тёмные тона заметок палитры «Янтарь»: тёплые, как сама палитра. */
const GRUVBOX_DARK_NOTE_TONES: ReaderNoteTones = {
    yellow: 'rgba(250, 189, 47, 0.4)',
    green: 'rgba(184, 187, 38, 0.4)',
    blue: 'rgba(131, 165, 152, 0.45)',
    red: 'rgba(251, 73, 52, 0.4)',
    purple: 'rgba(211, 134, 155, 0.45)',
};

/** Тёмные тона заметок палитры «Графит»: нейтрально-холодные. */
const MIST_DARK_NOTE_TONES: ReaderNoteTones = {
    yellow: 'rgba(216, 173, 74, 0.4)',
    green: 'rgba(96, 168, 118, 0.45)',
    blue: 'rgba(104, 150, 214, 0.5)',
    red: 'rgba(214, 88, 88, 0.4)',
    purple: 'rgba(158, 116, 204, 0.45)',
};

/** Мягкие тона заметок для палитры и стороны темы области чтения. */
export function readerThemeNoteTones(palette: PaletteId, id: ReaderThemeId): ReaderNoteTones {
    if (id !== 'dark') {
        return LIGHT_NOTE_TONES;
    }
    if (palette === 'cobalt') {
        return COBALT_DARK_NOTE_TONES;
    }
    if (palette === 'gruvbox') {
        return GRUVBOX_DARK_NOTE_TONES;
    }
    if (palette === 'mist') {
        return MIST_DARK_NOTE_TONES;
    }
    return LINEN_DARK_NOTE_TONES;
}

/** Каналы цвета: компоненты 0..255 и прозрачность 0..1. */
interface ColorChannels {
    /** Красный канал. */
    red: number;
    /** Зелёный канал. */
    green: number;
    /** Синий канал. */
    blue: number;
    /** Прозрачность. */
    alpha: number;
}

/** Разбор цвета `#rrggbb` или `rgb()/rgba()` в каналы; `null` — неизвестный формат. */
function parseColorChannels(value: string): ColorChannels | null {
    const trimmed = value.trim();
    const hex = trimmed.match(/^#([0-9a-f]{6})$/i);
    if (hex) {
        const number = Number.parseInt(hex[1], 16);
        return {
            red: (number >> 16) & 255,
            green: (number >> 8) & 255,
            blue: number & 255,
            alpha: 1,
        };
    }
    const rgb = trimmed.match(
        /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i,
    );
    if (!rgb) {
        return null;
    }
    return {
        red: Number(rgb[1]),
        green: Number(rgb[2]),
        blue: Number(rgb[3]),
        alpha: rgb[4] ? Number(rgb[4]) : 1,
    };
}

/** Непрозрачный эквивалент тона поверх фона.
 *
 * Полупрозрачный тон, положенный на сплошной фон области чтения, даёт тот же
 * видимый цвет, что и смешение вручную. Для подсветки заметки в EPUB это
 * важно: её фон рисуется перенесёнными кусками, которые при дробном масштабе
 * перекрываются, а наложение полупрозрачных слоёв складывало бы альфу и давало
 * тёмную полосу на стыке. Непрозрачный цвет такой шов не показывает.
 */
export function blendNoteToneOverBackground(tone: string, background: string): string {
    const foreground = parseColorChannels(tone);
    const backdrop = parseColorChannels(background);
    if (!foreground || !backdrop) {
        return tone;
    }
    const mix = (back: number, front: number): number =>
        Math.round(foreground.alpha * front + (1 - foreground.alpha) * back);
    return `rgb(${mix(backdrop.red, foreground.red)}, ${mix(backdrop.green, foreground.green)}, ${mix(backdrop.blue, foreground.blue)})`;
}

/** Непрозрачные тона заметок для сплошного фона области чтения.
 *
 * Используются только подсветкой цитаты в EPUB (см. `blendNoteToneOverBackground`);
 * карточки, фигуры и PDF сохраняют исходные полупрозрачные тона.
 */
export function solidNoteTones(tones: ReaderNoteTones, background: string): ReaderNoteTones {
    const solid = {} as ReaderNoteTones;
    for (const color of READER_NOTE_COLOR_IDS) {
        solid[color] = blendNoteToneOverBackground(tones[color], background);
    }
    return solid;
}

/** Токены всплывающего слоя поверх области чтения.
 *
 * Меню поверх книги живёт в документе оболочки, но относится к чтению: его
 * фон, текст и обводка обязаны совпадать со стороной темы области чтения, а не
 * с темой интерфейса. Слой поднимается над текстом тем же приёмом, что и тема
 * интерфейса: в светлой стороне — лёгким затемнением бумаги, в тёмной —
 * осветлением; обводка — тон чернил поверх фона.
 */
export interface ReaderOverlayTokens {
    /** Фон всплывающего слоя. */
    surface: string;
    /** Цвет текста слоя. */
    text: string;
    /** Цвет вторичного текста слоя. */
    muted: string;
    /** Обводка слоя. */
    border: string;
    /** Цвет ссылок слоя. */
    link: string;
    /** Подсветка наведения внутри слоя. */
    hover: string;
}

/** Смешение двух цветов в заданной доле переднего плана. */
function mixColors(back: string, front: string, ratio: number): string {
    const backdrop = parseColorChannels(back);
    const foreground = parseColorChannels(front);
    if (!backdrop || !foreground) {
        return back;
    }
    const mix = (first: number, second: number): number =>
        Math.round(second * ratio + first * (1 - ratio));
    return `rgb(${mix(backdrop.red, foreground.red)}, ${mix(backdrop.green, foreground.green)}, ${mix(backdrop.blue, foreground.blue)})`;
}

/** Токены всплывающего слоя для палитры и стороны темы области чтения. */
export function readerOverlayTokens(palette: PaletteId, id: ReaderThemeId): ReaderOverlayTokens {
    const tokens = readerThemeTokens(normalizePaletteId(palette), normalizeReaderThemeId(id));
    return {
        // Слой отделяется от страницы тем же приёмом, что и в теме интерфейса:
        // на светлой бумаге — затемнением, на тёмной — осветлением.
        surface: mixColors(tokens.background, tokens.text, id === 'dark' ? 0.08 : 0.04),
        text: tokens.text,
        muted: tokens.muted,
        border: mixColors(tokens.background, tokens.text, id === 'dark' ? 0.18 : 0.16),
        link: tokens.link,
        // Полупрозрачный тон акцента поверх слоя: наведение заметно на любой
        // стороне темы, как в списках оболочки.
        hover: id === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
    };
}

/** Цвета перекраски страницы книги в тёмной теме.
 *
 * PDF — изображение листа: чтобы он не оставался белым, растр перекрашивается
 * по яркости. Куда уходит белая бумага (`paper`) и чёрный текст (`ink`) задаёт
 * палитра: у «Льна» бумага тёплая, у «Индиго» — холодная, поэтому и страница
 * сохраняет оттенок темы. Текст мягче чистого белого — так контраст ниже.
 */
export interface ReaderPageColors {
    /** Тёмная «бумага»: куда уходит белый фон страницы. */
    paper: string;
    /** Светлый «текст»: куда уходит чёрный текст страницы. */
    ink: string;
}

/** Тёплая бумага и мягкий текст «Льна» для страницы в тёмной теме. */
const LINEN_DARK_PAGE: ReaderPageColors = {
    paper: '#26292a',
    ink: '#d5c4a1',
};

/** Холодная бумага и мягкий текст «Индиго» для страницы в тёмной теме. */
/** Холодная синяя бумага и мягкий текст «Индиго» для страницы в тёмной теме. */
const COBALT_DARK_PAGE: ReaderPageColors = {
    paper: '#1b2946',
    ink: '#e4e9f4',
};

/** Тёплая бумага и мягкий текст «Янтаря» для страницы в тёмной теме. */
const GRUVBOX_DARK_PAGE: ReaderPageColors = {
    paper: '#26292a',
    ink: '#d5c4a1',
};

/** Холодная бумага и мягкий текст «Графита» для страницы в тёмной теме. */
/** Нейтральная графитовая бумага «Графита» для страницы в тёмной теме. */
const MIST_DARK_PAGE: ReaderPageColors = {
    paper: '#242729',
    ink: '#eceef0',
};

/** Цвета перекраски страницы по палитре (для тёмной стороны темы). */
export function readerPageColors(palette: PaletteId): ReaderPageColors {
    if (palette === 'cobalt') {
        return COBALT_DARK_PAGE;
    }
    if (palette === 'mist') {
        return MIST_DARK_PAGE;
    }
    if (palette === 'gruvbox') {
        return GRUVBOX_DARK_PAGE;
    }
    return LINEN_DARK_PAGE;
}

/** Токены области чтения без тонов поиска: основа по палитре и стороне. */
type ReaderBaseTokens = Omit<ReaderThemeTokens, 'search' | 'searchActive'>;

/** Светлые токены области чтения по палитрам. */
const LIGHT_READER_TOKENS: Record<PaletteId, ReaderBaseTokens> = {
    linen: {
        background: '#fbf8f1',
        text: '#1f1d1a',
        muted: '#6d675c',
        link: '#2e5c52',
        // Выделение в тон тёплой бумаги: приглушённый стально-синий, а не
        // стерильный системный синий. В PDF ложится умножением на светлую страницу.
        selection: 'rgba(96, 140, 180, 0.32)',
        // Метки по краям живого выделения: тот же синий, но плотнее фоновой заливки,
        // чтобы признак читался без опоры только на цвет.
        selectionEdge: 'rgba(60, 100, 145, 0.9)',
        selectionEdgeWidth: 1,
    },
    cobalt: {
        background: '#ffffff',
        text: '#16191f',
        muted: '#616a77',
        link: '#1d47a8',
        // Выделение «Индиго» — привычный синеватый цвет.
        selection: 'rgba(59, 130, 246, 0.28)',
        selectionEdge: 'rgba(37, 99, 235, 0.9)',
        selectionEdgeWidth: 1,
    },
    gruvbox: {
        background: '#fbf1c7',
        text: '#3c3836',
        muted: '#7c6f64',
        link: '#076678',
        selection: 'rgba(96, 140, 180, 0.35)',
        selectionEdge: 'rgba(60, 100, 145, 0.9)',
        selectionEdgeWidth: 1,
    },
    mist: {
        background: '#ffffff',
        text: '#1c2125',
        muted: '#6b7280',
        link: '#454b52',
        // «Графит» — нейтральная палитра: выделение серое, без синевы «Индиго».
        selection: 'rgba(120, 130, 140, 0.32)',
        selectionEdge: 'rgba(70, 78, 86, 0.9)',
        selectionEdgeWidth: 1,
    },
};

/** Тёмные токены области чтения по палитрам. */
const DARK_READER_TOKENS: Record<PaletteId, ReaderBaseTokens> = {
    linen: {
        background: '#17191a',
        text: '#e7e2d7',
        muted: '#9d968a',
        link: '#7db9a7',
        // На тёмной странице заливка ложится осветлением: цвет светлее и чуть
        // плотнее, чтобы выделение читалось на тёмной бумаге и не уходило в фиолет.
        selection: 'rgba(120, 160, 195, 0.33)',
        selectionEdge: 'rgba(150, 190, 220, 0.9)',
        selectionEdgeWidth: 1,
    },
    cobalt: {
        background: '#0c1526',
        text: '#e4e9f4',
        muted: '#90a0bd',
        link: '#6f9bf0',
        selection: 'rgba(96, 165, 250, 0.3)',
        selectionEdge: 'rgba(147, 197, 253, 0.9)',
        selectionEdgeWidth: 1,
    },
    gruvbox: {
        background: '#282828',
        text: '#ebdbb2',
        muted: '#a89984',
        link: '#83a598',
        selection: 'rgba(120, 160, 195, 0.33)',
        selectionEdge: 'rgba(150, 190, 220, 0.9)',
        selectionEdgeWidth: 1,
    },
    mist: {
        background: '#16181a',
        text: '#eceef0',
        muted: '#9aa0a6',
        link: '#b4bbc3',
        // Нейтральные серые тона выделения: без синевы «Индиго».
        selection: 'rgba(150, 158, 166, 0.3)',
        selectionEdge: 'rgba(200, 206, 212, 0.9)',
        selectionEdgeWidth: 1,
    },
};

/** Проверка, что значение — известная гарнитура книги. */
export function isReaderFontId(value: unknown): value is ReaderFontId {
    return value === 'serif' || value === 'sans';
}

/** Приведение произвольного значения к гарнитуре книги.
 *
 * Неизвестное или отсутствующее значение трактуется как шрифт с засечками:
 * некорректные данные не должны оставлять книгу без выбранного шрифта.
 */
export function normalizeReaderFontId(value: unknown): ReaderFontId {
    return isReaderFontId(value) ? value : DEFAULT_READER_FONT;
}

/** Семейство шрифта книги по гарнитуре. */
export function readerFontFamily(id: unknown): string {
    return READER_FONT_FAMILIES[normalizeReaderFontId(id)];
}

/** Установка гарнитуры книги на корень области содержимого.
 *
 * Ставит атрибут `data-reader-font` (по аналогии с `data-reader-theme`).
 * Документ книги выбирает семейство правилом по этому атрибуту, поэтому смена
 * шрифта не пересобирает содержимое: позиция чтения и заметки сохраняются.
 */
export function applyReaderFont(id: unknown, root: HTMLElement = document.documentElement): void {
    root.dataset.readerFont = normalizeReaderFontId(id);
}
