import { describe, expect, it } from 'vitest';
import { normalizeQuery, searchBook, searchChapterText, SEARCH_LIMIT } from './search';
import { chapterTextOf } from './anchor';
import { SEARCH_ACTIVE_CLASS, SEARCH_CLASS, clearSearchHighlights, highlightSearchHits } from './search-mark';

/** Раздел главы с разметкой внутри. */
function chapter(html: string, index = 0): HTMLElement {
    const section = document.createElement('section');
    section.className = 'context-chapter';
    section.dataset.chapter = String(index);
    section.innerHTML = html;
    document.body.append(section);
    return section;
}

describe('поиск по тексту книги', () => {
    it('находит вхождение по смещениям символов того же текста, что у заметок', () => {
        const raw = 'Начало текста искомое слово и конец.';
        const result = searchChapterText(raw, 'искомое слово', 0);

        expect(result.hits).toHaveLength(1);
        const hit = result.hits[0];
        expect(raw.slice(hit.start, hit.end)).toBe('искомое слово');
        expect(hit.chapter).toBe(0);
    });

    it('находит фразу, разделённую переносом строки и вложенной разметкой', () => {
        const section = chapter('<p>Искомое\n   <em>слово</em> в тексте</p>');
        const raw = chapterTextOf(section) ?? '';
        const result = searchChapterText(raw, 'искомое слово', 0);

        expect(result.hits).toHaveLength(1);
        expect(raw.slice(result.hits[0].start, result.hits[0].end)).toContain('Искомое');
    });

    it('не зависит от регистра и серий пробелов в запросе', () => {
        const result = searchChapterText('СЛОВО в тексте', '  слово  ', 0);

        expect(normalizeQuery('  Сло во  ')).toBe('сло во');
        expect(result.hits).toHaveLength(1);
        expect(result.hits[0].preview).toContain('СЛОВО');
    });

    it('показывает фрагмент вокруг вхождения с пометкой краёв', () => {
        const raw = `${'до '.repeat(60)}искомое${' после'.repeat(60)}`;
        const hit = searchChapterText(raw, 'искомое', 0).hits[0];

        expect(hit.preview.startsWith('…')).toBe(true);
        expect(hit.preview.endsWith('…')).toBe(true);
        expect(hit.preview).toContain('искомое');
    });

    it('обрезает вхождения по пределу и сообщает об этом', () => {
        const raw = 'слово '.repeat(SEARCH_LIMIT + 10);
        const result = searchChapterText(raw, 'слово', 0);

        expect(result.hits).toHaveLength(SEARCH_LIMIT);
        expect(result.truncated).toBe(true);
    });

    it('ищет по всем главам в порядке чтения', () => {
        const first = chapter('<p>общее слово</p>', 0);
        const second = chapter('<p>и тут общее слово</p>', 1);
        const result = searchBook([first, second], 'общее', chapterTextOf);

        expect(result.hits.map((hit) => hit.chapter)).toEqual([0, 1]);
        expect(result.truncated).toBe(false);
    });

    it('повторный поиск по большой книге не перебирает символы заново', () => {
        // Реалистичный объём: сотни тысяч символов в одной главе. Карта
        // смещений строится один раз на главу, поэтому второй запрос не должен
        // занимать заметно больше времени, чем первый.
        const words = Array.from({ length: 40000 }, (_, index) => `слово${index % 7}`);
        const section = chapter(`<p>${words.join(' ')}</p>`);
        const raw = chapterTextOf(section) ?? '';
        expect(raw.length).toBeGreaterThan(200_000);

        const startedFirst = performance.now();
        searchBook([section], 'слово3', () => raw);
        const first = performance.now() - startedFirst;

        const startedSecond = performance.now();
        searchBook([section], 'слово5', () => raw);
        const second = performance.now() - startedSecond;

        // Второй поиск не собирает карту заново: он не медленнее первого.
        expect(second).toBeLessThan(Math.max(50, first * 1.5));
    });

    it('кэш нормализованного текста учитывает изменение главы', () => {        const section = chapter('<p>старое слово</p>');
        const raw = chapterTextOf(section) ?? '';
        expect(searchBook([section], 'старое', () => raw).hits).toHaveLength(1);

        // Разметка главы сменилась (например, книга пересобрана): поиск обязан
        // идти по новому тексту, а не по устаревшей карте.
        section.innerHTML = '<p>новое слово</p>';
        const updated = chapterTextOf(section) ?? '';
        const result = searchBook([section], 'новое', () => updated);

        expect(result.hits).toHaveLength(1);
        expect(updated.slice(result.hits[0].start, result.hits[0].end)).toBe('новое');
        expect(searchBook([section], 'старое', () => updated).hits).toHaveLength(0);
    });

    it('пустой запрос ничего не находит', () => {
        expect(searchChapterText('текст', '   ', 0).hits).toHaveLength(0);
    });
});

describe('подсветка найденного', () => {
    it('оборачивает вхождения в mark и снимает разметку без следа', () => {
        const section = chapter('<p>искомое слово</p>');
        const raw = chapterTextOf(section) ?? '';
        const hit = searchChapterText(raw, 'искомое', 0).hits[0];

        expect(highlightSearchHits(section, [hit])).toBe(true);
        const mark = section.querySelector(`mark.${SEARCH_CLASS}`);
        expect(mark?.textContent).toBe('искомое');
        // Смещение вхождения сохраняется в разметке: по нему ставится активное.
        expect((mark as HTMLElement).dataset.start).toBe(String(hit.start));

        clearSearchHighlights(section);
        expect(section.querySelector(`mark.${SEARCH_CLASS}`)).toBeNull();
        expect(section.textContent).toBe('искомое слово');
        expect(chapterTextOf(section)).toBe('искомое слово');
    });

    it('подсветка множества вхождений укладывается в разумное время', () => {
        // Прежняя реализация обходила дерево главы на каждое вхождение: на
        // книге с сотнями вхождений это занимало секунды и подвешивало
        // интерфейс. Здесь подсветка ставится за один обход.
        const words = Array.from({ length: 2000 }, () => 'слово');
        const section = chapter(`<p>${words.join(' ')}</p>`);
        const raw = chapterTextOf(section) ?? '';
        const hits = searchChapterText(raw, 'слово', 0, 400).hits;

        const started = performance.now();
        highlightSearchHits(section, hits);
        const elapsed = performance.now() - started;

        expect(section.querySelectorAll(`mark.${SEARCH_CLASS}`)).toHaveLength(hits.length);
        expect(elapsed).toBeLessThan(400);
    });

    it('выделяет активное вхождение отдельным классом', () => {
        const section = chapter('<p>слово и слово</p>');
        const raw = chapterTextOf(section) ?? '';
        const hits = searchChapterText(raw, 'слово', 0).hits;

        highlightSearchHits(section, hits, hits[1].start);

        const active = section.querySelector(`.${SEARCH_ACTIVE_CLASS}`);
        expect(active?.textContent).toBe('слово');
        expect(section.querySelectorAll(`.${SEARCH_ACTIVE_CLASS}`)).toHaveLength(1);
    });

    it('не портит разметку заметок при снятии подсветки поиска', () => {
        const section = chapter('<p>слово <mark class="context-note" data-note-id="n1">цитата</mark></p>');
        const raw = chapterTextOf(section) ?? '';
        highlightSearchHits(section, searchChapterText(raw, 'слово', 0).hits);

        clearSearchHighlights(section);

        expect(section.querySelector('mark.context-note')?.textContent).toBe('цитата');
    });
});
