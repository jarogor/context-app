import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/** Содержимое файла токенов дизайн-системы. */
const tokens = readFileSync(resolve(process.cwd(), 'src/tokens.css'), 'utf8');

describe('токены оформления', () => {
  it('объявляет три уровня фона: область, панель и карточка', () => {
    expect(tokens).toContain('--background:');
    expect(tokens).toContain('--panel:');
    expect(tokens).toContain('--card:');
  });

  it('берёт фон панели из ступени палитры, а не смеси с фоном', () => {
    // Панель и полоса вкладок стоят рядом и несут одинаковые элементы, поэтому
    // у них один фон: иначе наведение и выделение выглядят в двух местах
    // по-разному.
    const panel = tokens.match(/--panel:\s*([^;]+);/);
    expect(panel).toBeTruthy();
    expect(panel?.[1]).toContain('var(--app-bar-strip)');
    expect(panel?.[1]).not.toContain('color-mix');
  });

  it('объявляет единый набор теней и выводит его в утилиты', () => {
    expect(tokens).toContain('--elevation-raised:');
    expect(tokens).toContain('--elevation-overlay:');
    expect(tokens).toContain('--shadow-raised:');
    expect(tokens).toContain('--shadow-overlay:');
  });

  it('объявляет роли размера текста с размером, интервалом и насыщенностью', () => {
    for (const role of [
      'role-display',
      'role-title',
      'role-subtitle',
      'role-body',
      'role-label',
      'role-caption',
      'role-mono',
    ]) {
      expect(tokens, role).toContain(`@utility ${role}`);
    }
    // Размер и междустрочный интервал входят в каждую роль.
    expect(tokens).toMatch(/@utility role-body\s*\{[^}]*font-size:[^}]*line-height:/s);
  });

  it('не опускает размер ролей ниже 0.75rem', () => {
    // Каждая роль задана базовым размером в `rem`, умноженным на масштаб
    // интерфейса: сам размер от ширины окна не зависит.
    const sizes = [
      ...tokens.matchAll(
        /--role-(?:display|heading|title|subtitle|body|small)-size:\s*calc\(([\d.]+)rem/g,
      ),
    ];
    expect(sizes.length).toBeGreaterThan(0);
    for (const [, size] of sizes) {
      expect(Number(size)).toBeGreaterThanOrEqual(0.75);
    }
  });

  it('масштаб задаётся множителем, а не шириной окна', () => {
    // Шкала одна: от ширины монитора она не растёт, зато умножается на
    // `--ui-scale`, который выставляет настройка пользователя.
    expect(tokens).toContain('--ui-scale: 1;');
    for (const token of ['--spacing', '--role-body-size', '--radius']) {
      const declaration = tokens.split('\n').find((line) => line.trim().startsWith(`${token}:`));
      expect(declaration, token).toContain('var(--ui-scale)');
    }
    // Ступеней от ширины окна больше нет: масштаб не зависит от монитора.
    expect(tokens).not.toMatch(/@media \(min-width: (?:90|120)rem\)/);
  });

  it('различает палитры фоном и акцентом', () => {
    // Каждая палитра обязана иметь свой характер: если у двух палитр совпадают
    // фон и акцент, они дубликаты, и подсветка в них неразличима.
    const blocks = [
      ...tokens.matchAll(
        /:root\[data-palette='([a-z]+)'\](?:\[data-theme='dark'\])?\s*\{([\s\S]*?)\n\}/g,
      ),
    ];
    const seen = new Map<string, string>();
    for (const [, id, body] of blocks) {
      const value = (name: string) => body.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1].trim();
      const key = `${value('background')}|${value('primary')}`;
      const previous = seen.get(key);
      expect(
        previous,
        `палитры «${previous}» и «${id}» совпадают фоном и акцентом`,
      ).toBeUndefined();
      seen.set(key, id);
    }
    expect(seen.size).toBeGreaterThan(0);
  });

  it('задаёт подсветку меню и подложку кода одним правилом на все наборы', () => {
    // Дефект: цвет подсветки и подложки подбирался в каждой палитре отдельно, и
    // стороны темы разъезжались — в светлой теме подсветка меню была втрое
    // контрастнее тёмной, а подложка кода в тёмной выступала сильнее текста.
    // Одно правило (доля текста в поверхности) не даёт им разойтись.
    const menu = tokens.match(/--menu-hover:\s*([^;]+);/);
    expect(menu?.[1]).toContain('color-mix');
    expect(menu?.[1]).toContain('var(--foreground)');
    expect(menu?.[1]).toContain('var(--overlay-surface)');

    const code = tokens.match(/--code-surface:\s*([^;]+);/);
    expect(code?.[1]).toContain('color-mix');
    expect(code?.[1]).toContain('var(--foreground)');
    expect(code?.[1]).toContain('var(--card)');

    // В блоках палитр этих значений быть не должно: иначе сторона темы снова
    // получит собственный цвет и разойдётся с остальными.
    for (const match of tokens.matchAll(
      /:root\[data-palette='[a-z]+'\](?:\[data-theme='dark'\])?\s*\{([\s\S]*?)\n\}/g,
    )) {
      expect(match[1], 'палитра не переопределяет подсветку меню').not.toContain('--menu-hover:');
      expect(match[1], 'палитра не переопределяет подложку кода').not.toContain('--code-surface:');
    }
  });

  it('берёт акцент кнопок над книгой из токенов области чтения', () => {
    // Кнопка шрифта и инструмента заметок стоит поверх книги и относится к
    // чтению. Пока она брала `--primary`, при тёмной книге в светлом интерфейсе
    // она оставалась светлой и выпадала из оформления области чтения.
    const accent = tokens.match(/--reader-accent:\s*([^;]+);/);
    expect(accent).toBeTruthy();
    expect(accent?.[1].trim()).toBe('var(--reader-link)');

    const ink = tokens.match(/--reader-accent-ink:\s*([^;]+);/);
    expect(ink).toBeTruthy();
    expect(ink?.[1].trim()).toBe('var(--reader-background)');

    // Ни одна палитра не переопределяет пару своими значениями: она обязана
    // следовать за токенами области чтения, которые уже разведены по палитрам
    // и сторонам темы.
    for (const match of tokens.matchAll(
      /:root\[data-palette='[a-z]+'\]\[data-reader-theme='(?:light|dark)'\]\s*\{([\s\S]*?)\n\}/g,
    )) {
      expect(match[1], 'палитра не переопределяет акцент области чтения').not.toContain(
        '--reader-accent:',
      );
    }
  });

  it('строит поверхность меню над книгой из токенов области чтения', () => {
    // Меню инструмента заметок стоит поверх книги. Пока оно брало `--menu-surface`
    // и `--surface-hover` интерфейса, при тёмной книге в светлом интерфейсе оно
    // оставалось светлым и выпадало из оформления чтения.
    for (const name of [
      '--reader-surface',
      '--reader-control-surface',
      '--reader-hover',
      '--reader-selected',
    ]) {
      const value = tokens.match(new RegExp(`${name}:\\s*([^;]+);`));
      expect(value, name).toBeTruthy();
      expect(value?.[1], name).toContain('color-mix');
      expect(value?.[1], name).toContain('var(--reader-');
    }

    // Палитры в это правило не вмешиваются: сторона и палитра чтения уже заданы
    // своими блоками, и повторное значение снова развело бы оформление.
    for (const match of tokens.matchAll(
      /:root\[data-palette='[a-z]+'\]\[data-reader-theme='(?:light|dark)'\]\s*\{([\s\S]*?)\n\}/g,
    )) {
      expect(match[1], 'палитра не переопределяет слой чтения').not.toContain('--reader-surface:');
    }
  });
});
