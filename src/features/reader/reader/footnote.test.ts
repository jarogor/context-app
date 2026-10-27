import { describe, expect, it } from 'vitest';

import { bookFootnote, footnoteContentHtml, installFootnoteReturns } from './footnote';

/** Документ книги с разметкой и ссылкой-маркером. */
function buildDocument(html: string, linkHtml: string): { doc: Document; link: HTMLAnchorElement } {
  const doc = document.implementation.createHTMLDocument('книга');
  doc.body.innerHTML = `${linkHtml}<div class="context-chapter">${html}</div>`;
  return { doc, link: doc.querySelector('a[href]') as HTMLAnchorElement };
}

describe('bookFootnote', () => {
  it('сноска FB2: маркер fb2-note ведёт в тело сносок', () => {
    const { doc, link } = buildDocument(
      '<p>Текст<a href="#note1">[1]</a></p><div class="fb2-notes"><section id="note1">Текст сноски.</section></div>',
      '<a class="fb2-note" href="#note1">[1]</a>',
    );

    const footnote = bookFootnote(link, doc);

    expect(footnote?.anchor).toBe('note1');
    expect(footnote?.target.id).toBe('note1');
  });

  it('сноска EPUB: noteref ведёт в footnote', () => {
    const { doc, link } = buildDocument(
      '<p>Текст<a href="#fn1">1</a></p><aside id="fn1" epub:type="footnote"><p>Сноска.</p></aside>',
      '<a epub:type="noteref" href="#fn1">1</a>',
    );

    expect(bookFootnote(link, doc)?.anchor).toBe('fn1');
  });

  it('сноска EPUB по роли doc-noteref и doc-endnote', () => {
    const { doc, link } = buildDocument(
      '<p>Текст<a href="#fn2">2</a></p><section id="fn2" role="doc-endnote">Сноска.</section>',
      '<a role="doc-noteref" href="#fn2">2</a>',
    );

    expect(bookFootnote(link, doc)?.anchor).toBe('fn2');
  });

  it('обычная внутренняя ссылка сноской не считается', () => {
    const { doc, link } = buildDocument(
      '<section id="chapter2">Глава 2.</section>',
      '<a href="#chapter2">Глава 2</a>',
    );

    expect(bookFootnote(link, doc)).toBeNull();
  });

  it('маркер сноски с целью в обычном тексте: цель и есть сноска', () => {
    const { doc, link } = buildDocument(
      '<section id="chapter2" class="context-chapter">Глава 2.</section>',
      '<a class="fb2-note" href="#chapter2">[1]</a>',
    );

    // Издатель пометил ссылку сноской, а цель не разметил: показываем её текст.
    expect(bookFootnote(link, doc)?.target.id).toBe('chapter2');
  });

  it('маркер без цели сноской не считается', () => {
    const { doc, link } = buildDocument(
      '<div class="fb2-notes"><section id="note1">Сноска.</section></div>',
      '<a class="fb2-note" href="#note2">[2]</a>',
    );

    expect(bookFootnote(link, doc)).toBeNull();
  });

  it('ссылка в файл сносок без пометки считается сноской', () => {
    const { doc, link } = buildDocument(
      '<p id="note3">Третья сноска.</p>',
      '<a href="notes.xhtml#note3">3</a>',
    );

    expect(bookFootnote(link, doc)?.anchor).toBe('note3');
  });

  it('цель в группе сносок: меню показывает одну сноску, а не всю группу', () => {
    const { doc, link } = buildDocument(
      '<div epub:type="endnotes"><aside id="en1"><p>Первая.</p></aside><aside id="en2"><p>Вторая.</p></aside></div>',
      '<a epub:type="noteref" href="#en1">1</a>',
    );

    const footnote = bookFootnote(link, doc);

    expect(footnote?.target.id).toBe('en1');
    expect(footnoteContentHtml(footnote!.target)).not.toContain('Вторая');
  });
  it('ссылка возврата внутри сноски маркером не считается', () => {
    const { doc } = buildDocument(
      '<div class="fb2-notes"><section id="n1"><p>Текст. <a href="#ref">↩</a></p></section></div>',
      '<a id="ref" class="fb2-note" href="#n1">[1]</a>',
    );
    const back = doc.querySelector('.fb2-notes a')!;

    expect(bookFootnote(back, doc)).toBeNull();
  });
});

describe('bookFootnote: сноски EPUB без epub:type', () => {
  it('маркер цифрой, обратная ссылка отдельным элементом', () => {
    const doc = document.implementation.createHTMLDocument('книга');
    doc.body.innerHTML = [
      '<p>Текст<a id="ref1" href="#n1"><sup>1</sup></a>.</p>',
      '<div class="notes"><p><a id="n1" href="#ref1">↩</a> Текст первой сноски.</p></div>',
    ].join('');
    const marker = doc.querySelector('#ref1') as HTMLAnchorElement;

    const footnote = bookFootnote(marker, doc);

    expect(footnote).not.toBeNull();
    expect(footnoteContentHtml(footnote!.target)).toContain('Текст первой сноски.');
  });

  it('пустая метка сноски и обратная ссылка на цифре', () => {
    const doc = document.implementation.createHTMLDocument('книга');
    doc.body.innerHTML = [
      '<p>Текст<a href="#fn-1">1</a>.</p>',
      '<div id="footnotes"><p><a id="fn-1"></a>Текст второй сноски. <a href="#fn-1">1</a></p></div>',
    ].join('');
    const marker = doc.querySelector('a[href="#fn-1"]') as HTMLAnchorElement;

    const footnote = bookFootnote(marker, doc);

    expect(footnote).not.toBeNull();
    expect(footnoteContentHtml(footnote!.target)).toContain('Текст второй сноски.');
  });

  it('меню не захватывает соседние сноски', () => {
    const doc = document.implementation.createHTMLDocument('книга');
    doc.body.innerHTML = [
      '<p>Текст<a href="#n1">1</a> и<a href="#n2">2</a>.</p>',
      '<div class="notes">',
      '<p><a id="n1" href="#r1">↩</a> Первая сноска.</p>',
      '<p><a id="n2" href="#r2">↩</a> Вторая сноска.</p>',
      '</div>',
    ].join('');
    const marker = doc.querySelector('a[href="#n1"]') as HTMLAnchorElement;

    const html = footnoteContentHtml(bookFootnote(marker, doc)!.target);

    expect(html).toContain('Первая сноска.');
    expect(html).not.toContain('Вторая сноска.');
  });

  it('ссылка назад из сноски не открывает меню', () => {
    const doc = document.implementation.createHTMLDocument('книга');
    doc.body.innerHTML = [
      '<p>Текст<a id="ref1" href="#n1">1</a>.</p>',
      '<div class="notes"><p><a id="n1" href="#ref1">↩</a> Сноска.</p></div>',
    ].join('');
    const back = doc.querySelector('a[href="#ref1"]') as HTMLAnchorElement;

    expect(bookFootnote(back, doc)).toBeNull();
  });
});

describe('installFootnoteReturns', () => {
  it('не дублирует возврат, который издатель уже поставил', () => {
    const doc = document.implementation.createHTMLDocument('книга');
    doc.body.innerHTML = [
      '<p>Текст<a id="ref1" href="#n1">1</a>.</p>',
      '<div class="notes"><p><a id="n1" href="#ref1">↩</a> Сноска.</p></div>',
    ].join('');

    expect(installFootnoteReturns(doc)).toBe(0);
  });

  it('добавляет ссылку возврата к каждой сноске книги', () => {
    const doc = document.implementation.createHTMLDocument('книга');
    doc.body.innerHTML = [
      '<p>Текст<a class="fb2-note" href="#n1">[1]</a> и ещё<a class="fb2-note" href="#n2">[2]</a>.</p>',
      '<div class="fb2-notes"><section id="n1"><p>Первая.</p></section><section id="n2"><p>Вторая.</p></section></div>',
    ].join('');

    expect(installFootnoteReturns(doc)).toBe(2);
    const backs = doc.querySelectorAll('.context-footnote-back');
    expect(backs.length).toBe(2);
    // Каждая ссылка возврата ведёт к своему маркеру.
    const targets = Array.from(backs).map((back) => {
      const href = back.getAttribute('href') ?? '';
      return doc.getElementById(href.slice(1))?.textContent;
    });
    expect(targets).toEqual(['[1]', '[2]']);
  });

  it('повторный вызов не дублирует ссылки возврата', () => {
    const doc = document.implementation.createHTMLDocument('книга');
    doc.body.innerHTML =
      '<p><a class="fb2-note" href="#n1">[1]</a></p><div class="fb2-notes"><section id="n1"><p>Первая.</p></section></div>';

    installFootnoteReturns(doc);
    installFootnoteReturns(doc);

    expect(doc.querySelectorAll('.context-footnote-back').length).toBe(1);
  });

  it('не добавляет вторую ссылку возврата, если издатель её уже поставил', () => {
    const doc = document.implementation.createHTMLDocument('книга');
    doc.body.innerHTML = [
      '<p><a class="fb2-note" id="ref1" href="#n1">[1]</a></p>',
      '<div class="fb2-notes"><section id="n1"><p>Первая. <a href="#ref1">↩</a></p></section></div>',
    ].join('');

    expect(installFootnoteReturns(doc)).toBe(0);
  });

  it('ссылка возврата не попадает в текст меню', () => {
    const doc = document.implementation.createHTMLDocument('книга');
    doc.body.innerHTML =
      '<p><a class="fb2-note" href="#n1">[1]</a></p><div class="fb2-notes"><section id="n1"><p>Первая.</p></section></div>';
    installFootnoteReturns(doc);

    const target = doc.getElementById('n1') as HTMLElement;

    expect(footnoteContentHtml(target)).not.toContain('context-footnote-back');
  });
});

describe('footnoteContentHtml', () => {
  it('возвращает разметку сноски', () => {
    const doc = document.implementation.createHTMLDocument('книга');
    doc.body.innerHTML = '<section id="note1"><p>Текст <em>сноски</em>.</p></section>';
    const target = doc.getElementById('note1') as HTMLElement;

    expect(footnoteContentHtml(target)).toBe('<p>Текст <em>сноски</em>.</p>');
  });

  it('отбрасывает скрипты и обработчики, внешние адреса и ссылки', () => {
    const doc = document.implementation.createHTMLDocument('книга');
    doc.body.innerHTML =
      '<section id="note1"><script>alert(1)</script><p onclick="alert(2)">Текст <a href="#note2">ссылка</a>.</p><img src="https://example.org/x.png" /><img src="data:image/png;base64,AAAA" /></section>';
    const target = doc.getElementById('note1') as HTMLElement;
    const html = footnoteContentHtml(target);

    expect(html).not.toContain('<script');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('href');
    expect(html).not.toContain('https://example.org');
    expect(html).toContain('data:image/png');
  });
});
