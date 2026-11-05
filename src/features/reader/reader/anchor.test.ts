import { describe, expect, it } from 'vitest';
import {
  createAnchor,
  createPageAnchor,
  createPointAnchor,
  isPageAnchor,
  isPointAnchor,
  offsetsFromRange,
  parseAnchor,
  rangeFromOffsets,
  resolveAnchorRange,
  serializeAnchor,
} from './anchor';

/** Корневой элемент главы с абзацами. */
function chapterRoot(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  return root;
}

describe('якорь выделения', () => {
  it('заполняет значения по умолчанию', () => {
    const anchor = createAnchor({});
    expect(anchor.v).toBe(1);
    expect(anchor.chapter).toBe(0);
    expect(anchor.start).toBe(0);
    expect(anchor.end).toBe(0);
    expect(anchor.quote).toBe('');
    expect(anchor.percent).toBe(0);
    expect(anchor.page).toBeNull();
  });

  it('переживает круговой обход', () => {
    const anchor = createAnchor({
      chapter: 2,
      start: 4,
      end: 9,
      quote: 'цитата',
      percent: 12.3456,
    });
    const restored = parseAnchor(serializeAnchor(anchor));
    expect(restored).toEqual(anchor);
  });

  it('повреждённая строка даёт null', () => {
    expect(parseAnchor('не json')).toBeNull();
    expect(parseAnchor('')).toBeNull();
    expect(parseAnchor(null)).toBeNull();
    expect(parseAnchor('{"start":1}')).toBeNull();
  });
});

describe('смещения выделения', () => {
  it('считает смещения в символах по всей главе', () => {
    const root = chapterRoot('<p>Привет</p><p>мир</p>');
    const first = root.querySelector('p')!.firstChild!;
    const second = root.querySelectorAll('p')[1].firstChild!;
    const range = document.createRange();
    range.setStart(first, 3);
    range.setEnd(second, 2);

    const offsets = offsetsFromRange(root, range);
    // «Привет» (6) + «мир» до 2 = 8; начало = 3.
    expect(offsets).toEqual({ start: 3, end: 8 });
  });

  it('возвращает диапазон по смещениям', () => {
    const root = chapterRoot('<p>Привет</p><p>мир</p>');
    const range = rangeFromOffsets(root, 3, 8);

    expect(range).not.toBeNull();
    expect(range!.toString()).toBe('ветми');
  });

  it('пустое выделение отклоняется', () => {
    const root = chapterRoot('<p>Привет</p>');
    const text = root.querySelector('p')!.firstChild!;
    const range = document.createRange();
    range.setStart(text, 3);
    range.setEnd(text, 3);
    expect(offsetsFromRange(root, range)).toBeNull();
  });

  it('смещения вне главы отклоняются', () => {
    const root = chapterRoot('<p>Привет</p>');
    expect(rangeFromOffsets(root, 10, 20)).toBeNull();
  });
});

describe('разрешение якоря в тексте главы', () => {
  it('берёт сохранённые смещения, когда текст под ними совпадает с цитатой', () => {
    const root = chapterRoot('<p>Привет</p><p>мир</p>');
    const anchor = createAnchor({ chapter: 0, start: 3, end: 8, quote: 'ветми' });

    const resolved = resolveAnchorRange(root, anchor);

    expect(resolved).not.toBeNull();
    expect(resolved!.byText).toBe(false);
    expect(resolved!.range.toString()).toBe('ветми');
  });

  it('находит место по тексту цитаты, когда смещения указывают мимо', () => {
    // Книга разобрана иначе: сохранённые смещения не совпадают с текстом,
    // а сама цитата в главе есть.
    const root = chapterRoot('<p>Привет</p><p>мир</p>');
    const anchor = createAnchor({ chapter: 0, start: 0, end: 3, quote: 'мир' });

    const resolved = resolveAnchorRange(root, anchor);

    expect(resolved).not.toBeNull();
    expect(resolved!.byText).toBe(true);
    expect(resolved!.range.toString()).toBe('мир');
  });

  it('находит цитату, разбитую разметкой на части', () => {
    const root = chapterRoot('<p>Слово <em>выделенное</em> и ещё жирное.</p>');
    const anchor = createAnchor({ chapter: 0, start: 0, end: 0, quote: 'Слово выделенное и' });

    const resolved = resolveAnchorRange(root, anchor);

    expect(resolved).not.toBeNull();
    expect(resolved!.byText).toBe(true);
    expect(resolved!.range.toString()).toBe('Слово выделенное и');
  });

  it('считает пробельные серии одним пробелом', () => {
    const root = chapterRoot('<p>Привет\n   мир</p>');
    const anchor = createAnchor({ chapter: 0, start: 0, end: 0, quote: 'Привет мир' });

    expect(resolveAnchorRange(root, anchor)?.byText).toBe(true);
  });

  it('возвращает null, если цитаты в главе нет', () => {
    const root = chapterRoot('<p>Привет</p>');
    const anchor = createAnchor({ chapter: 0, start: 0, end: 0, quote: 'чужая цитата' });

    expect(resolveAnchorRange(root, anchor)).toBeNull();
  });

  it('находит место в большой главе за один проход по кэшу', () => {
    // Реалистичный объём: сотни тысяч символов. Поиск не должен перебирать
    // символы построчно на каждую заметку — иначе книга открывается долго.
    const paragraphs = Array.from(
      { length: 6000 },
      (_, index) => `<p>Абзац ${index + 1}. Текст для проверки прокрутки книги.</p>`,
    ).join('');
    const root = chapterRoot(paragraphs);
    const quote = 'Абзац 5900. Текст для проверки прокрутки книги.';
    const anchor = createAnchor({ chapter: 0, start: 0, end: 0, quote });

    const first = resolveAnchorRange(root, anchor);
    expect(first).not.toBeNull();
    expect(first!.range.toString()).toBe(quote);

    // Повторное разрешение берёт готовый текст главы из кэша.
    const second = resolveAnchorRange(root, anchor);
    expect(second).not.toBeNull();
    expect(second!.range.toString()).toBe(quote);
  });

  it('находит место после того, как глава уже подсвечена', () => {
    // Подсветка заворачивает текст в `<mark>`: текст главы не меняется, и
    // поиск по цитате продолжает работать.
    const root = chapterRoot('<p>Привет</p><p>мир</p>');
    const first = resolveAnchorRange(
      root,
      createAnchor({ chapter: 0, start: 0, end: 6, quote: 'Привет' }),
    );
    expect(first).not.toBeNull();
    const range = first!.range;
    const mark = document.createElement('mark');
    range.surroundContents(mark);

    const anchor = createAnchor({ chapter: 0, start: 0, end: 3, quote: 'мир' });
    const resolved = resolveAnchorRange(root, anchor);

    expect(resolved).not.toBeNull();
    expect(resolved!.byText).toBe(true);
    expect(resolved!.range.toString()).toBe('мир');
  });
});

describe('страничный якорь', () => {
  it('создаётся по странице и прямоугольникам', () => {
    const anchor = createPageAnchor({
      page: 5,
      quote: 'цитата на странице',
      percent: 42,
      rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.05 }],
    });
    expect(anchor.kind).toBe('page');
    expect(anchor.page).toBe(5);
    expect(anchor.chapter).toBe(0);
    expect(anchor.start).toBe(0);
    expect(isPageAnchor(anchor)).toBe(true);
    expect(anchor.rects).toHaveLength(1);
  });

  it('переживает круговой обход', () => {
    const anchor = createPageAnchor({
      page: 3,
      quote: 'текст',
      percent: 30,
      rects: [
        { x: 0.1, y: 0.1, width: 0.2, height: 0.04 },
        { x: 0.1, y: 0.2, width: 0.5, height: 0.04 },
      ],
    });
    expect(parseAnchor(serializeAnchor(anchor))).toEqual(anchor);
  });

  it('некорректные прямоугольники отбрасываются', () => {
    const anchor = createPageAnchor({
      page: 1,
      rects: [
        { x: 0.1, y: 0.1, width: 0.2, height: 0.04 },
        { x: 'нет', y: 0, width: 1, height: 1 } as never,
      ],
    });
    expect(anchor.rects).toHaveLength(1);
  });

  it('старый текстовый якорь без вида читается как текстовый', () => {
    const restored = parseAnchor('{"chapter":2,"start":4,"end":9,"quote":"ц"}');
    expect(restored?.kind).toBe('text');
    expect(restored?.chapter).toBe(2);
    expect(restored?.rects).toBeUndefined();
  });
});

describe('якорь точки', () => {
  it('создаётся по долям положения в книге', () => {
    const anchor = createPointAnchor({ chapter: 1, x: 0.25, y: 0.5, percent: 40 });
    expect(anchor.kind).toBe('point');
    expect(anchor.chapter).toBe(1);
    expect(anchor.x).toBe(0.25);
    expect(anchor.y).toBe(0.5);
    expect(anchor.start).toBe(0);
    expect(anchor.end).toBe(0);
    expect(isPointAnchor(anchor)).toBe(true);
    expect(isPageAnchor(anchor)).toBe(false);
  });

  it('переживает круговой обход', () => {
    const anchor = createPointAnchor({ chapter: 2, x: 0.1, y: 0.9, percent: 12 });
    expect(parseAnchor(serializeAnchor(anchor))).toEqual(anchor);
  });

  it('отсутствующие доли дают ноль', () => {
    const anchor = createPointAnchor({ chapter: 0 });
    expect(anchor.x).toBe(0);
    expect(anchor.y).toBe(0);
  });

  it('старые якоря text и page читаются без изменений', () => {
    const text = createAnchor({ chapter: 2, start: 4, end: 9, quote: 'ц' });
    expect(parseAnchor(serializeAnchor(text))).toEqual(text);
    const page = createPageAnchor({ page: 5, quote: 'стр', percent: 40 });
    expect(parseAnchor(serializeAnchor(page))).toEqual(page);
  });

  it('повреждённая точка не читается как валидный якорь', () => {
    expect(parseAnchor('{"kind":"point"}')).toBeNull();
    expect(parseAnchor('{"kind":"point","x":0.1}')).toBeNull();
    expect(parseAnchor('не json')).toBeNull();
    expect(parseAnchor('{"start":1}')).toBeNull();
  });
});
