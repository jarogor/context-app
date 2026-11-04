import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

import SourceEditor from './SourceEditor.svelte';

describe('форма источника', () => {
  it('ставит курсор в поле при открытии правки', async () => {
    render(SourceEditor, {
      label: 'Источник',
      ariaLabel: 'Источник',
      testId: 'src',
      value: '/data/updates',
      kind: 'file',
      onSave: () => {},
      onChooseFolder: () => {},
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Изменить: Источник' }));
    // Ввод начинается сразу: поле уже в фокусе, кликать по нему не нужно.
    await Promise.resolve();
    const input = screen.getByPlaceholderText(
      'Адрес или путь к папке обновлений',
    ) as HTMLInputElement;
    expect(document.activeElement).toBe(input);
  });

  it('сохраняет полный адрес, а не только дописанное', async () => {
    const onSave = vi.fn();
    render(SourceEditor, {
      label: 'Источник',
      ariaLabel: 'Источник',
      testId: 'src',
      value: '/home/user/.context/updates',
      kind: 'file',
      onSave,
      onChooseFolder: () => {},
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Изменить: Источник' }));
    const input = screen.getByPlaceholderText(
      'Адрес или путь к папке обновлений',
    ) as HTMLInputElement;
    expect(input.value).toBe('/home/user/.context/updates');

    await fireEvent.input(input, { target: { value: '/home/user/.context/updatesXYZ' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSave).toHaveBeenCalledWith('/home/user/.context/updatesXYZ', 'file');
  });

  it('не теряет введённое при правке', async () => {
    const onSave = vi.fn();
    render(SourceEditor, {
      label: 'Источник',
      ariaLabel: 'Источник',
      testId: 'src',
      value: '',
      kind: 'file',
      onSave,
      onChooseFolder: () => {},
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Изменить: Источник' }));
    const input = screen.getByPlaceholderText(
      'Адрес или путь к папке обновлений',
    ) as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'dfg' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    // При правке вид не пересчитывается: что ввели, то и сохраняется.
    expect(onSave).toHaveBeenCalledWith('dfg', 'file');
  });
});

describe('добавление источника', () => {
  it('определяет сетевой вид по вводу', async () => {
    const onAdd = vi.fn();
    render(SourceEditor, {
      label: 'Источник',
      ariaLabel: 'Источник',
      testId: 'src',
      value: '/old',
      kind: 'file',
      onSave: () => {},
      onAdd,
      onChooseFolder: () => {},
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Добавить' }));
    const input = screen.getByPlaceholderText(
      'Адрес или путь к папке обновлений',
    ) as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'https://example.com/u' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onAdd).toHaveBeenCalledWith('https://example.com/u', 'network');
  });

  it('оставляет файловый вид для пути при добавлении', async () => {
    const onAdd = vi.fn();
    render(SourceEditor, {
      label: 'Источник',
      ariaLabel: 'Источник',
      testId: 'src',
      value: '/old',
      kind: 'file',
      onSave: () => {},
      onAdd,
      onChooseFolder: () => {},
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Добавить' }));
    const input = screen.getByPlaceholderText(
      'Адрес или путь к папке обновлений',
    ) as HTMLInputElement;
    await fireEvent.input(input, { target: { value: '/data/plugins' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onAdd).toHaveBeenCalledWith('/data/plugins', 'file');
  });
});
