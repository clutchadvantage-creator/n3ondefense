import Phaser from 'phaser';
import { SceneKeys } from '../flow/SceneKeys';
import { MOD_DEFINITIONS, MOD_BY_ID } from '../mods/definitions.ts';
import { MOD_BALANCE } from '../mods/modBalance.ts';
import type { ModSlot } from '../mods/types.ts';
import { SaveSystem } from '../systems/SaveSystem';
import { createButton } from '../utils/ui';
import { ModRuntime } from '../mods/ModRuntime.ts';
import { rollModDrop } from '../mods/ModDropService.ts';

const RARITY_COLOR = { common: '#b9c9d4', uncommon: '#73ff9d', rare: '#62b7ff', prototype: '#d286ff', legendary: '#ffc75c' } as const;

export class ModCollectionScene extends Phaser.Scene {
  private selectedId = MOD_DEFINITIONS[0].id;
  private status = '';

  constructor() { super(SceneKeys.Mods); }

  create(): void {
    const { width, height } = this.scale;
    this.add.rectangle(width / 2, height / 2, width, height, 0x050912, 1);
    this.add.text(width / 2, 48, 'MOD COLLECTION', { fontFamily: 'Orbitron, sans-serif', fontSize: '36px', color: '#68f7ff' }).setOrigin(0.5);
    this.add.text(width / 2, 82, 'Behavioral systems alter tactics. Permanent upgrades remain authoritative.', { fontFamily: 'Rajdhani, sans-serif', fontSize: '18px', color: '#a9c8dc' }).setOrigin(0.5);

    const mods = SaveSystem.getModCollection();
    const cardWidth = Math.min(210, (width - 80) / MOD_DEFINITIONS.length - 12);
    MOD_DEFINITIONS.forEach((definition, index) => {
      const x = 40 + cardWidth / 2 + index * (cardWidth + 12);
      const owned = mods.inventory[definition.id];
      const selected = definition.id === this.selectedId;
      const card = this.add.rectangle(x, 180, cardWidth, 130, 0x0b1724, owned ? 0.94 : 0.62)
        .setStrokeStyle(selected ? 3 : 1, selected ? 0xffffff : Phaser.Display.Color.HexStringToColor(RARITY_COLOR[definition.rarity]).color, selected ? 1 : 0.7)
        .setInteractive({ useHandCursor: true });
      card.on('pointerdown', () => { this.selectedId = definition.id; this.scene.restart(); });
      this.add.text(x, 142, owned ? definition.name.toUpperCase() : 'UNDISCOVERED', { fontFamily: 'Orbitron, sans-serif', fontSize: '14px', color: owned ? RARITY_COLOR[definition.rarity] : '#657386', align: 'center' }).setOrigin(0.5).setWordWrapWidth(cardWidth - 16);
      this.add.text(x, 181, definition.category.toUpperCase(), { fontFamily: 'Rajdhani, sans-serif', fontSize: '14px', color: '#8eabc0' }).setOrigin(0.5);
      this.add.text(x, 212, owned ? `RANK ${owned.rank}/3  •  DUPES ${owned.duplicates}` : 'LOCKED', { fontFamily: 'Rajdhani, sans-serif', fontSize: '15px', color: owned ? '#dffaff' : '#7b8794' }).setOrigin(0.5);
    });

    const definition = MOD_BY_ID.get(this.selectedId) ?? MOD_DEFINITIONS[0];
    const owned = mods.inventory[definition.id];
    this.add.rectangle(width / 2, 390, Math.min(1040, width - 80), 250, 0x08131f, 0.94).setStrokeStyle(2, Phaser.Display.Color.HexStringToColor(RARITY_COLOR[definition.rarity]).color, 0.8);
    this.add.text(width / 2, 292, definition.name.toUpperCase(), { fontFamily: 'Orbitron, sans-serif', fontSize: '24px', color: RARITY_COLOR[definition.rarity] }).setOrigin(0.5);
    this.add.text(width / 2, 330, definition.description, { fontFamily: 'Rajdhani, sans-serif', fontSize: '20px', color: '#d7efff', align: 'center' }).setOrigin(0.5).setWordWrapWidth(Math.min(900, width - 140));
    const rankLines = ([1, 2, 3] as const).map((rank) => `R${rank}: ${definition.rankDescriptions[rank]}`).join('\n');
    this.add.text(width / 2, 400, rankLines, { fontFamily: 'Rajdhani, sans-serif', fontSize: '18px', color: '#a9cce1', align: 'center' }).setOrigin(0.5).setWordWrapWidth(Math.min(900, width - 140));
    const nextRank = owned && owned.rank < 3 ? (owned.rank + 1) as 2 | 3 : null;
    const requirement = nextRank ? `${MOD_BALANCE.duplicateRequirements[nextRank]} duplicate(s) + ${MOD_BALANCE.rankCreditCosts[nextRank]} credits` : owned ? 'MAX RANK' : 'Discover this mod through gameplay.';
    this.add.text(width / 2, 474, requirement, { fontFamily: 'Orbitron, sans-serif', fontSize: '14px', color: '#ffd18f' }).setOrigin(0.5);

    const categorySlot = definition.category === 'utility' ? null : definition.category as ModSlot;
    if (owned) {
      if (categorySlot) createButton(this, width / 2 - 310, 548, `Equip ${categorySlot}`, () => this.apply(() => SaveSystem.equipMod(categorySlot, definition.id)), 210);
      createButton(this, width / 2 - 80, 548, 'Equip Wildcard', () => this.apply(() => SaveSystem.equipMod('wildcard', definition.id)), 210);
      createButton(this, width / 2 + 150, 548, 'Rank Up', () => this.apply(() => SaveSystem.rankUpMod(definition.id)), 190);
    }

    const loadout = mods.loadouts.find((entry) => entry.id === mods.activeLoadoutId) ?? mods.loadouts[0];
    const slots = Object.entries(loadout?.slots ?? {}).map(([slot, id]) => `${slot.toUpperCase()}: ${id ? MOD_BY_ID.get(id)?.name ?? 'INVALID' : 'EMPTY'}`).join('   |   ');
    this.add.text(width / 2, 615, slots, { fontFamily: 'Rajdhani, sans-serif', fontSize: '17px', color: '#9fffe2', align: 'center' }).setOrigin(0.5).setWordWrapWidth(width - 90);
    createButton(this, width / 2 - 180, 674, 'Unequip Category', () => { if (categorySlot) { SaveSystem.unequipMod(categorySlot); this.status = 'Slot cleared.'; this.scene.restart(); } }, 230);
    createButton(this, width / 2 + 70, 674, 'Unequip Wildcard', () => { SaveSystem.unequipMod('wildcard'); this.status = 'Wildcard cleared.'; this.scene.restart(); }, 220);
    createButton(this, width / 2 + 300, 674, 'Main Menu', () => this.scene.start(SceneKeys.MainMenu), 190);
    this.add.text(width / 2, Math.min(height - 34, 728), this.status, { fontFamily: 'Rajdhani, sans-serif', fontSize: '18px', color: this.status.startsWith('Blocked') ? '#ff9bad' : '#9dffbf' }).setOrigin(0.5);

    if (import.meta.env.DEV) this.installDevKeys();
  }

  private apply(operation: () => { ok: boolean; message?: string }): void {
    const result = operation();
    this.status = `${result.ok ? 'Success' : 'Blocked'}: ${result.message ?? ''}`;
    this.scene.restart();
  }

  private installDevKeys(): void {
    this.add.text(12, this.scale.height - 12, 'DEV MODS: G grant/duplicate • 1/2/3 set rank • X clear • T test loadout • M simulated drop • I inspect', { fontFamily: 'monospace', fontSize: '12px', color: '#ffc57d' }).setOrigin(0, 1);
    this.input.keyboard?.once('keydown-G', () => { SaveSystem.addMod(this.selectedId); this.scene.restart(); });
    for (const rank of [1, 2, 3] as const) this.input.keyboard?.once(`keydown-${rank}`, () => {
      if (!SaveSystem.getModCollection().inventory[this.selectedId]) SaveSystem.addMod(this.selectedId);
      SaveSystem.getModCollection().inventory[this.selectedId].rank = rank;
      SaveSystem.persist(); this.scene.restart();
    });
    this.input.keyboard?.once('keydown-X', () => { const mods = SaveSystem.getModCollection(); mods.inventory = {}; mods.loadouts[0].slots = { weapon: null, player: null, defense: null, bombSite: null, wildcard: null }; SaveSystem.persist(); this.scene.restart(); });
    this.input.keyboard?.once('keydown-T', () => { MOD_DEFINITIONS.forEach((mod) => SaveSystem.addMod(mod.id)); SaveSystem.equipMod('weapon', 'split-current'); SaveSystem.equipMod('player', 'emergency-capacitor'); SaveSystem.equipMod('defense', 'priority-targeting'); SaveSystem.equipMod('bombSite', 'emergency-shield'); SaveSystem.equipMod('wildcard', 'magnetic-payload'); this.scene.restart(); });
    this.input.keyboard?.once('keydown-M', () => { const drop = rollModDrop({ source: 'milestone', round: 10, seed: Date.now(), sequence: 0, protocol: 'normal', guaranteed: true }); if (drop) SaveSystem.addMod(drop.id); this.scene.restart(); });
    this.input.keyboard?.once('keydown-I', () => { console.info('[MOD RUNTIME]', new ModRuntime(SaveSystem.getModCollection()).snapshot(), SaveSystem.getModCollection()); });
  }
}
