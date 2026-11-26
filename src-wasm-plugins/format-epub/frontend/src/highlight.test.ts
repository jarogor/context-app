import { describe, expect, it } from 'vitest';

import { clearNoteMarks, highlightTextRange } from './highlight';

/** Раздел главы с одним абзацем: текст доступен как смещения символов. */
function chapterRoot(html: string): HTMLElement {
    const root = document.createElement('section');
    root.innerHTML = html;
    document.body.append(root);
    return root;
}

/** Число текстовых узлов в разделе. */
function textNodes(root: Node): number {
    const walker = (root.ownerDocument ?? document).createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let count = 0;
    while (walker.nextNode()) {
        count += 1;
    }
    return count;
}

describe('clearNoteMarks', () => {
    it('склеивает текстовые узлы, разрезанные подсветкой', () => {
        const root = chapterRoot('<p>Первый абзац книги для проверки.</p>');
        const before = textNodes(root);
        // Подсветка середины абзаца разрезает текстовый узел на три части.
        highlightTextRange(root, 7, 12, 'context-note', 'note-1');
        expect(textNodes(root)).toBeGreaterThan(before);

        clearNoteMarks(root, 'mark.context-note');

        /* Каждое движение указателя при правке границ показывает и снимает
           подсветку заново. Без склейки число узлов росло с каждым шагом, обход
           текста замедлялся в разы, и правка «зависала». */
        expect(textNodes(root)).toBe(before);
        expect(root.textContent).toBe('Первый абзац книги для проверки.');
    });

    it('повторные показы не накапливают узлы', () => {
        const root = chapterRoot('<p>Первый абзац книги для проверки.</p>');
        const before = textNodes(root);
        for (let step = 0; step < 20; step += 1) {
            highlightTextRange(root, 7, 7 + step + 1, 'context-note', 'note-1');
            clearNoteMarks(root, 'mark.context-note');
        }
        expect(textNodes(root)).toBe(before);
    });
});
