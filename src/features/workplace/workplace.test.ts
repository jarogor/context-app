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
  openOrActivateBook,
  replaceTabBook,
  serializeTab,
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

  it('активирует уже открытую книгу, а не заводит вторую вкладку', () => {
    let state = openBook(emptyWorkspace(), { path: '/lib/a.epub', title: 'A' });
    const first = state.activeTabId;
    state = openBook(state, { path: '/lib/b.epub', title: 'B' });

    state = openOrActivateBook(state, { path: '/lib/a.epub', title: 'A' });

    expect(state.tabs).toHaveLength(2);
    expect(state.activeTabId).toBe(first);
  });

  it('повторный переход к книге работает и при достигнутом лимите вкладок', () => {
    let state = openBook(emptyWorkspace(), { path: '/lib/a.epub', title: 'A' });
    const first = state.activeTabId;
    state = openBook(state, { path: '/lib/b.epub', title: 'B' });

    // Лимит в одну вкладку превышен, но новая вкладка не нужна: книга открыта.
    state = openOrActivateBook(state, { path: '/lib/a.epub', title: 'A' }, 1);
    expect(state.tabs).toHaveLength(2);
    expect(state.activeTabId).toBe(first);
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

describe('оформление вкладки', () => {
  /** Вкладка с заданным оформлением. */
  function decorated() {
    let state = openBook(emptyWorkspace(), { path: '/lib/a.epub', title: 'A' });
    state = updateTab(state, state.activeTabId ?? '', {
      name: 'Черновик',
      description: 'сравнение глав',
      icon: 'star',
      color: 'blue',
    });
    return state;
  }

  it('дублирует вкладку вместе с оформлением', () => {
    const base = decorated();
    const state = duplicateTab(base, base.tabs[0].id);

    expect(state.tabs[1].name).toBe('Черновик');
    expect(state.tabs[1].description).toBe('сравнение глав');
    expect(state.tabs[1].icon).toBe('star');
    expect(state.tabs[1].color).toBe('blue');
  });

  it('читает оформление из загруженного состояния', () => {
    const state = normalizeWorkspace({
      tabs: [
        {
          id: 't1',
          path: '/lib/a.epub',
          title: 'A',
          name: 'Имя',
          description: 'Описание',
          icon: 'note',
          color: 'green',
        },
      ],
    });

    expect(state.tabs[0].name).toBe('Имя');
    expect(state.tabs[0].description).toBe('Описание');
    expect(state.tabs[0].icon).toBe('note');
    expect(state.tabs[0].color).toBe('green');
  });

  it('отбрасывает неизвестные и пустые значения оформления', () => {
    const state = normalizeWorkspace({
      tabs: [
        {
          id: 't1',
          path: '/lib/a.epub',
          title: 'A',
          name: '   ',
          description: '',
          icon: 'unknown',
          color: 'magenta',
        },
      ],
    });

    expect(state.tabs[0].name).toBeUndefined();
    expect(state.tabs[0].description).toBeUndefined();
    expect(state.tabs[0].icon).toBeUndefined();
    expect(state.tabs[0].color).toBeUndefined();
  });

  it('сохраняет оформление при круговом преобразовании', () => {
    const state = decorated();
    const restored = normalizeWorkspace({
      tabs: [serializeTab(state.tabs[0])],
      active_tab_id: state.tabs[0].id,
    });

    expect(restored.tabs[0]).toEqual(state.tabs[0]);
  });

  it('опускает незаданное оформление при сериализации', () => {
    const state = openBook(emptyWorkspace(), { path: '/lib/a.epub', title: 'A' });
    const record = serializeTab(state.tabs[0]);

    expect(record).not.toHaveProperty('name');
    expect(record).not.toHaveProperty('description');
    expect(record).not.toHaveProperty('icon');
    expect(record).not.toHaveProperty('color');
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
