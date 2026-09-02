/**
 * A tiny TTL cache used in front of Open Food Facts.
 *
 * Open Food Facts is a free, donation-funded service and asks clients not to
 * hammer it; identical searches from a demo UI are common. This is deliberately
 * in-process and unbounded-by-time-only: for a single-instance test app it is
 * the right size. A real deployment would put Redis here so the cache survives
 * a restart and is shared across instances.
 */
export class TtlCache<T> {
  private readonly store = new Map<string, { value: T; expiresAt: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 500,
  ) {}

  get(key: string): T | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;

    if (hit.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }

    // Refresh insertion order so the eviction below is least-recently-used.
    this.store.delete(key);
    this.store.set(key, hit);
    return hit.value;
  }

  set(key: string, value: T): void {
    if (this.ttlMs <= 0) return;

    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next();
      if (!oldest.done) this.store.delete(oldest.value);
    }

    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}
