/** Подготовка окружения модульных тестов дизайн-системы.
 *
 * jsdom не реализует Pointer Capture, который используют примитивы Bits UI
 * (в частности `Select`) в обработчиках `pointerdown`. Заглушки нужны только
 * тестам: в браузере доступна настоящая реализация.
 */
if (typeof Element !== 'undefined' && !Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}
