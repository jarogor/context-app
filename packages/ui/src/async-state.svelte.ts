/** Состояние асинхронной операции: идёт ли она и текст последней ошибки.
    Заменяет повторяемый в областях шаблон `try/catch` вокруг вызова моста.
    @returns Объект с реактивными `loading`/`error`, записью ошибки и обёрткой `run`.
  */
export function createAsyncState() {
  /** Идёт ли операция. */
  let loading = $state(false);

  /** Сообщение о последней ошибке; пустая строка — ошибки нет. */
  let error = $state('');

  /** Сброс ошибки перед новой операцией. */
  function clearError() {
    error = '';
  }

  /** Выполнение асинхронной операции с выставлением состояний `loading`/`error`.
   * @param operation Операция, возвращающая результат.
   * @returns Результат операции либо `undefined` при ошибке.
   */
  async function run<T>(operation: () => Promise<T>): Promise<T | undefined> {
    loading = true;
    error = '';
    try {
      return await operation();
    } catch (cause) {
      error = String(cause);
      return undefined;
    } finally {
      loading = false;
    }
  }

  return {
    get loading() {
      return loading;
    },
    get error() {
      return error;
    },
    set error(value: string) {
      error = value;
    },
    clearError,
    run,
  };
}
