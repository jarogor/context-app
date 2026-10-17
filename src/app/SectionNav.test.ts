import { render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

import SectionNav from './SectionNav.svelte';

/** Значения свойств по умолчанию для тестов. */
function props(overrides: Record<string, unknown> = {}) {
  return {
    appName: 'Текстура',
    workspaceActive: false,
    libraryActive: false,
    notesActive: false,
    notificationsOpen: false,
    settingsOpen: false,
    unreadCount: 0,
    alertCount: 0,
    alertTitles: '',
    alertError: false,
    themeTitle: 'Как в системе',
    expanded: true,
    mobile: false,
    onWorkspace: vi.fn(),
    onLibrary: vi.fn(),
    onNotes: vi.fn(),
    onNotifications: vi.fn(),
    onSettings: vi.fn(),
    onTheme: vi.fn(),
    onToggleExpanded: vi.fn(),
    ...overrides,
  };
}

describe('SectionNav', () => {
  it('показывает разделы с доступными именами', () => {
    render(SectionNav, { props: props() });

    expect(screen.getByLabelText('Рабочие места')).toBeTruthy();
    expect(screen.getByLabelText('Библиотеки')).toBeTruthy();
    expect(screen.getByLabelText('Заметки')).toBeTruthy();
    expect(screen.getByLabelText('Настройки')).toBeTruthy();
    expect(screen.getByLabelText('Уведомления')).toBeTruthy();
  });

  it('в свёрнутом виде показывает иконки без названий, в раскрытом — с названиями', () => {
    const { unmount } = render(SectionNav, { props: props({ expanded: false }) });
    expect(screen.queryByText('Заметки')).toBeNull();
    expect(screen.getByTestId('section-nav').getAttribute('data-expanded')).toBe('false');
    unmount();

    render(SectionNav, { props: props({ expanded: true }) });
    expect(screen.getByText('Заметки')).toBeTruthy();
    expect(screen.getByTestId('section-nav').getAttribute('data-expanded')).toBe('true');
  });

  it('сообщает о переключении раскрытия меню', async () => {
    const onToggleExpanded = vi.fn();
    const { unmount } = render(SectionNav, { props: props({ expanded: false, onToggleExpanded }) });

    screen.getByTestId('nav-expand').click();
    expect(onToggleExpanded).toHaveBeenCalledTimes(1);
    unmount();

    const reopened = vi.fn();
    render(SectionNav, { props: props({ expanded: true, onToggleExpanded: reopened }) });
    screen.getByTestId('nav-collapse').click();
    expect(reopened).toHaveBeenCalledTimes(1);
  });

  it('выделяет активный раздел', () => {
    render(SectionNav, { props: props({ libraryActive: true }) });

    expect(screen.getByTestId('nav-library').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('nav-workspace').getAttribute('aria-pressed')).toBe('false');
  });

  it('сообщает о выборе раздела', async () => {
    const onLibrary = vi.fn();
    render(SectionNav, { props: props({ onLibrary }) });

    screen.getByTestId('nav-library').click();
    expect(onLibrary).toHaveBeenCalledTimes(1);
  });

  it('скрывает счётчик уведомлений при нуле и показывает при наличии', () => {
    const { unmount } = render(SectionNav, { props: props({ unreadCount: 0 }) });
    expect(screen.getByTestId('nav-notifications').textContent).not.toContain('0');
    unmount();

    render(SectionNav, { props: props({ unreadCount: 3 }) });
    expect(screen.getByTestId('nav-notifications').textContent).toContain('3');
  });

  it('показывает индикатор замечаний одним значком', () => {
    render(SectionNav, { props: props({ alertCount: 2, alertTitles: 'a\nb', alertError: true }) });

    const alert = screen.getByTestId('header-alerts');
    expect(alert.textContent?.trim()).toBe('2');
  });

  it('на телефоне показывает нижнюю навигацию с теми же разделами', () => {
    render(SectionNav, { props: props({ mobile: true, libraryActive: true }) });

    const nav = screen.getByTestId('section-nav');
    expect(nav.getAttribute('data-mobile')).toBe('true');

    // Разделы и служебные пункты доступны и на телефоне.
    expect(screen.getByLabelText('Рабочие места')).toBeTruthy();
    expect(screen.getByLabelText('Заметки')).toBeTruthy();
    expect(screen.getByLabelText('Уведомления')).toBeTruthy();
    expect(screen.getByLabelText('Настройки')).toBeTruthy();
    // Активный раздел выделен.
    expect(screen.getByTestId('nav-library').getAttribute('aria-pressed')).toBe('true');
    // Колонка слева не рисуется: свёрнутая иконка раскрытия не показывается.
    expect(screen.queryByTestId('nav-expand')).toBeNull();
  });

  it('на телефоне показывает разметку активного раздела как и на широком окне', () => {
    render(SectionNav, { props: props({ mobile: true, workspaceActive: true }) });

    expect(screen.getByTestId('nav-workspace').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('nav-notes').getAttribute('aria-pressed')).toBe('false');
  });
});
