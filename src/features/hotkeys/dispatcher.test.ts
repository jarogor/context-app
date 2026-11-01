import { describe, expect, it, vi } from 'vitest';

import { createHotkeyDispatcher } from './dispatcher';
import { parseCombo } from './key-combo';

/** Событие нажатия с заданными полями. */
function keydown(overrides: Record<string, unknown> = {}): KeyboardEvent {
    return new KeyboardEvent('keydown', {
        key: 'f',
        code: 'KeyF',
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
        metaKey: false,
        cancelable: true,
        ...overrides,
    });
}

describe('диспетчер клавиатуры', () => {
    it('вызывает действие по комбинации и помечает событие использованным', () => {
        const dispatcher = createHotkeyDispatcher();
        const handler = vi.fn();
        dispatcher.register('app', { 'app.settings': handler });

        const event = keydown({ code: 'Comma', key: ',', ctrlKey: true });
        expect(dispatcher.handle(event)).toBe(true);
        expect(handler).toHaveBeenCalledTimes(1);
        expect(event.defaultPrevented).toBe(true);
    });

    it('не выполняет действие, для которого не зарегистрирован обработчик', () => {
        const dispatcher = createHotkeyDispatcher();
        const handler = vi.fn();
        // Область доступна (в ней есть обработчик), но само действие — нет.
        dispatcher.register('workplace', { 'workplace.books': vi.fn() });

        const event = keydown({ code: 'KeyJ', ctrlKey: true });
        expect(dispatcher.handle(event)).toBe(false);
        expect(handler).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false);
    });

    it('не выполняет действие, пока его область не зарегистрирована', () => {
        const dispatcher = createHotkeyDispatcher();
        const handler = vi.fn();
        dispatcher.register('reader', { 'reader.book.start': handler });

        const event = keydown({ code: 'KeyB', ctrlKey: true });
        expect(dispatcher.handle(event)).toBe(false);
        expect(handler).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false);
    });

    it('работает в области, как только в ней появились обработчики, и перестаёт после снятия', () => {
        const dispatcher = createHotkeyDispatcher();
        const handler = vi.fn();
        const unregister = dispatcher.register('workplace', { 'workplace.notes': handler });

        dispatcher.handle(keydown({ code: 'KeyJ', ctrlKey: true }));
        expect(handler).toHaveBeenCalledTimes(1);

        unregister();
        dispatcher.handle(keydown({ code: 'KeyJ', ctrlKey: true }));
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('не перехватывает клавишу без модификатора в поле ввода текста', () => {
        const dispatcher = createHotkeyDispatcher();
        const handler = vi.fn();
        dispatcher.register('reader', { 'reader.book.start': handler });

        const input = document.createElement('input');
        document.body.appendChild(input);
        const event = keydown({ code: 'Home', key: 'Home' });
        input.dispatchEvent(event);

        expect(dispatcher.handle(event)).toBe(false);
        expect(handler).not.toHaveBeenCalled();
        input.remove();
    });

    it('перехватывает комбинацию с модификатором в поле ввода', () => {
        const dispatcher = createHotkeyDispatcher();
        const handler = vi.fn();
        dispatcher.register('reader', { 'reader.zoom.in': handler });

        const input = document.createElement('input');
        document.body.appendChild(input);
        const event = keydown({ code: 'Equal', key: '=', ctrlKey: true });
        input.dispatchEvent(event);

        expect(dispatcher.handle(event)).toBe(true);
        expect(handler).toHaveBeenCalledTimes(1);
        input.remove();
    });

    it('выполняет разрешённое в поле действие (закрытие слоя, переход по найденному)', () => {
        const dispatcher = createHotkeyDispatcher();
        const dismiss = vi.fn();
        const next = vi.fn();
        dispatcher.register('app', { 'app.dismiss': dismiss });
        dispatcher.register('reader', { 'reader.search.next': next });

        const input = document.createElement('input');
        document.body.appendChild(input);
        const escape = keydown({ code: 'Escape', key: 'Escape' });
        input.dispatchEvent(escape);
        dispatcher.handle(escape);

        const f3 = keydown({ code: 'F3', key: 'F3' });
        input.dispatchEvent(f3);
        dispatcher.handle(f3);

        expect(dismiss).toHaveBeenCalledTimes(1);
        expect(next).toHaveBeenCalledTimes(1);
        input.remove();
    });

    it('уступает клавишу, если обработчик сообщил, что закрывать нечего', () => {
        const dispatcher = createHotkeyDispatcher();
        dispatcher.register('app', { 'app.dismiss': () => false });

        const event = keydown({ code: 'Escape', key: 'Escape' });
        expect(dispatcher.handle(event)).toBe(false);
        expect(event.defaultPrevented).toBe(false);
    });

    it('не трогает событие, которое уже отменили (открытый диалог)', () => {
        const dispatcher = createHotkeyDispatcher();
        const handler = vi.fn();
        dispatcher.register('app', { 'app.settings': handler });

        const event = keydown({ code: 'Comma', ctrlKey: true });
        event.preventDefault();

        expect(dispatcher.handle(event)).toBe(false);
        expect(handler).not.toHaveBeenCalled();
    });

    it('в модальном окне пропускает только закрытие слоя', () => {
        const dispatcher = createHotkeyDispatcher();
        const settings = vi.fn();
        const dismiss = vi.fn(() => true);
        dispatcher.register('app', { 'app.settings': settings, 'app.dismiss': dismiss });

        dispatcher.setModalOpen(true);
        expect(dispatcher.handle(keydown({ code: 'Comma', ctrlKey: true }))).toBe(false);
        expect(settings).not.toHaveBeenCalled();

        expect(dispatcher.handle(keydown({ code: 'Escape', key: 'Escape' }))).toBe(true);
        expect(dismiss).toHaveBeenCalledTimes(1);

        dispatcher.setModalOpen(false);
        expect(dispatcher.handle(keydown({ code: 'Comma', ctrlKey: true }))).toBe(true);
        expect(settings).toHaveBeenCalledTimes(1);
    });

    it('отклоняет обработчик чужой области и неизвестное действие', () => {
        const dispatcher = createHotkeyDispatcher();
        expect(() => dispatcher.register('app', { 'workplace.notes': () => {} })).toThrow(
            /принадлежит области/,
        );
        expect(() => dispatcher.register('app', { 'app.unknown': () => {} })).toThrow(
            /неизвестного действия/,
        );
    });

    it('выполняет нажатие, пересланное документом книги', () => {
        const dispatcher = createHotkeyDispatcher();
        const handler = vi.fn();
        dispatcher.register('reader', { 'reader.screen.next': handler });

        expect(dispatcher.handleViewer(parseCombo('PageDown'))).toBe(true);
        expect(handler).toHaveBeenCalledTimes(1);
        expect(dispatcher.handleViewer(parseCombo('Ctrl+Alt+KeyQ'))).toBe(false);
    });

    it('выполняет действие, распознанное плагином формата', () => {
        const dispatcher = createHotkeyDispatcher();
        const handler = vi.fn();
        dispatcher.register('reader', { 'reader.screen.next': handler });

        expect(dispatcher.handleViewerAction('reader.screen.next')).toBe(true);
        expect(handler).toHaveBeenCalledTimes(1);
        expect(dispatcher.handleViewerAction('reader.unknown')).toBe(false);
    });

    it('передаёт плагину все привязки приложения, а не только «читальные»', () => {
        const dispatcher = createHotkeyDispatcher();
        const ids = dispatcher.viewerBindings().map((item) => item.id);
        expect(ids).toContain('app.section.workspace');
        expect(ids).toContain('workplace.notes');
        expect(ids).toContain('reader.search');
        // Описание — физический код, а не символ: раскладка на совпадение не влияет.
        const workspace = dispatcher
            .viewerBindings()
            .find((item) => item.id === 'app.section.workspace');
        expect(workspace).toEqual({
            id: 'app.section.workspace',
            code: 'Digit1',
            ctrl: true,
            alt: false,
            shift: false,
            meta: false,
        });
    });

    it('не перехватывает прокруточную клавишу в списке, который прокручивается сам', () => {
        const dispatcher = createHotkeyDispatcher();
        const handler = vi.fn();
        dispatcher.register('reader', { 'reader.screen.next': handler });

        const list = document.createElement('div');
        list.style.overflowY = 'auto';
        Object.defineProperty(list, 'scrollHeight', { value: 500 });
        Object.defineProperty(list, 'clientHeight', { value: 100 });
        document.body.appendChild(list);

        const event = keydown({ code: 'PageDown', key: 'PageDown' });
        list.dispatchEvent(event);

        expect(dispatcher.handle(event)).toBe(false);
        expect(handler).not.toHaveBeenCalled();
        list.remove();
    });

    it('перехватывает прокруточную клавишу вне прокручиваемого списка', () => {
        const dispatcher = createHotkeyDispatcher();
        const handler = vi.fn();
        dispatcher.register('reader', { 'reader.screen.next': handler });

        const box = document.createElement('div');
        document.body.appendChild(box);
        const event = keydown({ code: 'PageDown', key: 'PageDown' });
        box.dispatchEvent(event);

        expect(dispatcher.handle(event)).toBe(true);
        expect(handler).toHaveBeenCalledTimes(1);
        box.remove();
    });

    it('снятие старой регистрации не убирает обработчик, который уже занял новый', () => {
        const dispatcher = createHotkeyDispatcher();
        const previous = vi.fn();
        const next = vi.fn();

        const unregisterPrevious = dispatcher.register('reader', {
            'reader.screen.next': previous,
        });
        dispatcher.register('reader', { 'reader.screen.next': next });

        // Прежняя вкладка размонтируется уже после того, как новая заняла действие.
        unregisterPrevious();
        expect(dispatcher.handle(keydown({ code: 'PageDown', key: 'PageDown' }))).toBe(true);
        expect(next).toHaveBeenCalledTimes(1);
        expect(previous).not.toHaveBeenCalled();
    });

    it('не выполняет действие книги, пока область чтения не зарегистрирована', () => {
        const dispatcher = createHotkeyDispatcher();
        const handler = vi.fn();
        dispatcher.register('app', { 'app.settings': handler });

        expect(dispatcher.handleViewer(parseCombo('PageDown'))).toBe(false);
        expect(handler).not.toHaveBeenCalled();
    });
});
