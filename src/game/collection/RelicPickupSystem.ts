import Phaser from 'phaser';
import { fragmentRelic } from './CollectionCatalog.ts';
import { relicDropChance, rollRelicFragment } from './RelicDrops.ts';
import { SaveSystem } from '../systems/SaveSystem.ts';
import { playCollectionAudio } from './CollectionAudio.ts';
import type { ModDropRequest } from '../mods/ModDropService.ts';
import type { ModDropSource } from '../mods/types.ts';

export interface FragmentPickup { id: string; root: Phaser.GameObjects.Container; sprite: Phaser.GameObjects.Container; art: Phaser.GameObjects.Image; rim: Phaser.GameObjects.Ellipse; glint: Phaser.GameObjects.Star; age: number; retry: number; boss: boolean; expiresAt: number; }
/** Six unique pieces is the absolute bound. No physics bodies, timers, filters or per-frame allocations. */
export class RelicPickupSystem {
  private readonly drops: FragmentPickup[] = [];
  private readonly reserved = new Set<string>();
  private readonly chances = new Map<ModDropSource, number>();
  private readonly particles = SaveSystem.get().settings.particles;
  constructor(private readonly scene: Phaser.Scene, private readonly request: Omit<ModDropRequest, 'source' | 'sequence'>) {}

  tryDrop(source: ModDropSource, x: number, y: number): string | null {
    if (this.drops.length >= 6) return null;
    let chance = this.chances.get(source);
    if (chance === undefined) { chance = relicDropChance({ ...this.request, source, sequence: 0 }); this.chances.set(source, chance); }
    const id = rollRelicFragment(SaveSystem.getCollection(), this.reserved, chance);
    if (id) this.spawn(id, x, y, source === 'boss');
    return id;
  }

  spawn(id: string, x: number, y: number, boss = false): boolean {
    const relic = fragmentRelic(id);
    if (!relic || this.reserved.has(id) || SaveSystem.getCollection().fragments.includes(id) || this.drops.length >= 6) return false;
    this.reserved.add(id);
    const root = this.scene.add.container(x, y).setDepth(16);
    const shadow = this.scene.add.ellipse(0, 13, 45, 17, 0x02040c, 0.7);
    const rim = this.scene.add.ellipse(0, 10, 52, 23, relic.color, 0.06).setStrokeStyle(2, relic.color, 0.8);
    const art = this.scene.add.image(0, -8, `fragment-${id}`).setDisplaySize(88, 88);
    const glint = this.scene.add.star(0, -21, 4, 1, 9, 0xebfcff).setAlpha(0);
    root.add([shadow, rim, art, glint]);
    this.drops.push({ id, root, sprite: root, art, rim, glint, age: 0, retry: 0, boss, expiresAt: Infinity });
    return true;
  }

  update(dt: number, x: number, y: number, radius: number, supported?: (x: number, y: number) => boolean, canCollect: boolean | ((pickup: FragmentPickup) => boolean) = true): void {
    const elapsed = Math.min(0.1, Math.max(0, dt));
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const drop = this.drops[i]; drop.age += elapsed; drop.retry -= elapsed;
      if (!drop.root.active || this.scene.time.now > drop.expiresAt || (supported && !supported(drop.root.x, drop.root.y))) { this.retire(i); continue; }
      drop.art.y = -8 + Math.sin(drop.age * 2.4) * 4;
      drop.art.rotation = Math.sin(drop.age * 1.6) * 0.09;
      drop.rim.alpha = 0.5 + Math.sin(drop.age * 2) * 0.24;
      const sparkle = drop.age % 4;
      drop.glint.setPosition(-16 + sparkle * 90, -23).setAlpha(this.particles && sparkle < 0.38 ? Math.sin(sparkle / 0.38 * Math.PI) : 0);
      if (!(typeof canCollect === 'function' ? canCollect(drop) : canCollect) || drop.age < 0.2 || drop.retry > 0) continue;
      const dx = x - drop.root.x, dy = y - drop.root.y;
      if (dx * dx + dy * dy <= (radius + 22) ** 2) {
        if (SaveSystem.getCollection().fragments.includes(drop.id)) { this.retire(i); continue; }
        if (SaveSystem.collectRelicFragment(drop.id)) { playCollectionAudio('pickup'); this.retire(i); }
        else drop.retry = 2;
      }
    }
  }

  get pendingBossLoot(): number { let count = 0; for (const drop of this.drops) if (drop.boss) count++; return count; }
  get floorActors(): readonly FragmentPickup[] { return this.drops; }
  private retire(index: number): void { const drop = this.drops[index]; this.reserved.delete(drop.id); drop.root.destroy(); this.drops.splice(index, 1); }
  destroy(): void { for (let i = this.drops.length - 1; i >= 0; i--) this.retire(i); this.chances.clear(); }
}
