import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import BookReader from './BookReader.svelte';
import { NOTE_COLORS } from '../notes/notes';

/** Документ, собранный читалкой в атрибут `srcdoc`. */
async function builtDocument(props: Record<string, unknown> = {}): Promise<string> {
    render(BookReader, {
        props: {
            content: { title: 'Книга', authors: [], chapters: [{ title: null, html: '<p>Текст</p>' }] },
            zoom: 100,
            ...props,
        },
    });
    const frame = await screen.findByTitle('Чтение книги');
    return frame.getAttribute('srcdoc') ?? '';
}

describe('BookReader: документ книги', () => {
    it('содержит правило цвета для всех цветов палитры', async () => {
        const html = await builtDocument();
        for (const color of NOTE_COLORS) {
            expect(html).toContain(`data-color="${color}"`);
        }
        expect(NOTE_COLORS).not.toContain('black');
    });

    it('содержит стили карточек и фигур', async () => {
        const html = await builtDocument();
        expect(html).toContain('.texture-note-card');
        expect(html).toContain('.texture-note-shape');
        expect(html).toContain('.texture-chapter{position:relative;}');
    });

    it('по умолчанию оформляет область чтения светлой темой', async () => {
        const html = await builtDocument();
        expect(html).toContain('data-reader-theme="light"');
        expect(html).toContain("html[data-reader-theme='dark']");
    });

    it('передаёт выбранную тему области чтения в документ', async () => {
        const html = await builtDocument({ readerTheme: 'dark' });
        expect(html).toContain('data-reader-theme="dark"');
    });

    it('содержит слой активного выделения с метками по краям', async () => {
        const html = await builtDocument();
        expect(html).toContain('.texture-selection-layer');
        expect(html).toContain('.texture-selection-band');
        // Метки привязаны именно к полосе выделения, а не к подсветке заметки,
        // и стоят только у краёв всего выделения.
        expect(html).toContain('.texture-selection-band[data-edge="start"]::before');
        expect(html).toContain('.texture-selection-band[data-edge="end"]::after');
        // Метка центрируется на границе полосы (на полширины внутрь и наружу):
        // середина метки совпадает с краем выделения.
        expect(html).toContain('left:calc(-0.5 * var(--rt-selection-edge-width,1px))');
        expect(html).toContain('right:calc(-0.5 * var(--rt-selection-edge-width,1px))');
        expect(html).not.toContain('.texture-note::before');
    });
});
