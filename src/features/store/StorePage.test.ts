import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import StorePage from './StorePage.svelte';
import { invokeCommand } from '../../shared/app-bridge';

vi.mock('../../shared/app-bridge', () => ({
  invokeCommand: vi.fn(),
  listenEvent: vi.fn(async () => () => {}),
  openDialog: vi.fn(async () => null),
}));

const invoke = vi.mocked(invokeCommand);

beforeEach(() => {
  invoke.mockReset();
});

describe('страница обновлений', () => {
  it('рисует каталог, загруженный на бутстрапе, без обращения к плагину', () => {
    const onPendingChange = vi.fn();

    render(StorePage, {
      initialPlugins: [
        {
          id: 'p1',
          name: 'books-source-calibre',
          kind: 'books',
          description: 'Плагин источника книг',
          enabled: true,
          removable: false,
        },
        {
          id: 'p2',
          name: 'installed-plugin',
          kind: 'extension',
          description: 'Установленный плагин',
          enabled: false,
          removable: true,
        },
      ],
      initialStores: [
        { id: 's1', kind: 'file', title: 'Локальный стор', location: '/stores/main' },
      ],
      initialPending: true,
      onPendingChange,
    });

    expect(screen.getByText('books-source-calibre')).toBeTruthy();
    expect(screen.getByText('installed-plugin')).toBeTruthy();
    expect(screen.getByText('/stores/main')).toBeTruthy();
    expect(onPendingChange).toHaveBeenCalledWith(true);
    // Каталог передан бутстрапом: обращения к плагину за ним нет.
    expect(
      invoke.mock.calls.some(([command]) => command === 'invoke_base_plugin_operation'),
    ).toBe(false);
  });

  it('показывает все плагины одним списком, без деления на виды', () => {
    render(StorePage, {
      initialPlugins: [
        {
          id: 'p1',
          name: 'books-source',
          kind: 'books',
          description: 'Источник книг',
          enabled: true,
          removable: false,
        },
        {
          id: 'p2',
          name: 'format-pdf',
          kind: 'format',
          description: 'Формат чтения',
          enabled: true,
          removable: false,
        },
        {
          id: 'p3',
          name: 'installed-plugin',
          kind: 'extension',
          description: 'Расширение',
          enabled: true,
          removable: true,
        },
      ],
      initialStores: [],
      initialPending: false,
    });

    // Один список плагинов: заголовков-групп по видам нет.
    const list = screen.getByTestId('store-plugins');
    expect(list.querySelectorAll('li')).toHaveLength(3);
    expect(screen.queryByTestId('store-group')).toBeNull();
    expect(screen.getByText('books-source')).toBeTruthy();
    expect(screen.getByText('format-pdf')).toBeTruthy();
    expect(screen.getByText('installed-plugin')).toBeTruthy();
  });

  it('показывает пустое состояние без плагинов и сторов', () => {
    render(StorePage, { initialPlugins: [], initialStores: [], initialPending: false });

    expect(screen.getByText('Нет плагинов')).toBeTruthy();
    // Форм правки нет до нажатия: раздел показывает адреса, а не поля ввода.
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });

  it('разделяет обновления и установленные плагины', () => {
    // «Что можно обновить» и «что установлено» — разные вопросы и разные
    // карточки; встроенный источник и плагины живут отдельно от обновлений.
    render(StorePage, {
      initialPlugins: [
        {
          id: 'p1',
          name: 'format-pdf',
          kind: 'format',
          description: 'Формат чтения',
          enabled: true,
          removable: false,
        },
      ],
      initialStores: [],
      initialPending: false,
    });

    // Плагины — один раздел: установленные и их обновления вместе.
    expect(screen.getByText('Плагины')).toBeTruthy();
    expect(screen.getByTestId('store-plugins')).toBeTruthy();
    // В каждом разделе своя подпись «Источник»: раздел уже задаёт, чей он.
    expect(screen.getAllByText('Источник')).toHaveLength(2);
    // Отдельного списка «что обновить» нет: уведомление стоит у плагина.
    expect(screen.queryByTestId('store-updates')).toBeNull();
  });

  it('показывает источник у каждого обновления', () => {
    // Обновления приходят из разных мест, и без источника непонятно, откуда
    // ставится обновление приложения и каждый плагин.
    render(StorePage, {
      initialPlugins: [],
      initialStores: [
        // Адрес приложения и источник плагинов — разные записи. Адрес
        // приложения в списке источников плагинов не повторяется.
        { id: 's1', kind: 'file', title: 'updates', location: '/data/updates' },
        { id: 's2', kind: 'file', title: 'plugins', location: '/data/plugins' },
      ],
      initialPending: false,
      initialUpdate: {
        current_version: '0.1.0',
        config: {
          source: { kind: 'file', location: '/data/updates' },
          check_on_startup: true,
        },
        last_check: {
          source: { kind: 'file', location: '/data/updates' },
          core: { current_version: '0.1.0', version: '0.2.0', notes: '', mode: 'portable' },
          checked_at_millis: 0,
          errors: [],
        },
      },
      initialPluginUpdates: [
        {
          store: 's1',
          name: 'format-pdf',
          package: { name: 'format-pdf', version: '0.2.0', location: 'p.zip' },
          current_version: '0.1.0',
        },
      ],
    });

    // Приложение: свой источник.
    expect(screen.getByTestId('store-app-source').textContent).toBe('/data/updates');
    // Плагины: свой источник, и он отличается от адреса приложения.
    const pluginSource = screen.getByTestId('store-plugin-source');
    expect(pluginSource.textContent).toBe('/data/plugins');
  });

  it('источник приложения можно изменить, а не только прочитать', () => {
    // Адрес показывается не для красоты: если он неверный, его нужно менять
    // здесь же.
    // Разные команды отдают разное: подменяем ответ по имени команды.
    invoke.mockImplementation(async (command: string) => {
      if (command === 'invoke_base_plugin_operation') {
        return { plugins: [], stores: [] };
      }
      if (command === 'update_status') {
        return {
          current_version: '0.1.0',
          config: { source: { kind: 'file', location: '/old/updates' }, check_on_startup: true },
          last_check: null,
        };
      }
      if (command === 'update_source_set') {
        return { source: { kind: 'file', location: '/new/updates' }, check_on_startup: true };
      }
      return null;
    });
    render(StorePage, {
      initialPlugins: [],
      initialStores: [],
      initialPending: false,
      initialUpdate: {
        current_version: '0.1.0',
        config: {
          source: { kind: 'file', location: '/old/updates' },
          check_on_startup: true,
        },
        last_check: null,
      },
    });

    // Пока правка не начата, адрес только показан.
    expect(screen.getByTestId('store-app-source').textContent).toBe('/old/updates');
    // Возврат встроенного — действие правки, а не просмотра.
    expect(screen.queryByText('Вернуть встроенный')).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: 'Изменить: Источник' })[0]);
    // Началась правка: поле с текущим адресом.
    const inputs = screen.getAllByPlaceholderText(
      'Адрес или путь к папке обновлений',
    ) as HTMLInputElement[];
    expect(inputs.some((input) => input.value === '/old/updates')).toBe(true);
    // Кнопка возврата применяет встроенный адрес сразу и закрывает форму.
    fireEvent.click(screen.getByText('Вернуть встроенный'));
    expect(invoke).toHaveBeenCalledWith('update_source_clear', {});
    expect(screen.queryByPlaceholderText('Адрес или путь к папке обновлений')).toBeNull();
  });

  it('сообщение проверки стоит в строке заголовка, а не отдельной строкой', async () => {
    // Итог проверки не должен сдвигать содержимое вниз: он стоит рядом с
    // названием раздела.
    invoke.mockResolvedValue({ source: null, core: null, checked_at_millis: 0, errors: [] });
    render(StorePage, {
      initialPlugins: [],
      initialStores: [],
      initialPending: false,
      initialUpdate: {
        current_version: '0.1.0',
        config: { source: { kind: 'file', location: '/data/updates' }, check_on_startup: true },
        last_check: { source: null, core: null, checked_at_millis: 0, errors: [] },
      },
    });

    await fireEvent.click(screen.getAllByRole('button', { name: 'Проверить обновления' })[0]);

    const message = await screen.findByTestId('app-update-message');
    // Рядом с заголовком: общий родитель — строка заголовка.
    expect(message.parentElement?.querySelector('h2')?.textContent).toBe('Приложение');
    // Ни итог, ни причины не стоят отдельными строками в содержимом.
    expect(screen.queryByTestId('app-update-errors')).toBeNull();
  });

  it('не выдаёт отсутствие обновлений за ошибку подключения', () => {
    // Место без индекса пакетов — не поломка сети: раньше любая ошибка
    // показывалась как «Не удалось проверить обновления. Проверьте подключение».
    render(StorePage, {
      initialPlugins: [],
      initialStores: [],
      initialPending: false,
      initialUpdate: {
        current_version: '0.1.0',
        config: {
          source: { kind: 'file', location: '/data/updates' },
          check_on_startup: true,
        },
        last_check: null,
      },
    });

    expect(screen.queryByText(/Проверьте подключение/)).toBeNull();
  });
});
