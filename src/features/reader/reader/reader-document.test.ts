import { describe, expect, it } from 'vitest';
import { NOTE_COLORS } from '../../notes/notes';
import {
    buildDocument,
    CHAPTER_CLASS,
    FLASH_CLASS,
    NOTE_CLASS,
    SELECTION_BAND_CLASS,
    SELECTION_LAYER_CLASS,
} from './reader-document';

/** Документ с одной главой для проверки оформления. */
function documentFor(html = '<p>Текст</p>'): string {
    return buildDocument({
        title: 'Книга',
        authors: [],
        chapters: [{ title: null, html }],
    });
}

describe('документ книги', () => {
    it('содержит правило цвета для всех цветов палитры', () => {
        const html = documentFor();
        for (const color of NOTE_COLORS) {
            expect(html).toContain(`data-color="${color}"`);
            expect(html).toContain(`--note-${color}:`);
        }
        expect(NOTE_COLORS).not.toContain('black');
    });

    it('подсветка заметки берёт непрозрачный эквивалент тона', () => {
        const html = documentFor();
        // Полупрозрачные тона на перекрытии кусков давали бы тёмную полосу на стыке,
        // поэтому фон подсветки задаётся отдельной непрозрачной переменной.
        expect(html).toContain('--note-solid-yellow:');
        expect(html).toContain('background:var(--note-solid-yellow)');
    });

    it('содержит стили карточек, фигур и подсветки', () => {
        const html = documentFor();
        expect(html).toContain('.texture-note-card');
        expect(html).toContain('.texture-note-shape');
        expect(html).toContain(`.${CHAPTER_CLASS}{position:relative;}`);
        expect(html).toContain(`.${NOTE_CLASS}.${FLASH_CLASS}`);
    });

    it('над заметкой под инструментом «текст» показывает кликабельность', () => {
        const html = documentFor();
        // Новая карточка поверх существующей заметки не создаётся: клик открывает
        // её меню, но сама заметка кликабельна — курсор это показывает (как в
        // плагине PDF).
        expect(html).toContain(
            'body[data-tool="text"] .texture-note-card,body[data-tool="shape"] .texture-note-card,',
        );
        expect(html).toContain('cursor:pointer !important;');
    });

    it('задаёт оформление для обеих сторон темы области чтения', () => {
        const html = documentFor();
        // Правила есть для каждой палитры и обеих сторон: смена палитры в настройках
        // не требует пересборки документа книги.
        expect(html).toContain("html[data-reader-palette='linen'][data-reader-theme='light']");
        expect(html).toContain("html[data-reader-palette='linen'][data-reader-theme='dark']");
        expect(html).toContain("html[data-reader-palette='cobalt'][data-reader-theme='dark']");
        // Базовая вёрстка берёт фон и текст из переменных темы области чтения.
        expect(html).toContain('background:var(--rt-background)');
        expect(html).toContain('color:var(--rt-foreground)');
        // Заливку рисует собственный слой (как в PDF), а нативное выделение
        // прозрачно: движки красят `::selection` по-разному.
        expect(html).toContain('::selection{background:transparent;}');
        expect(html).toContain(
            '.texture-selection-band{position:absolute;border-radius:2px;background:var(--rt-selection);}',
        );
        expect(html).toContain('--rt-selection:');
    });

    it('содержит слой активного выделения и токены его меток', () => {
        const html = documentFor();
        expect(html).toContain(`.${SELECTION_LAYER_CLASS}`);
        expect(html).toContain(`.${SELECTION_BAND_CLASS}`);
        // Вертикальные метки — только у краёв всего выделения: левая в начале,
        // правая в конце; у промежуточных строк меток нет.
        expect(html).toContain(`[data-edge="start"]::before`);
        expect(html).toContain(`[data-edge="end"]::after`);
        expect(html).toContain(`[data-edge="both"]::before`);
        expect(html).toContain(`[data-edge="both"]::after`);
        expect(html).toContain('--rt-selection-edge');
        expect(html).toContain('--rt-selection-edge-width');
        // Метка центрируется на границе полосы (на полширины внутрь и наружу): её
        // середина совпадает с краем выделения, а полоса не кажется шире на толщину
        // метки (как в плагине PDF).
        expect(html).toContain('left:calc(-0.5 * var(--rt-selection-edge-width,1px))');
        expect(html).toContain('right:calc(-0.5 * var(--rt-selection-edge-width,1px))');
    });

    it('задаёт типографику книги: заголовки по уровням и цитаты', () => {
        const html = documentFor();
        // Без собственной типографики книга с оформлением в классах (или вовсе без
        // CSS) выглядела ровным текстом: заголовки того же кегля, что и абзацы.
        expect(html).toContain('h1{font-size:1.8em;}');
        expect(html).toContain('h2{font-size:1.5em;}');
        expect(html).toContain('h3{font-size:1.3em;}');
        expect(html).toContain('h1,h2,h3,h4,h5,h6{');
        expect(html).toContain('blockquote{');
        expect(html).toContain('ul,ol{');
        expect(html).toContain('table{border-collapse:collapse;');
        // Ни одного абсолютного размера в типографике: всё следует за масштабом.
        expect(html).not.toMatch(/h1\{font-size:\d+px/);
    });

    it('закрепляет поля и ширину колонки за читалкой', () => {
        const html = documentFor();
        // Издательский CSS книги снимал поля `body`, и текст прижимался к левому
        // краю области чтения. Каркас документа объявлен с `!important`.
        expect(html).toContain('body{margin:0 auto !important;max-width:760px !important;');
        expect(html).toContain('padding:24px 32px !important;');
        expect(html).toContain('box-sizing:border-box;');
    });

    it('проставляет гарнитуру книги на корень и выбирает её атрибутом', () => {
        const serif = documentFor();
        // Семейства обеих гарнитур заданы сразу, как палитры и стороны темы:
        // смена шрифта не пересобирает содержимое книги.
        expect(serif).toContain("html[data-reader-font='serif'] body{font-family:");
        expect(serif).toContain("html[data-reader-font='sans'] body{font-family:");
        expect(serif).toContain('data-reader-font="serif"');
        const sans = buildDocument(
            { title: 'Книга', authors: [], chapters: [{ title: null, html: '<p>Текст</p>' }] },
            { readerFont: 'sans' },
        );
        expect(sans).toContain('data-reader-font="sans"');
    });

    it('проставляет стартовую тему области чтения на корень', () => {
        const light = documentFor();
        expect(light).toContain('data-reader-theme="light"');
        const dark = buildDocument(
            { title: 'Книга', authors: [], chapters: [{ title: null, html: '<p>Текст</p>' }] },
            { readerTheme: 'dark' },
        );
        expect(dark).toContain('data-reader-theme="dark"');
    });

    it('стороны темы различают фон и мягкие тона заметок', () => {
        const html = documentFor();
        const light =
            html.match(
                /html\[data-reader-palette='linen'\]\[data-reader-theme='light'\]\{([^}]*)\}/,
            )?.[1] ?? '';
        const dark =
            html.match(
                /html\[data-reader-palette='linen'\]\[data-reader-theme='dark'\]\{([^}]*)\}/,
            )?.[1] ?? '';
        expect(light).toContain('--rt-background');
        expect(dark).toContain('--rt-background');
        expect(light).not.toBe(dark);
    });

    it('различает палитры при одной стороне темы', () => {
        // Дефект: сменив палитру в настройках, читатель оставался с прежними цветами,
        // потому что документ собирался один раз под одну палитру.
        const html = documentFor();
        const linen =
            html.match(
                /html\[data-reader-palette='linen'\]\[data-reader-theme='dark'\]\{([^}]*)\}/,
            )?.[1] ?? '';
        const cobalt =
            html.match(
                /html\[data-reader-palette='cobalt'\]\[data-reader-theme='dark'\]\{([^}]*)\}/,
            )?.[1] ?? '';
        expect(linen).toContain('--rt-background');
        expect(cobalt).toContain('--rt-background');
        expect(linen).not.toBe(cobalt);
    });

    it('размечает каждую главу разделом с индексом', () => {
        const html = buildDocument({
            title: 'Книга',
            authors: [],
            chapters: [
                { title: null, html: '<p>Первая</p>' },
                { title: null, html: '<p>Вторая</p>' },
            ],
        });
        expect(html).toContain(
            `<section class="${CHAPTER_CLASS}" data-chapter="0"><p>Первая</p></section>`,
        );
        expect(html).toContain(
            `<section class="${CHAPTER_CLASS}" data-chapter="1"><p>Вторая</p></section>`,
        );
    });
});
