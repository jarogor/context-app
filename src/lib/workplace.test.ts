import { describe, expect, it } from 'vitest';
import {
  activateTab,
  activeTab,
  closeTab,
  duplicateTab,
  emptyWorkspace,
  normalizeWorkspace,
  openBook,
  replaceTabBook,
  updateTab,
} from './workplace';

describe('рабочее место', () => {
  it('открывает книгу новой активной вкладкой', () => {
    const state = openBook(emptyWorkspace(), { bookId: 'book-1', title: 'Книга' });

    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0].zoom).toBe(100);
    expect(state.tabs[0].position).toBe(0);
    expect(state.activeTabId).toBe(state.tabs[0].id);
  });

  it('переводит активность соседней вкладке при закрытии активной', () => {
    let state = openBook(emptyWorkspace(), { bookId: 'a', title: 'A' });
    state = openBook(state, { bookId: 'b', title: 'B' });
    const first = state.tabs[0].id;

    state = closeTab(state, state.activeTabId ?? '');

    expect(state.tabs).toHaveLength(1);
    expect(state.activeTabId).toBe(first);
  });

  it('сохраняет активность при закрытии неактивной вкладки', () => {
    let state = openBook(emptyWorkspace(), { bookId: 'a', title: 'A' });
    state = openBook(state, { bookId: 'b', title: 'B' });
    const active = state.activeTabId;

    state = closeTab(state, state.tabs[0].id);

    expect(state.activeTabId).toBe(active);
  });

  it('очищает активную вкладку при закрытии последней', () => {
    let state = openBook(emptyWorkspace(), { bookId: 'a', title: 'A' });

    state = closeTab(state, state.tabs[0].id);

    expect(state.tabs).toHaveLength(0);
    expect(state.activeTabId).toBeNull();
    expect(activeTab(state)).toBeNull();
  });

  it('дублирует вкладку независимым экземпляром', () => {
    let state = openBook(emptyWorkspace(), { bookId: 'a', title: 'A' });
    state = updateTab(state, state.activeTabId ?? '', { zoom: 140, position: 30 });

    state = duplicateTab(state, state.tabs[0].id);

    expect(state.tabs).toHaveLength(2);
    expect(state.tabs[1].id).not.toBe(state.tabs[0].id);
    expect(state.tabs[1].bookId).toBe('a');
    expect(state.tabs[1].zoom).toBe(140);
    expect(state.activeTabId).toBe(state.tabs[1].id);
  });

  it('обновляет только указанные поля вкладки', () => {
    let state = openBook(emptyWorkspace(), { bookId: 'a', title: 'A' });
    const id = state.activeTabId ?? '';

    state = updateTab(state, id, { position: 55 });

    expect(state.tabs[0].position).toBe(55);
    expect(state.tabs[0].zoom).toBe(100);
  });

  it('заменяет книгу вкладки, сохраняя состояние чтения', () => {
    let state = openBook(emptyWorkspace(), { bookId: 'a', title: 'A' });
    const id = state.activeTabId ?? '';
    state = updateTab(state, id, { zoom: 130, position: 20 });

    state = replaceTabBook(state, id, { bookId: 'b', title: 'B', format: 'pdf' });

    expect(state.tabs[0].bookId).toBe('b');
    expect(state.tabs[0].title).toBe('B');
    expect(state.tabs[0].format).toBe('pdf');
    expect(state.tabs[0].zoom).toBe(130);
    expect(state.tabs[0].position).toBe(20);
  });

  it('активирует существующую вкладку и игнорирует неизвестную', () => {
    let state = openBook(emptyWorkspace(), { bookId: 'a', title: 'A' });
    state = openBook(state, { bookId: 'b', title: 'B' });

    const activated = activateTab(state, state.tabs[0].id);
    expect(activated.activeTabId).toBe(state.tabs[0].id);

    expect(activateTab(state, 'missing').activeTabId).toBe(state.activeTabId);
  });

  it('нормализует загруженное состояние и чинит активную вкладку', () => {
    const state = normalizeWorkspace({
      tabs: [{ id: 't1', book_id: 'book-1', title: 'Книга' }],
      active_tab_id: 'missing',
    });

    expect(state.tabs[0].bookId).toBe('book-1');
    expect(state.tabs[0].zoom).toBe(100);
    expect(state.activeTabId).toBe('t1');
  });
});
