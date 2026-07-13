/** Serializes async work per named lock. Used to prevent automation and
 *  manual runs of the same flow from interleaving. */
export class KeyedLocks {
  private chains = new Map<string, Promise<unknown>>();

  runExclusive<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.chains.get(key) ?? Promise.resolve();
    const next = prev.catch(() => undefined).then(fn);
    // Keep only the tail promise so long sessions do not retain the full chain.
    this.chains.set(
      key,
      next.then(
        () => undefined,
        () => undefined
      )
    );
    return next;
  }
}
