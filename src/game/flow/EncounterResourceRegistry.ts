export interface EncounterResourceRecord {
  owner: string;
  subsystem: string;
  type: string;
}

export interface EncounterResourceSnapshot {
  currentOwner: string | null;
  current: number;
  stale: number;
  bySubsystem: Record<string, number>;
  staleDetails: EncounterResourceRecord[];
}

interface OwnedResource extends EncounterResourceRecord {
  retire?: () => void;
}

/**
 * Ownership ledger for resources that can outlive the call stack which made
 * them (currently Arena Clock callbacks). The registry deliberately stores
 * opaque keys so Phaser-specific objects stay in ArenaScene. It is diagnostic
 * and teardown infrastructure, never a gameplay scheduler.
 */
export class EncounterResourceRegistry {
  private currentOwner: string | null = null;
  private readonly resources = new Map<object, OwnedResource>();

  begin(owner: string): void {
    this.currentOwner = owner;
  }

  track(resource: object, subsystem: string, type: string, retire?: () => void): void {
    if (!this.currentOwner) throw new Error(`Cannot register ${subsystem}/${type} without an encounter owner.`);
    this.resources.set(resource, { owner: this.currentOwner, subsystem, type, retire });
  }

  release(resource: object): void {
    this.resources.delete(resource);
  }

  retire(owner = this.currentOwner): number {
    if (!owner) return 0;
    let retired = 0;
    for (const [resource, record] of [...this.resources]) {
      if (record.owner !== owner) continue;
      try { record.retire?.(); } catch {
        // The framework may already have disposed a completed timer. Ownership
        // must still be released so one stale handle cannot retain its owner.
      }
      this.resources.delete(resource);
      retired += 1;
    }
    if (owner === this.currentOwner) this.currentOwner = null;
    return retired;
  }

  clearAfterFrameworkShutdown(): void {
    this.resources.clear();
    this.currentOwner = null;
  }

  snapshot(): EncounterResourceSnapshot {
    const bySubsystem: Record<string, number> = {};
    const staleDetails: EncounterResourceRecord[] = [];
    let current = 0;
    for (const record of this.resources.values()) {
      bySubsystem[record.subsystem] = (bySubsystem[record.subsystem] ?? 0) + 1;
      if (record.owner === this.currentOwner) current += 1;
      else staleDetails.push({ owner: record.owner, subsystem: record.subsystem, type: record.type });
    }
    return {
      currentOwner: this.currentOwner,
      current,
      stale: staleDetails.length,
      bySubsystem,
      staleDetails
    };
  }
}
