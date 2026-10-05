import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import BookReader from './BookReader.svelte';
import { NOTE_COLORS } from '../notes/notes';

/** Документ, собранный читалкой в атрибут `srcdoc`. */
async function builtDocument(): Promise<string> {
    render(BookReader, {
        props: {
            content: { title: 'Книга', authors: [], chapters: [{ title: null, html: '<p>Текст</p>' }] },
            zoom: 100,
        },
    });
    const frame = await screen.findByTitle('Чтение книги');
    return frame.getAttribute('srcdoc') ?? '';
}

describe('BookReader: документ книги', () => {
    it('содержит правило цвета для всех цветов палитры, включая чёрный', async () => {
        const html = await builtDocument();
        for (const color of NOTE_COLORS) {
            expect(html).toContain(`data-color="${color}"`);
        }
        expect(NOTE_COLORS).toContain('black');
    });

    it('содержит стили карточек и фигур', async () => {
        const html = await builtDocument();
        expect(html).toContain('.texture-note-card');
        expect(html).toContain('.texture-note-shape');
        expect(html).toContain('.texture-chapter{position:relative;}');
    });
});
