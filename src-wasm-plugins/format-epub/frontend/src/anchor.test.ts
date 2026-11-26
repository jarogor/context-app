import { describe, expect, it } from 'vitest';

import { rangeFromOffsets } from './anchor';

/** Раздел главы из абзацев: границы узлов текста проходят между блоками. */
function chapterRoot(html: string): HTMLElement {
  const root = document.createElement('section');
  root.innerHTML = html;
  document.body.append(root);
  return root;
}

describe('rangeFromOffsets', () => {
  it('начало на стыке узлов попадает в следующий узел, а не в конец прежнего', () => {
    // «Привет» — 6 символов, значит смещение 6 — это стык двух абзацев.
    const root = chapterRoot('<p>Привет</p><p>мир</p>');
    const range = rangeFromOffsets(root, 6, 9);

    expect(range).not.toBeNull();
    expect(range!.toString()).toBe('мир');
    // Нулевое смещение в предыдущем узле поставило бы маркер начала на
    // предыдущем абзаце — цитата выглядела бы сдвинутой вверх.
    expect(range!.startContainer).toBe(root.querySelectorAll('p')[1].firstChild);
    expect(range!.startOffset).toBe(0);
  });

  it('конец на стыке остаётся в предыдущем узле и берёт его текст', () => {
    const root = chapterRoot('<p>Привет</p><p>мир</p>');
    const range = rangeFromOffsets(root, 3, 6);

    expect(range?.toString()).toBe('вет');
    expect(range?.endContainer).toBe(root.querySelector('p')?.firstChild);
    expect(range?.endOffset).toBe(6);
  });
});
