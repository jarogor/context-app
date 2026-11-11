import { expect, test } from '@playwright/test';

/** Ответ активной библиотеки для сценариев реестра рабочих мест. */
const ACTIVE_LIBRARY = { path: '/demo-library', provider_name: 'books-source' };

test.beforeEach(async ({ page }) => {
  await page.addInitScript((active) => {
    (window as unknown as { __TEXTURE_MOCK_OVERRIDES__: unknown }).__TEXTURE_MOCK_OVERRIDES__ = {
      handlers: {
        active_library: () => active,
        get_workspaces: () => {
          const raw = window.localStorage.getItem('workspaces');
          return raw ? JSON.parse(raw) : { workspaces: [], active_workspace_id: null };
        },
        save_workspaces: (payload: unknown) => {
          const workspaces = (payload as { workspaces?: unknown })?.workspaces;
          window.localStorage.setItem('workspaces', JSON.stringify(workspaces));
          return { ok: true };
        },
      },
    };
  }, ACTIVE_LIBRARY);
});

/** Создание рабочего места с указанным именем.
 *
 * Поле открывается кнопкой создания на любой ширине; кнопка остаётся на своём
 * месте и меняет действие: с введённым именем сохраняет, с пустым — закрывает.
 */
async function createWorkspace(page: import('@playwright/test').Page, name: string) {
  await page.getByRole('button', { name: 'Создать рабочее место' }).click();
  const field = page.getByPlaceholder('Новое рабочее место');
  await field.fill(name);
  // С введённым именем кнопка сохраняет рабочее место.
  await page.getByRole('button', { name: 'Создать рабочее место' }).click();
  await expect(page.getByTestId('workplace-tabs')).toBeVisible();
}

/** Возврат к списку рабочих мест кнопкой раздела в шапке. */
async function backToList(page: import('@playwright/test').Page) {
  await page.getByTestId('nav-workspace').click();
  await expect(page.getByTestId('workspaces-page')).toBeVisible();
}

/** Выбор рабочего места в диалоге, если он появился при открытии книги. */
async function pickWorkspaceIfAsked(page: import('@playwright/test').Page) {
  const list = page.getByTestId('workspace-picker-list');
  if (await list.isVisible().catch(() => false)) {
    await page.getByTestId('workspace-picker-item').first().click();
  }
}

test('до готовности реестра показывается загрузка, а не пустой список', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __TEXTURE_MOCK_OVERRIDES__: unknown }).__TEXTURE_MOCK_OVERRIDES__ = {
      handlers: {
        // Реестр приходит с задержкой: до его загрузки нельзя утверждать,
        // что рабочих мест нет.
        get_workspaces: () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  workspaces: [
                    {
                      id: 'ws-1',
                      name: 'Рабочее место',
                      created_at_millis: 1,
                      tabs: [],
                      active_tab_id: null,
                    },
                  ],
                  active_workspace_id: 'ws-1',
                }),
              400,
            ),
          ),
      },
    };
  });

  await page.goto('/');

  // Пока реестр грузится, оболочка ещё не смонтирована: видна загрузка.
  await expect(page.getByTestId('bootstrap-loading')).toBeVisible();
  await expect(page.getByTestId('workspaces-page')).toHaveCount(0);
  await expect(page.getByTestId('workspaces-empty')).toHaveCount(0);
  await expect(page.getByTestId('workspace-name').first()).toContainText('Рабочее место');
});

test('ошибка загрузки реестра не выглядит как отсутствие рабочих мест', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __TEXTURE_MOCK_OVERRIDES__: unknown }).__TEXTURE_MOCK_OVERRIDES__ = {
      handlers: {
        get_workspaces: () => {
          throw new Error('реестр недоступен');
        },
      },
    };
  });

  await page.goto('/');

  await expect(page.getByTestId('bootstrap-error')).toBeVisible();
  // Пустой список не показывается: «не удалось» и «пусто» — разные состояния.
  await expect(page.getByTestId('workspaces-empty')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Повторить' })).toBeVisible();
});

test('попытка после ошибки загрузки реестра открывает рабочие места', async ({ page }) => {
  await page.addInitScript(() => {
    let attempts = 0;
    (window as unknown as { __TEXTURE_MOCK_OVERRIDES__: unknown }).__TEXTURE_MOCK_OVERRIDES__ = {
      handlers: {
        get_workspaces: () => {
          attempts += 1;
          if (attempts === 1) {
            throw new Error('реестр недоступен');
          }
          return {
            workspaces: [
              {
                id: 'ws-1',
                name: 'Рабочее место',
                created_at_millis: 1,
                tabs: [],
                active_tab_id: null,
              },
            ],
            active_workspace_id: 'ws-1',
          };
        },
      },
    };
  });

  await page.goto('/');
  await expect(page.getByTestId('bootstrap-error')).toBeVisible();

  await page.getByRole('button', { name: 'Повторить' }).click();

  await expect(page.getByTestId('workspaces-page')).toBeVisible();
  await expect(page.getByTestId('workspace-name').first()).toContainText('Рабочее место');
});

test('список рабочих мест показывает обложки книг с числом остальных', async ({ page }) => {
  await page.goto('/');
  await createWorkspace(page, 'Первое');

  // Добавляем книгу: обложка извлекается из самого файла.
  await page.getByRole('button', { name: /Добавить книгу/ }).click();
  const library = page.locator('main');
  await library.getByRole('button', { name: /Демо-книга/ }).click();
  await library.getByRole('button', { name: /Читать/ }).click();
  await pickWorkspaceIfAsked(page);
  await expect(page.getByTestId('workplace-tab')).toHaveText('Демо-книга');

  await backToList(page);

  // Обложка видна картинкой, а не пустым квадратом-заглушкой, даже без
  // открытой библиотеки: она берётся из файла книги.
  const cover = page.getByTestId('workspace-covers').locator('img');
  await expect(cover).toHaveCount(1);
  await expect.poll(async () => (await cover.getAttribute('src')) ?? '').toContain('data:image');

  // Числа книг и вкладок — в одном блоке метаинформации.
  const meta = page.getByTestId('workspace-meta');
  await expect(meta.getByTestId('workspace-book-count')).toContainText('1 книга');
  await expect(meta.getByTestId('workspace-tab-count')).toContainText('1 вкладка');
});

test('числа книг и вкладок совпадают, когда книга открыта одной вкладкой', async ({ page }) => {
  await page.goto('/');
  await createWorkspace(page, 'Первое');
  await page.getByRole('button', { name: /Добавить книгу/ }).click();
  const library = page.locator('main');
  await library.getByRole('button', { name: /Демо-книга/ }).click();
  await library.getByRole('button', { name: /Читать/ }).click();
  await pickWorkspaceIfAsked(page);

  // Дублируем вкладку: книга та же, вкладок стало две.
  await page.getByLabel('Дублировать вкладку').first().click();
  await backToList(page);

  const meta = page.getByTestId('workspace-meta');
  await expect(meta.getByTestId('workspace-book-count')).toContainText('1 книга');
  // Русское склонение: 2 вкладки (форма 2–4), а не «вкладок».
  await expect(meta.getByTestId('workspace-tab-count')).toContainText('2 вкладки');
  // Обложка показана один раз — по книге, а не по вкладке.
  await expect(page.getByTestId('workspace-covers').locator('img')).toHaveCount(1);
  await expect(page.getByTestId('workspace-covers-more')).toHaveCount(0);
});

test('пустой реестр показывает подсказку создать рабочее место', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByTestId('workspaces-empty')).toBeVisible();
});

test('создание рабочего места добавляет его в список и открывает', async ({ page }) => {
  await page.goto('/');

  await createWorkspace(page, 'Исследование');

  await backToList(page);
  await expect(page.getByTestId('workspace-name')).toContainText('Исследование');
  await expect(page.getByTestId('workspace-current')).toBeVisible();
});

test('переключение между рабочими местами сохраняет их вкладки', async ({ page }) => {
  await page.goto('/');
  await createWorkspace(page, 'Первое');

  await page.getByRole('button', { name: /Добавить книгу/ }).click();
  const library = page.locator('main');
  await library.getByRole('button', { name: /Демо-книга/ }).click();
  await library.getByRole('button', { name: /Читать/ }).click();
  await pickWorkspaceIfAsked(page);
  await expect(page.getByTestId('workplace-tab')).toHaveText('Демо-книга');

  await backToList(page);
  await createWorkspace(page, 'Второе');
  await expect(page.getByTestId('workplace-tab')).toHaveCount(0);

  await backToList(page);
  await page
    .locator('[data-testid="workspace-item"]', { hasText: 'Первое' })
    .getByTestId('workspace-open')
    .click();
  await expect(page.getByTestId('workplace-tab')).toHaveText('Демо-книга');

  await backToList(page);
  await page
    .locator('[data-testid="workspace-item"]', { hasText: 'Второе' })
    .getByTestId('workspace-open')
    .click();
  await expect(page.getByTestId('workplace-tab')).toHaveCount(0);
});

test('переименование рабочего места отражается в списке', async ({ page }) => {
  await page.goto('/');
  await createWorkspace(page, 'Черновик');
  await backToList(page);

  await page.getByLabel(/Действия с рабочим местом/).click();
  await page.getByRole('menuitem', { name: 'Переименовать' }).click();
  await page.getByPlaceholder('Новое имя').fill('Основное');
  await page.getByRole('button', { name: 'Сохранить' }).click();

  await expect(page.getByTestId('workspace-name')).toContainText('Основное');
});

test('удаление рабочего места убирает его из списка', async ({ page }) => {
  await page.goto('/');
  await createWorkspace(page, 'Первое');
  await backToList(page);
  await createWorkspace(page, 'Второе');
  await backToList(page);

  await page
    .locator('[data-testid="workspace-item"]', { hasText: 'Первое' })
    .getByLabel('Действия с рабочим местом')
    .click();
  await page.getByRole('menuitem', { name: 'Удалить' }).click();

  await expect(page.getByTestId('workspace-item')).toHaveCount(1);
  await expect(page.getByTestId('workspace-name')).toContainText('Второе');
  // Удалено не текущее место — Второе остаётся текущим.
  await expect(page.getByTestId('workspace-current')).toBeVisible();
});

test('удаление последнего рабочего места показывает пустой список', async ({ page }) => {
  await page.goto('/');
  await createWorkspace(page, 'Единственное');
  await backToList(page);

  await page.getByLabel(/Действия с рабочим местом/).click();
  await page.getByRole('menuitem', { name: 'Удалить' }).click();

  await expect(page.getByTestId('workspaces-empty')).toBeVisible();
  await expect(page.getByTestId('workplace-tabs')).toHaveCount(0);
});

test('реестр рабочих мест переживает перезагрузку', async ({ page }) => {
  await page.goto('/');
  await createWorkspace(page, 'Исследование');
  await backToList(page);
  await createWorkspace(page, 'Второе');

  await expect
    .poll(async () => {
      const raw = await page.evaluate(() => window.localStorage.getItem('workspaces'));
      const registry = raw ? JSON.parse(raw) : null;
      return registry?.workspaces?.length ?? 0;
    })
    .toBe(2);

  await page.reload();

  // При запуске открывается список рабочих мест — он и есть точка входа.
  await expect(page.getByTestId('workspaces-page')).toBeVisible();
  await expect(page.getByTestId('workspace-open')).toHaveCount(2);
});

test('кнопка создания не переезжает при вводе имени', async ({ page }) => {
  // Кнопка стоит на одном месте до и во время ввода: меняется только её
  // действие (с введённым именем — сохранить, с пустым — закрыть). Иначе она
  // уходила бы из-под курсора и нажатие попадало бы мимо.
  for (const width of [390, 1400]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Создать рабочее место' }).click();

    const before = await page.getByLabel('Отменить создание').boundingBox();
    await page.getByPlaceholder('Новое рабочее место').fill('Новое');
    const after = await page.getByRole('button', { name: 'Создать рабочее место' }).boundingBox();
    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    expect(Math.abs(before!.x - after!.x)).toBeLessThan(2);
    expect(Math.abs(before!.y - after!.y)).toBeLessThan(2);

    // Поле стоит вплотную к кнопке справа: левый край поля примыкает к
    // правому краю кнопки, а не тянется через всю полосу.
    const field = await page.getByPlaceholder('Новое рабочее место').boundingBox();
    expect(field).not.toBeNull();
    expect(Math.abs(field!.x - (after!.x + after!.width) - 8)).toBeLessThan(10);

    // На телефоне и планшете поле занимает свободное место полосы (минус
    // кнопка и промежутки), на широком окне остаётся компактным.
    const controls = await page.getByTestId('workspaces-controls').boundingBox();
    const expected = width < 1024 ? controls!.width - 52 : 22 * 16;
    expect(Math.abs(field!.width - expected)).toBeLessThan(8);

    await page.getByRole('button', { name: 'Создать рабочее место' }).click();
    await expect(page.getByTestId('workplace-tabs')).toBeVisible();
  }
});

test('список рабочих мест адаптивен к ширине окна', async ({ page }) => {
  // Узкое окно: список занимает ширину без горизонтальной прокрутки.
  await page.setViewportSize({ width: 600, height: 700 });
  await page.goto('/');
  await createWorkspace(page, 'Первое');
  await backToList(page);
  await createWorkspace(page, 'Второе');
  await backToList(page);

  await expect(
    page.getByTestId('workspaces-page').getByPlaceholder('Поиск рабочего места'),
  ).toBeVisible();
  // Создание и поиск стоят в одной полосе: кнопка и поле на одной высоте, а не
  // двумя отдельными рядами.
  const search = await page.getByPlaceholder('Поиск рабочего места').boundingBox();
  const create = await page.getByRole('button', { name: 'Создать рабочее место' }).boundingBox();
  expect(search).not.toBeNull();
  expect(create).not.toBeNull();
  expect(Math.abs(search!.y - create!.y)).toBeLessThan(5);
  // Кнопка стоит слева от поля поиска, как в списке библиотек.
  expect(create!.x).toBeLessThan(search!.x);
  // Счётчик найденного — часть поля поиска, а не отдельный элемент полосы.
  await expect(
    page.getByTestId('workspaces-controls').getByTestId('workspaces-counter'),
  ).toBeVisible();

  const narrow = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
  );
  expect(narrow).toBe(true);

  // Широкое окно: список остаётся вертикальным, форма поиска — в полосе
  // управления над списком, а не колонкой сбоку.
  await page.setViewportSize({ width: 1400, height: 800 });
  // Режим показа задаётся явно: предыдущие проверки могли сохранить его в
  // браузере, а измеряется раскладка плитки.
  await page.getByRole('button', { name: 'Плитка' }).click();
  const grid = page.getByTestId('workspaces-grid');
  await expect(grid).toBeVisible();
  const gridBox = await grid.boundingBox();
  const searchBox = await page.getByPlaceholder('Поиск рабочего места').boundingBox();
  expect(gridBox).not.toBeNull();
  expect(searchBox).not.toBeNull();
  expect(searchBox!.y).toBeLessThan(gridBox!.y);
});
