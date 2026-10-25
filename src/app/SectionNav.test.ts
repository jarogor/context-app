import { render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

import SectionNav from './SectionNav.svelte';

/** Значения свойств по умолчанию для тестов. */
function props(overrides: Record<string, unknown> = {}) {
  return {
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
    mobile: false,
    onWorkspace: vi.fn(),
    onLibrary: vi.fn(),
    onNotes: vi.fn(),
    onNotifications: vi.fn(),
    onSettings: vi.fn(),
    onTheme: vi.fn(),
    ...overrides,
  };
}

describe('SectionNav', () => {
  it('показывает разделы с доступными именами во вкладках верхней панели', () => {
    render(SectionNav, { props: props() });

    expect(screen.getByLabelText('Рабочее место')).toBeTruthy();
    expect(screen.getByLabelText('Библиотека')).toBeTruthy();
    expect(screen.getByLabelText('Заметки')).toBeTruthy();
    expect(screen.getByTestId('section-nav').getAttribute('data-mobile')).toBe('false');
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

  it('на широком окне показывается вкладками без служебных пунктов', () => {
    render(SectionNav, { props: props({ mobile: false, unreadCount: 3 }) });

    // Разделы — вкладки верхней панели; уведомления и настройки живут в шапке.
    expect(screen.getByTestId('nav-workspace')).toBeTruthy();
    expect(screen.queryByTestId('nav-notifications')).toBeNull();
    expect(screen.queryByTestId('nav-settings')).toBeNull();
  });

  it('красит разделы так же, как служебные кнопки шапки', () => {
    render(SectionNav, { props: props({ workspaceActive: true }) });

    const workspace = screen.getByTestId('nav-workspace');
    const library = screen.getByTestId('nav-library');

    // Один тон у всех пунктов меню: тот же, что у кнопок уведомлений и настроек
    // в шапке, — активный выделяется мягким фоном, а не сплошной заливкой.
    expect(workspace.className).toContain('text-muted-foreground');
    expect(library.className).toContain('text-muted-foreground');
    expect(workspace.className).toContain('bg-[var(--primary-soft)]');
    expect(library.className).not.toContain('bg-[var(--primary-soft)]');
    // Сплошной акцентной заливки, как у главных кнопок, нет.
    expect(workspace.className).not.toContain('bg-[var(--primary)]');
    expect(workspace.className).not.toContain('text-[var(--primary-foreground)]');
  });

  it('на узком окне показывает те же разделы кнопками-иконками без подписей', () => {
    render(SectionNav, { props: props({ mobile: true, libraryActive: true }) });

    const nav = screen.getByTestId('section-nav');
    expect(nav.getAttribute('data-mobile')).toBe('true');

    // Разделы доступны и на телефоне: те же кнопки с доступными именами.
    expect(screen.getByLabelText('Рабочее место')).toBeTruthy();
    expect(screen.getByLabelText('Заметки')).toBeTruthy();
    // Подпись внутри кнопки скрыта — остаётся иконка.
    expect(screen.getByTestId('nav-library').textContent?.trim()).toBe('');
    // Активный раздел выделен.
    expect(screen.getByTestId('nav-library').getAttribute('aria-pressed')).toBe('true');
  });

  it('на телефоне показывает разметку активного раздела как и на широком окне', () => {
    render(SectionNav, { props: props({ mobile: true, workspaceActive: true }) });

    expect(screen.getByTestId('nav-workspace').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('nav-notes').getAttribute('aria-pressed')).toBe('false');
  });
});
