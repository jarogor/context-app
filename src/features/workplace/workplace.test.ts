import { describe, expect, it } from 'vitest';
import {
  activateTab,
  activeTab,
  closeTab,
  duplicateTab,
  emptyWorkspace,
  normalizeOpenTabsLimit,
  normalizeWorkspace,
  openAvailability,
  openBook,
  replaceTabBook,
  updateTab,
} from './workplace';

describe('рабочее место', () => {
  it('открывает книгу новой активной вкладкой', () => {
    const state = openBook(emptyWorkspace(), { path: '/lib/book-1.epub', title: 'Книга' });

    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0].zoom).toBe(100);
    expect(state.tabs[0].position).toBe(0);
    expect(state.activeTabId).toBe(state.tabs[0].id);
  });

  it('переводит активность соседней вкладке при закрытии активной', () => {
    let state = openBook(emptyWorkspace(), { path: '/lib/a.epub', title: 'A' });
    state = openBook(state, { path: '/lib/b.epub', title: 'B' });
    const first = state.tabs[0].id;

    state = closeTab(state, state.activeTabId ?? '');

    expect(state.tabs).toHaveLength(1);
    expect(state.activeTabId).toBe(first);
  });

  it('сохраняет активность при закрытии неактивной вкладки', () => {
    let state = openBook(emptyWorkspace(), { path: '/lib/a.epub', title: 'A' });
    state = openBook(state, { path: '/lib/b.epub', title: 'B' });
    const active = state.activeTabId;

    state = closeTab(state, state.tabs[0].id);

    expect(state.activeTabId).toBe(active);
  });

  it('очищает активную вкладку при закрытии последней', () => {
    let state = openBook(emptyWorkspace(), { path: '/lib/a.epub', title: 'A' });

    state = closeTab(state, state.tabs[0].id);

    expect(state.tabs).toHaveLength(0);
    expect(state.activeTabId).toBeNull();
    expect(activeTab(state)).toBeNull();
  });

  it('дублирует вкладку независимым экземпляром', () => {
    let state = openBook(emptyWorkspace(), { path: '/lib/a.epub', title: 'A' });
    state = updateTab(state, state.activeTabId ?? '', { zoom: 140, position: 30 });

    state = duplicateTab(state, state.tabs[0].id);

    expect(state.tabs).toHaveLength(2);
    expect(state.tabs[1].id).not.toBe(state.tabs[0].id);
    expect(state.tabs[1].path).toBe('/lib/a.epub');
    expect(state.tabs[1].zoom).toBe(140);
    expect(state.activeTabId).toBe(state.tabs[1].id);
  });

  it('обновляет только указанные поля вкладки', () => {
    let state = openBook(emptyWorkspace(), { path: '/lib/a.epub', title: 'A' });
    const id = state.activeTabId ?? '';

    state = updateTab(state, id, { position: 55 });

    expect(state.tabs[0].position).toBe(55);
    expect(state.tabs[0].zoom).toBe(100);
  });

  it('заменяет книгу вкладки, сохраняя состояние чтения', () => {
    let state = openBook(emptyWorkspace(), { path: '/lib/a.epub', title: 'A' });
    const id = state.activeTabId ?? '';
    state = updateTab(state, id, { zoom: 130, position: 20 });

    state = replaceTabBook(state, id, { path: '/lib/b.epub', title: 'B', format: 'pdf' });

    expect(state.tabs[0].path).toBe('/lib/b.epub');
    expect(state.tabs[0].title).toBe('B');
    expect(state.tabs[0].format).toBe('pdf');
    expect(state.tabs[0].zoom).toBe(130);
    expect(state.tabs[0].position).toBe(20);
  });

  it('активирует существующую вкладку и игнорирует неизвестную', () => {
    let state = openBook(emptyWorkspace(), { path: '/lib/a.epub', title: 'A' });
    state = openBook(state, { path: '/lib/b.epub', title: 'B' });

    const activated = activateTab(state, state.tabs[0].id);
    expect(activated.activeTabId).toBe(state.tabs[0].id);

    expect(activateTab(state, 'missing').activeTabId).toBe(state.activeTabId);
  });

  it('нормализует загруженное состояние и чинит активную вкладку', () => {
    const state = normalizeWorkspace({
      tabs: [{ id: 't1', path: '/lib/book-1.epub', title: 'Книга' }],
      active_tab_id: 'missing',
    });

    expect(state.tabs[0].path).toBe('/lib/book-1.epub');
    expect(state.tabs[0].zoom).toBe(100);
    expect(state.activeTabId).toBe('t1');
  });

  it('держит вкладки разных рабочих мест обособленными', () => {
    const first = openBook(emptyWorkspace(), { path: '/lib/a.epub', title: 'A' });
    const second = openBook(emptyWorkspace(), { path: '/lib/b.epub', title: 'B' });

    const updated = updateTab(first, first.tabs[0].id, { zoom: 150, position: 70 });

    expect(updated.tabs[0].zoom).toBe(150);
    expect(second.tabs[0].zoom).toBe(100);
    expect(second.tabs[0].position).toBe(0);
    expect(second.tabs[0].path).toBe('/lib/b.epub');
  });
});

describe('лимит открытых вкладок', () => {
  /** Рабочее место с заданным числом открытых вкладок. */
  function withTabs(count: number) {
    let state = emptyWorkspace();
    for (let index = 0; index < count; index += 1) {
      state = openBook(state, { path: `/lib/${index}.epub`, title: `Книга ${index}` });
    }
    return state;
  }

  it('нормализует лимит: не меньше единицы, иначе значение по умолчанию', () => {
    expect(normalizeOpenTabsLimit(10)).toBe(10);
    expect(normalizeOpenTabsLimit(0)).toBe(1);
    expect(normalizeOpenTabsLimit(-3)).toBe(1);
    expect(normalizeOpenTabsLimit(Number.NaN)).toBe(50);
    expect(normalizeOpenTabsLimit(undefined)).toBe(50);
  });

  it('определяет доступность открытия по числу вкладок и лимиту', () => {
    expect(openAvailability(2, 5)).toBe('available');
    expect(openAvailability(5, 5)).toBe('limit-reached');
    expect(openAvailability(7, 5)).toBe('over-limit');
  });

  it('открывает книгу при числе вкладок меньше лимита', () => {
    const state = openBook(withTabs(4), { path: '/lib/new.epub', title: 'Новая' }, 5);

    expect(state.tabs).toHaveLength(5);
    expect(state.activeTabId).toBe(state.tabs[4].id);
  });

  it('не открывает книгу при достижении лимита', () => {
    const state = withTabs(5);

    const next = openBook(state, { path: '/lib/new.epub', title: 'Новая' }, 5);

    expect(next).toBe(state);
    expect(next.tabs).toHaveLength(5);
  });

  it('не открывает книгу при превышении лимита', () => {
    const state = withTabs(7);

    const next = openBook(state, { path: '/lib/new.epub', title: 'Новая' }, 5);

    expect(next).toBe(state);
    expect(next.tabs).toHaveLength(7);
  });

  it('открывает книгу без лимита (лимит не задан)', () => {
    const state = withTabs(5);

    const next = openBook(state, { path: '/lib/new.epub', title: 'Новая' });

    expect(next.tabs).toHaveLength(6);
  });

  it('дублирует вкладку ниже лимита и блокирует при достижении', () => {
    const state = withTabs(5);
    const id = state.tabs[0].id;

    expect(duplicateTab(state, id, 6).tabs).toHaveLength(6);
    expect(duplicateTab(state, id, 5)).toBe(state);
  });
});
