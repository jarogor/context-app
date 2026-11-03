import { render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

import SectionNav from './SectionNav.svelte';

/** Значения свойств по умолчанию для тестов. */
function props(overrides: Record<string, unknown> = {}) {
  return {
    workspaceActive: false,
    libraryActive: false,
    notesActive: false,
    settingsOpen: false,
    alertCount: 0,
    alertTitles: '',
    alertError: false,
    theme: 'light' as const,
    themeNext: 'dark' as const,
    mobile: false,
    onWorkspace: vi.fn(),
    onLibrary: vi.fn(),
    onNotes: vi.fn(),
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
    render(SectionNav, { props: props({ mobile: false }) });

    // Разделы — вкладки верхней панели; настройки живут в шапке.
    expect(screen.getByTestId('nav-workspace')).toBeTruthy();
    expect(screen.queryByTestId('nav-notifications')).toBeNull();
    expect(screen.queryByTestId('nav-settings')).toBeNull();
  });

  it('выделяет активный раздел той же заливкой, что активную вкладку', () => {
    render(SectionNav, { props: props({ workspaceActive: true }) });

    const workspace = screen.getByTestId('nav-workspace');
    const library = screen.getByTestId('nav-library');

    // В покое все кнопки шапки одного тона: приглушённый цвет текста.
    expect(library.className).toContain('text-muted-foreground');
    // Активный раздел выделен плотной акцентной заливкой — так же, как
    // активная вкладка книги: одно выделение на всё приложение.
    expect(workspace.className).toContain('bg-[var(--primary)]');
    expect(workspace.className).toContain('text-[var(--primary-foreground)]');
    expect(library.className).not.toContain('bg-[var(--primary)]');
  });

  it('на телефоне показывает нижнюю навигацию с разделами и служебными действиями', () => {
    render(SectionNav, { props: props({ mobile: true, libraryActive: true }) });

    const nav = screen.getByTestId('section-nav');
    expect(nav.getAttribute('data-mobile')).toBe('true');

    // Телефон — не уменьшенный десктоп: в нижней полосе не только разделы, но и
    // служебные действия (тема, настройки), доступные пальцу.
    for (const label of ['Рабочее место', 'Библиотека', 'Заметки', 'Настройки']) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
    expect(screen.getByTestId('nav-theme')).toBeTruthy();
    // Активный раздел выделен и здесь.
    expect(screen.getByTestId('nav-library').getAttribute('aria-pressed')).toBe('true');
  });

  it('на телефоне пункт навигации — вертикальный: иконка над подписью', () => {
    render(SectionNav, { props: props({ mobile: true }) });

    // Кнопка нижней полосы складывает иконку и подпись столбиком, а не строкой:
    // иначе полоса не помещается по ширине телефона.
    const workspace = screen.getByTestId('nav-workspace');
    expect(workspace.className).toContain('flex-col');
    expect(workspace.className).toContain('flex-1');
    // Короткая подпись вместо полного названия — полоса помещается целиком.
    expect(workspace.textContent?.trim()).toBe('Место');
  });

  it('на телефоне сообщает о выборе служебных действий', () => {
    const onTheme = vi.fn();
    const onSettings = vi.fn();
    render(SectionNav, { props: props({ mobile: true, onTheme, onSettings }) });

    screen.getByTestId('nav-theme').click();
    screen.getByTestId('nav-settings').click();

    expect(onTheme).toHaveBeenCalledTimes(1);
    expect(onSettings).toHaveBeenCalledTimes(1);
  });

  it('на телефоне показывает замечания отдельным пунктом', () => {
    render(SectionNav, { props: props({ mobile: true, alertCount: 2, alertError: true }) });

    // Замечания видны и без верхней панели: индикатор живёт в нижней полосе.
    expect(screen.getByTestId('header-alerts')).toBeTruthy();
    expect(screen.getByLabelText('Замечания: 2')).toBeTruthy();
  });
});
