import { describe, expect, it } from 'vitest';

import { anchorTarget, parseBookLink } from './book-link';

describe('parseBookLink', () => {
  it('внутренний якорь с решёткой', () => {
    expect(parseBookLink('#note1')).toEqual({
      kind: 'anchor',
      href: '#note1',
      anchor: 'note1',
    });
  });

  it('якорь с именем файла: содержимое книги уже собрано', () => {
    expect(parseBookLink('notes.html#note2')).toEqual({
      kind: 'anchor',
      href: 'notes.html#note2',
      anchor: 'note2',
    });
  });

  it('внешние ссылки открываются системным приложением', () => {
    expect(parseBookLink('https://example.org/').kind).toBe('external');
    expect(parseBookLink('http://example.org/').kind).toBe('external');
    expect(parseBookLink('mailto:author@example.org').kind).toBe('external');
  });

  it('относительный путь внутри книги игнорируется', () => {
    // Все главы уже в документе: переходить по файлу некуда.
    expect(parseBookLink('chapter2.xhtml').kind).toBe('ignored');
    expect(parseBookLink('notes.html').kind).toBe('ignored');
  });

  it('пустая ссылка и голая решётка игнорируются', () => {
    expect(parseBookLink('').kind).toBe('ignored');
    expect(parseBookLink(null).kind).toBe('ignored');
    expect(parseBookLink('#').kind).toBe('ignored');
    expect(parseBookLink('   ').kind).toBe('ignored');
  });

  it('прочие схемы игнорируются: через книгу нельзя запустить программу', () => {
    expect(parseBookLink('javascript:alert(1)').kind).toBe('ignored');
    expect(parseBookLink('file:///etc/passwd').kind).toBe('ignored');
  });
});

describe('anchorTarget', () => {
  it('находит элемент по идентификатору', () => {
    const doc = document.implementation.createHTMLDocument('книга');
    const section = doc.createElement('section');
    section.id = 'note1';
    doc.body.append(section);

    expect(anchorTarget(doc, 'note1')).toBe(section);
  });

  it('неизвестный якорь даёт null', () => {
    const doc = document.implementation.createHTMLDocument('книга');

    expect(anchorTarget(doc, 'нет-такого')).toBeNull();
  });
});
