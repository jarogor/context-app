// Линтер «Контекста»: ловит мусор, который не видит проверка типов.
//
// `svelte-check` проверяет типы, но не сообщает о неиспользуемых импортах и
// переменных: `noUnusedLocals` включён только в конфигурации сборки, а в
// приложении выключен — иначе он ругался бы на `$props()` и разметку Svelte.
// В результате мёртвый код оставался незамеченным. Поэтому здесь отдельный,
// обязательный шаг проверки: в CI он идёт до тестов.
//
// Форматирование проверяет Prettier (`npm run check:ts`). Стилистические
// правила из рекомендованных наборов сюда не входят: линтер отвечает за мусор
// (неиспользуемое, недостижимое, забытое), а не за вкус.

import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import svelte from 'eslint-plugin-svelte';
import svelteParser from 'svelte-eslint-parser';
import globals from 'globals';
import ts from 'typescript-eslint';

/** Каталоги, которые линтер не смотрит: сгенерированное и внешнее. */
const IGNORES = [
  'dist/**',
  'node_modules/**',
  'target/**',
  'src-tauri/**',
  'src-wasm-plugins/**/target/**',
  '_tmp/**',
  'dev_data/**',
  'src-tauri/resources/plugins/**',
  'src-tauri/resources/base-plugins/**',
  // Собранные модули рисования плагинов: это результат сборки, а не исходники.
  'src-wasm-plugins/*/viewer/**',
  'schemas/**',
];

export default [
  { ignores: IGNORES },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs.recommended,
  prettier,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        extraFileExtensions: ['.svelte'],
      },
    },
  },
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parserOptions: {
        parser: ts.parser,
      },
    },
  },
  {
    // Модули рантайма Svelte (`.svelte.ts`) содержат руны, поэтому их тоже
    // разбирает парсер Svelte, а TypeScript-выражения внутри — парсер TS.
    files: ['**/*.svelte.ts'],
    languageOptions: {
      parser: svelteParser,
      parserOptions: {
        parser: ts.parser,
      },
    },
  },
  {
    // Задача линтера — мусор, а не стиль. Неиспользуемый код (импорты,
    // переменные, параметры) — ошибка, потому что именно он накапливался
    // незамеченным. Подчёркиванием помечают намеренно неиспользуемое.
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'after-used',
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          // `catch (error)` без использования — обычный приём: имя нужно,
          // чтобы отличить перехват от пропуска ошибки.
          caughtErrors: 'none',
        },
      ],
      '@typescript-eslint/no-unused-expressions': 'error',
      'no-unreachable': 'error',
      'no-constant-condition': 'error',
      'no-self-assign': 'error',
      'no-unused-private-class-members': 'error',
    },
  },
  {
    // Рекомендованный набор Svelte проверяет приёмы написания (реактивность,
    // ключи в `#each`, `{@html}`), а не мусор. Часть этих приёмов в проекте
    // выбрана осознанно, и линтер не должен переписывать чужой код: здесь
    // остаются только правила о неиспользуемом.
    rules: {
      'svelte/prefer-svelte-reactivity': 'off',
      'svelte/require-each-key': 'off',
      'svelte/no-at-html-tags': 'off',
      'svelte/prefer-writable-derived': 'off',
      'svelte/no-useless-children-snippet': 'off',
    },
  },
];
