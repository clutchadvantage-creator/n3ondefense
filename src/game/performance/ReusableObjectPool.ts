export interface ObjectPoolStats {
  created: number;
  reused: number;
  active: number;
  available: number;
}

/**
 * Small lifecycle pool used by combat objects that are created often. The
 * owner supplies the reset/retire behavior so Phaser-specific state stays in
 * the system that understands it.
 */
export class ReusableObjectPool<T, TState> {
  private readonly available: T[] = [];
  private readonly active = new Set<T>();
  private readonly owned = new Set<T>();
  private created = 0;
  private reused = 0;
  private readonly createItem: (state: TState) => T;
  private readonly resetItem: (item: T, state: TState) => void;
  private readonly retireItem: (item: T) => void;

  constructor(
    createItem: (state: TState) => T,
    resetItem: (item: T, state: TState) => void,
    retireItem: (item: T) => void
  ) {
    this.createItem = createItem;
    this.resetItem = resetItem;
    this.retireItem = retireItem;
  }

  obtain(state: TState): T {
    const item = this.available.pop();
    if (item === undefined) {
      const created = this.createItem(state);
      this.created += 1;
      this.active.add(created);
      this.owned.add(created);
      return created;
    }

    this.reused += 1;
    this.resetItem(item, state);
    this.active.add(item);
    return item;
  }

  release(item: T): boolean {
    if (!this.active.delete(item)) return false;
    this.retireItem(item);
    this.available.push(item);
    return true;
  }

  releaseAll(): void {
    while (this.active.size > 0) {
      const item = this.active.values().next().value as T | undefined;
      if (item === undefined) break;
      this.release(item);
    }
  }

  owns(item: unknown): boolean {
    return this.owned.has(item as T);
  }

  destroy(destroyItem: (item: T) => void): void {
    this.releaseAll();
    for (const item of this.owned) destroyItem(item);
    this.available.length = 0;
    this.active.clear();
    this.owned.clear();
  }

  stats(): ObjectPoolStats {
    return {
      created: this.created,
      reused: this.reused,
      active: this.active.size,
      available: this.available.length
    };
  }
}
