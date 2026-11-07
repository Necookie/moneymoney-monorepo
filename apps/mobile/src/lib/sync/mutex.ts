/**
 * A promise-chain mutex: callers run one at a time in arrival order.
 * Not re-entrant — never call the lock from inside a locked section.
 */
export function createMutex() {
  let tail: Promise<unknown> = Promise.resolve();
  return function lock<T>(fn: () => Promise<T>): Promise<T> {
    const run = tail.then(fn, fn);
    tail = run.catch(() => undefined);
    return run;
  };
}
