#!/usr/bin/env node
// Развёртывание и проверка артефактов плагинов.
//
// Единственный источник правды — каталоги плагинов в `src-wasm-plugins/`:
// манифест `plugin-manifest.json`, исходники модуля рисования и декларация
// внешних файлов `bundle-assets.json`. Скрипт сам находит плагины в workspace,
// поэтому новый плагин не нужно нигде дополнительно регистрировать.
//
// Команды:
//   node scripts/plugin-artifacts.mjs build  — собрать артефакты в ресурсы;
//   node scripts/plugin-artifacts.mjs check  — проверить, что ресурсы актуальны.
//
// Виды плагинов:
//   * WASM-плагин (в манифесте есть `module`) — разворачивается `<модуль>.wasm`
//     и манифест; WASM-модуль предварительно собирает Cargo;
//   * статический плагин (модуля нет) — разворачивается весь каталог исходника
//     (кроме `bundle-assets.json`) плюс файлы из декларации внешних ассетов.
//
// Целостность развёрнутого каталога фиксируется хэшем `.bundle.sha256`;
// `check` сверяет и файлы, и хэш.

import { createHash } from 'node:crypto';
import {
    copyFileSync,
    cpSync,
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    rmSync,
    statSync,
    writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Корень проекта. */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** Каталог исходников WASM-плагинов (Cargo workspace). */
const WORKSPACE = join(ROOT, 'src-wasm-plugins');
/** Ресурсы поставляемых source/extension-плагинов. */
const PLUGINS_DIR_NAME = 'plugins';
const PLUGINS_DIR = join(ROOT, 'src-tauri', 'resources', PLUGINS_DIR_NAME);
/** Ресурсы плагинов каркаса. */
const BASE_PLUGINS_DIR = join(ROOT, 'src-tauri', 'resources', 'base-plugins');
/** Имя файла с хэшем развёрнутого каталога. */
const HASH_FILE = '.bundle.sha256';
/** Имя файла декларации внешних ассетов плагина. */
const ASSETS_FILE = 'bundle-assets.json';

/** Каталог развёртывания плагина по уровню из манифеста.
 *
 * Каркасные плагины (уровень `framework`) раскладываются в `base-plugins/`,
 * прикладные — в `plugins/`. Отсутствие поля трактуется как прикладной плагин.
 */
function targetDir(manifest, name) {
    return join(manifest.level === 'framework' ? BASE_PLUGINS_DIR : PLUGINS_DIR, name);
}

/** Список плагинов workspace: каталоги с манифестом. */
function listPlugins() {
    const entries = readdirSync(WORKSPACE, { withFileTypes: true });
    const plugins = [];
    for (const entry of entries) {
        if (!entry.isDirectory()) {
            continue;
        }
        const dir = join(WORKSPACE, entry.name);
        const manifestPath = join(dir, 'plugin-manifest.json');
        if (!existsSync(manifestPath)) {
            continue;
        }
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
        plugins.push({ name: entry.name, dir, manifest, manifestPath });
    }
    return plugins;
}

/** Имя WASM-модуля из имени крейта Cargo. */
function wasmFileName(plugin) {
    const cargo = readFileSync(join(plugin.dir, 'Cargo.toml'), 'utf8');
    const match = cargo.match(/^name\s*=\s*"([^"]+)"/m);
    if (!match) {
        throw new Error(`${plugin.name}: в Cargo.toml не найдено имя крейта`);
    }
    const module = plugin.manifest.module;
    if (!module) {
        throw new Error(`${plugin.name}: в манифесте не указан module`);
    }
    return module;
}

/** Декларация внешних ассетов плагина (или null). */
function assetsOf(plugin) {
    const path = join(plugin.dir, ASSETS_FILE);
    if (!existsSync(path)) {
        return null;
    }
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    return Array.isArray(parsed.assets) ? parsed.assets : [];
}

/** Пути, исключаемые из развёртывания плагина.
 *
 * Исходники самостоятельных подпроектов плагина (например фронтенд-проекта
 * модуля рисования) в артефакты не попадают: декларация `bundle-assets.json`
 * перечисляет их в поле `exclude`.
 */
function excludesOf(plugin) {
    const path = join(plugin.dir, ASSETS_FILE);
    if (!existsSync(path)) {
        return [];
    }
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    if (!Array.isArray(parsed.exclude)) {
        return [];
    }
    return parsed.exclude.map((value) => String(value).replaceAll('\\', '/').replace(/\/+$/, ''));
}

/** Признак, что путь исключён из развёртывания (сам путь или его подкаталог). */
function isExcluded(relative, excludes) {
    for (const exclude of excludes) {
        if (relative === exclude || relative.startsWith(`${exclude}/`)) {
            return true;
        }
    }
    return false;
}

/** Рекурсивный сбор файлов каталога относительно его корня. */
function collectFiles(dir, base = dir, acc = []) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            collectFiles(full, base, acc);
        } else if (entry.isFile()) {
            acc.push(full.slice(base.length + 1));
        }
    }
    return acc;
}

/** Ожидаемые файлы плагина: относительный путь → Buffer. */
function expectedFiles(plugin) {
    const files = new Map();
    const manifest = readFileSync(plugin.manifestPath);
    files.set('plugin-manifest.json', manifest);
    if (plugin.manifest.module) {
        const wasmPath = join(WORKSPACE, 'target', 'wasm32-unknown-unknown', 'release', wasmFileName(plugin));
        if (!existsSync(wasmPath)) {
            throw new Error(
                `${plugin.name}: не найден собранный модуль ${wasmPath};` +
                    ' сначала выполните сборку WASM-плагинов',
            );
        }
        files.set(plugin.manifest.module, readFileSync(wasmPath));
    } else {
        const excludes = excludesOf(plugin);
        for (const relative of collectFiles(plugin.dir)) {
            const normalized = relative.replaceAll('\\', '/');
            if (normalized === ASSETS_FILE || isExcluded(normalized, excludes)) {
                continue;
            }
            files.set(normalized, readFileSync(join(plugin.dir, relative)));
        }
    }
    const assets = assetsOf(plugin);
    if (assets) {
        for (const asset of assets) {
            const from = join(ROOT, asset.from);
            if (!existsSync(from)) {
                throw new Error(`${plugin.name}: не найден внешний ассет ${asset.from}`);
            }
            files.set(asset.to, readFileSync(from));
        }
    }
    return files;
}

/** Хэш набора файлов (путь + содержимое) для контроля целостности. */
function hashFiles(files) {
    const hash = createHash('sha256');
    for (const [relative, data] of [...files.entries()].sort(([a], [b]) => a.localeCompare(b))) {
        hash.update(relative);
        hash.update('\0');
        hash.update(data);
        hash.update('\0');
    }
    return hash.digest('hex');
}

/** Развёртывание одного плагина. */
function deploy(plugin) {
    const files = expectedFiles(plugin);
    const outDir = targetDir(plugin.manifest, plugin.name);
    rmSync(outDir, { recursive: true, force: true });
    mkdirSync(outDir, { recursive: true });
    for (const [relative, data] of files) {
        const path = join(outDir, relative);
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, data);
    }
    writeFileSync(join(outDir, HASH_FILE), `${hashFiles(files)}\n`);
    console.log(`собран плагин: ${outDir}`);
}

/** Фактически развёрнутые файлы каталога (без файла хэша). */
function deployedFiles(outDir) {
    if (!existsSync(outDir)) {
        return null;
    }
    const files = new Map();
    for (const relative of collectFiles(outDir)) {
        const normalized = relative.replaceAll('\\', '/');
        if (normalized === HASH_FILE) {
            continue;
        }
        files.set(normalized, readFileSync(join(outDir, relative)));
    }
    return files;
}

/** Проверка одного плагина; список расхождений. */
function check(plugin) {
    const expected = expectedFiles(plugin);
    const outDir = targetDir(plugin.manifest, plugin.name);
    const actual = deployedFiles(outDir);
    if (!actual) {
        return [`${plugin.name}: ресурсы не собраны (${outDir})`];
    }
    const problems = [];
    for (const [relative, data] of expected) {
        const found = actual.get(relative);
        if (!found) {
            problems.push(`${relative}: отсутствует`);
        } else if (!found.equals(data)) {
            problems.push(`${relative}: отличается от исходника`);
        }
    }
    for (const relative of actual.keys()) {
        if (!expected.has(relative)) {
            problems.push(`${relative}: лишний файл`);
        }
    }
    const hashPath = join(outDir, HASH_FILE);
    const expectedHash = `${hashFiles(expected)}\n`;
    if (!existsSync(hashPath)) {
        problems.push(`${HASH_FILE}: отсутствует`);
    } else if (readFileSync(hashPath, 'utf8') !== expectedHash) {
        problems.push(`${HASH_FILE}: устарел`);
    }
    problems.push(...checkMirrors(plugin));
    return problems;
}

/** Проверка копий плагина в каталогах сборки приложения.
 *
 * Запущенное приложение читает плагины не из `resources`, а из каталога сборки
 * (`target/debug/plugins` и `target/release/plugins`), куда Tauri копирует
 * ресурсы своим шагом сборки. Без сверки этих копий правка исходника при
 * актуальных ресурсах оставалась бы незамеченной в запущенном приложении.
 */
function checkMirrors(plugin) {
    const expected = expectedFiles(plugin);
    const problems = [];
    for (const buildDir of buildOutputDirs(plugin.manifest.level)) {
        const destination = join(buildDir, plugin.name);
        const deployed = deployedFiles(destination);
        if (!deployed) {
            problems.push(`${destination}: копия плагина отсутствует`);
            continue;
        }
        for (const [relative, data] of expected) {
            const found = deployed.get(relative);
            if (!found) {
                problems.push(`${destination}/${relative}: отсутствует`);
            } else if (!found.equals(data)) {
                problems.push(`${destination}/${relative}: устарел`);
            }
        }
    }
    return problems;
}

/**
 * Каталоги собранного приложения, куда Tauri копирует ресурсы при сборке.
 *
 * Приложение в режиме разработки читает плагины не из `resources`, а из
 * каталога сборки (`target/debug/plugins`): Tauri кладёт их туда своим шагом
 * сборки, и без пересборки Rust эта копия отстаёт от `resources`. Развёрнутые
 * артефакты дублируются туда сразу, чтобы `make plugins` обновлял и копию,
 * которую реально читает запущенное приложение.
 *
 * Каркасные плагины копируются в `base-plugins`, прикладные — в `plugins`:
 * раскладка повторяет ресурсную, иначе каркасный плагин искали бы не там.
 */
function buildOutputDirs(level) {
    const target = join(ROOT, 'src-tauri', 'target');
    const dirs = [];
    for (const profile of ['debug', 'release']) {
        const dir = join(target, profile, targetDirName(level));
        if (existsSync(join(target, profile))) {
            dirs.push(dir);
        }
    }
    return dirs;
}

/** Имя каталога раскладки по уровню плагина. */
function targetDirName(level) {
    return level === 'framework' ? 'base-plugins' : PLUGINS_DIR_NAME;
}

/** Каталоги, где лежат развёрнутые плагины: ресурсы и копии в сборке.
 *
 * У каждого каталога указан ожидаемый уровень плагинов: каркасные живут в
 * `base-plugins`, прикладные — в `plugins`.
 */
function deploymentDirs() {
    const dirs = [
        { path: PLUGINS_DIR, level: 'application' },
        { path: BASE_PLUGINS_DIR, level: 'framework' },
    ];
    for (const level of ['framework', 'application']) {
        for (const path of buildOutputDirs(level)) {
            dirs.push({ path, level });
        }
    }
    return dirs;
}

/** Удаление развёрнутых плагинов, которых больше нет в исходниках.
 *
 * Без этого удалённый плагин остаётся в ресурсах и в каталоге сборки, откуда
 * приложение его читает: правка исходников выглядит как «ничего не изменилось».
 * Каталог считается плагином, если в нём есть манифест.
 */
function removeStale(plugins) {
    const levels = new Map(plugins.map((plugin) => [plugin.name, plugin.manifest.level]));
    for (const { path: dir, level } of deploymentDirs()) {
        if (!existsSync(dir)) {
            continue;
        }
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            if (!entry.isDirectory()) {
                continue;
            }
            const location = join(dir, entry.name);
            if (!existsSync(join(location, 'plugin-manifest.json'))) {
                continue;
            }
            // Плагин не на своём уровне — тоже остаток: каркасный в `plugins`
            // или прикладной в `base-plugins` загружался бы не оттуда.
            if (levels.get(entry.name) === level) {
                continue;
            }
            rmSync(location, { recursive: true, force: true });
            console.log(`удалён устаревший плагин: ${location}`);
        }
    }
}

/** Проверка отсутствия плагинов, которых больше нет в исходниках.
 *
 * Каталог с манифестом вне списка плагинов — остаток удалённого плагина:
 * приложение продолжит его загружать, поэтому это ошибка, а не мелочь. Плагин
 * не на своём месте (каркасный в `plugins` или прикладной в `base-plugins`) —
 * тоже остаток: раскладка следует уровню из манифеста.
 */
function checkStale(plugins) {
    const levels = new Map(plugins.map((plugin) => [plugin.name, plugin.manifest.level]));
    const problems = [];
    for (const { path: dir, level } of deploymentDirs()) {
        if (!existsSync(dir)) {
            continue;
        }
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            if (!entry.isDirectory()) {
                continue;
            }
            const location = join(dir, entry.name);
            if (!existsSync(join(location, 'plugin-manifest.json'))) {
                continue;
            }
            const pluginLevel = levels.get(entry.name);
            if (pluginLevel === undefined) {
                problems.push(`${location}: плагин удалён из исходников, но остался развёрнутым`);
            } else if (pluginLevel !== level) {
                problems.push(`${location}: плагин уровня ${pluginLevel} развёрнут в чужом каталоге`);
            }
        }
    }
    return problems;
}

/** Дублирование развёрнутого плагина в каталоги сборки приложения. */
function mirrorToBuild(plugin, outDir) {
    for (const buildDir of buildOutputDirs(plugin.manifest.level)) {
        const destination = join(buildDir, plugin.name);
        rmSync(destination, { recursive: true, force: true });
        mkdirSync(destination, { recursive: true });
        for (const relative of collectFiles(outDir)) {
            if (relative === HASH_FILE) {
                continue;
            }
            const target = join(destination, relative);
            mkdirSync(dirname(target), { recursive: true });
            copyFileSync(join(outDir, relative), target);
        }
    }
}

/** Точка входа. */
function main() {
    const command = process.argv[2];
    const plugins = listPlugins();
    if (command === 'build') {
        removeStale(plugins);
        for (const plugin of plugins) {
            deploy(plugin);
            mirrorToBuild(plugin, targetDir(plugin.manifest, plugin.name));
        }
        return;
    }
    if (command === 'check') {
        const problems = [];
        for (const plugin of plugins) {
            problems.push(...check(plugin));
        }
        problems.push(...checkStale(plugins));
        if (problems.length > 0) {
            console.error('Артефакты плагинов устарели:');
            for (const problem of problems) {
                console.error(`  - ${problem}`);
            }
            console.error('Выполните `make plugins` и повторите.');
            process.exit(1);
        }
        console.log(`Артефакты плагинов актуальны (${plugins.length} шт.).`);
        return;
    }
    console.error('Использование: node scripts/plugin-artifacts.mjs build|check');
    process.exit(2);
}

main();
