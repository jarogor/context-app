/** Подготовка разметки области содержимого перед юнит-тестами.
 *
 * Модули берут элементы по идентификаторам при загрузке (в собранном виде их
 * отдаёт собранный шаблон `index.html`). В тестах эти узлы создаются здесь —
 * до подключения тестируемых модулей.
 */
if (!document.getElementById('viewer')) {
  const status = document.createElement('div');
  status.id = 'status';
  const viewer = document.createElement('div');
  viewer.id = 'viewer';
  const pages = document.createElement('div');
  pages.id = 'pages';
  viewer.append(pages);
  document.body.append(viewer, status);
}
