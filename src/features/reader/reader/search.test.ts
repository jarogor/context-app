import { describe, expect, it } from 'vitest';
import { chapterTextOf } from './anchor';
import { normalizeQuery, searchBook, searchChapterText, SEARCH_LIMIT } from './search';
import {
    clearSearchHighlights,
    highlightSearchHits,
    SEARCH_ACTIVE_CLASS,
    SEARCH_CLASS,
} from './search-mark';

/** Раздел главы с разметкой внутри. */
function chapter(html: string, index = 0): HTMLElement {
    const section = document.createElement('section');
    section.className = 'context-chapter';
    section.dataset.chapter = String(index);
    section.innerHTML = html;
    document.body.append(section);
    return section;
}

describe('поиск по книге', () => {
    it('находит запрос по тексту глав и отдаёт места в смещениях, что у заметок', () => {
        const first = chapter('<p>Начало и <em>искомое</em>\n   слово</p>', 0);
        const second = chapter('<p>искомое слово ещё раз</p>', 1);
        const rawFirst = chapterTextOf(first) ?? '';

        const result = searchBook([first, second], 'ИСКОМОЕ  слово', chapterTextOf);

        // Найдено в обеих главах; регистр и серии пробелов не важны.
        expect(result.hits.map((hit) => hit.chapter)).toEqual([0, 1]);
        // Смещения — те же, по которым работает подсветка и якорь заметки.
        expect(rawFirst.slice(result.hits[0].start, result.hits[0].end)).toBe('искомое\n   слово');
        // Превью сжато по пробелам и содержит найденное.
        expect(result.hits[0].preview).toContain('искомое слово');
        expect(normalizeQuery('  Сло во  ')).toBe('сло во');
    });

    it('обрезает вхождения по пределу, пустой запрос ничего не ищет', () => {
        const long = searchChapterText('слово '.repeat(SEARCH_LIMIT + 10), 'слово', 0);
        expect(long.hits).toHaveLength(SEARCH_LIMIT);
        expect(long.truncated).toBe(true);
        expect(searchChapterText('текст', '   ', 0).hits).toHaveLength(0);
        expect(searchBook([chapter('<p>текст</p>')], '', chapterTextOf).hits).toHaveLength(0);
    });

    it('подсвечивает найденное отдельно от заметок и снимает разметку без следа', () => {
        const section = chapter(
            '<p>слово и <mark class="context-note" data-note-id="n1">цитата</mark> слово</p>',
        );
        const raw = chapterTextOf(section) ?? '';
        const hits = searchChapterText(raw, 'слово', 0).hits;

        highlightSearchHits(section, hits, hits[1].start);

        const marks = section.querySelectorAll(`mark.${SEARCH_CLASS}`);
        expect(marks).toHaveLength(2);
        // Активное вхождение помечено; подсветка помнит своё смещение.
        const active = section.querySelector(`.${SEARCH_ACTIVE_CLASS}`) as HTMLElement;
        expect(active).toBeTruthy();
        expect(Number(active.dataset.start)).toBe(hits[1].start);
        // Заметка не затронута поиском.
        expect(section.querySelector('mark.context-note')?.textContent).toBe('цитата');

        clearSearchHighlights(section);
        expect(section.querySelector(`mark.${SEARCH_CLASS}`)).toBeNull();
        expect(chapterTextOf(section)).toBe('слово и цитата слово');
    });

    it('повторный поиск и подсветка сотен вхождений не перебирают книгу заново', () => {
        // Реалистичный объём: карта текста строится один раз на главу, подсветка
        // ставится одним проходом по узлам. Иначе набор запроса подвешивал чтение.
        const words = Array.from({ length: 5000 }, () => 'слово');
        const section = chapter(`<p>${words.join(' ')}</p>`);
        const raw = chapterTextOf(section) ?? '';

        const startedSearch = performance.now();
        searchBook([section], 'слово', chapterTextOf);
        searchBook([section], 'слово', chapterTextOf);
        const searchMs = performance.now() - startedSearch;

        const hits = searchChapterText(raw, 'слово', 0, 500).hits;
        const startedMark = performance.now();
        highlightSearchHits(section, hits);
        const markMs = performance.now() - startedMark;

        expect(section.querySelectorAll(`mark.${SEARCH_CLASS}`)).toHaveLength(hits.length);
        // Пороги с большим запасом: тест ловит возврат к обходу дерева на каждое
        // вхождение, а не колебания машины.
        expect(searchMs).toBeLessThan(300);
        expect(markMs).toBeLessThan(400);
    });

    it('кэш текста главы учитывает её изменение', () => {
        const section = chapter('<p>старое слово</p>');
        expect(searchBook([section], 'старое', chapterTextOf).hits).toHaveLength(1);

        section.innerHTML = '<p>новое слово</p>';

        expect(searchBook([section], 'новое', chapterTextOf).hits).toHaveLength(1);
        expect(searchBook([section], 'старое', chapterTextOf).hits).toHaveLength(0);
    });
});
