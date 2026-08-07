import Phaser from 'phaser';
import { SceneKeys } from '../flow/SceneKeys';
import { MOD_DEFINITIONS, MOD_BY_ID } from '../mods/definitions.ts';
import { MOD_BALANCE } from '../mods/modBalance.ts';
import { createModCardView } from '../mods/ModCardView.ts';
import type { ModCardInstance, ModCategory, ModInfusionId, ModSlot } from '../mods/types.ts';
import { SaveSystem } from '../systems/SaveSystem';
import { createButton } from '../utils/ui';
import { ModRuntime } from '../mods/ModRuntime.ts';
import { rollModDrop } from '../mods/ModDropService.ts';

type SortMode = 'acquired' | 'type' | 'rank' | 'rarity';
const CATEGORIES: Array<'all' | ModCategory> = ['all', 'weapon', 'player', 'defense', 'bombSite', 'utility'];
const SORTS: SortMode[] = ['acquired', 'type', 'rank', 'rarity'];
const RARITY_ORDER = { common: 0, uncommon: 1, rare: 2, prototype: 3, legendary: 4 } as const;

export class ModCollectionScene extends Phaser.Scene {
  private selectedCardId = '';
  private categoryIndex = 0;
  private sortIndex = 0;
  private page = 0;
  private status = '';

  constructor() { super(SceneKeys.Mods); }

  create(): void {
    const { width, height } = this.scale;
    const mods = SaveSystem.getModCollection();
    const category = CATEGORIES[this.categoryIndex];
    const sort = SORTS[this.sortIndex];
    const cards = this.sortedCards(mods.cards.filter((card) => category === 'all' || MOD_BY_ID.get(card.modId)?.category === category), sort);
    if (!this.selectedCardId || !mods.cards.some((card) => card.instanceId === this.selectedCardId)) this.selectedCardId = cards[0]?.instanceId ?? mods.cards[0]?.instanceId ?? '';

    this.add.rectangle(width / 2, height / 2, width, height, 0x040811, 1);
    this.add.grid(width / 2, height / 2, width, height, 48, 48, 0x050b14, 0.2, 0x153447, 0.12);
    this.add.text(width / 2, 34, 'MOD CARD COLLECTION', { fontFamily: 'Orbitron, sans-serif', fontSize: '30px', color: '#68f7ff' }).setOrigin(0.5);
    this.add.text(width / 2, 64, `${mods.cards.length} CARDS  •  ${mods.plasmaChips} PLASMA CHIPS  •  ${SaveSystem.get().credits.toLocaleString()} CREDITS`, { fontFamily: 'Rajdhani, sans-serif', fontSize: '18px', color: '#a9ffe9' }).setOrigin(0.5);

    createButton(this, 150, 104, `Group: ${category === 'all' ? 'ALL' : category.toUpperCase()}`, () => { this.categoryIndex = (this.categoryIndex + 1) % CATEGORIES.length; this.page = 0; this.scene.restart(); }, 250);
    createButton(this, 430, 104, `Sort: ${sort.toUpperCase()}`, () => { this.sortIndex = (this.sortIndex + 1) % SORTS.length; this.page = 0; this.scene.restart(); }, 250);
    createButton(this, width - 140, 104, 'Main Menu', () => this.scene.start(SceneKeys.MainMenu), 220);

    const detailWidth = Math.min(360, width * 0.3);
    const gridLeft = 36;
    const gridRight = width - detailWidth - 42;
    const cardWidth = Phaser.Math.Clamp((gridRight - gridLeft - 48) / 4, 112, 148);
    const cardHeight = cardWidth * 1.4;
    const columns = Math.max(2, Math.floor((gridRight - gridLeft) / (cardWidth + 14)));
    const rows = Math.max(1, Math.floor((height - 230) / (cardHeight + 14)));
    const perPage = columns * rows;
    const maxPage = Math.max(0, Math.ceil(cards.length / perPage) - 1);
    this.page = Math.min(this.page, maxPage);
    cards.slice(this.page * perPage, (this.page + 1) * perPage).forEach((card, index) => {
      const x = gridLeft + cardWidth / 2 + (index % columns) * (cardWidth + 14);
      const y = 154 + cardHeight / 2 + Math.floor(index / columns) * (cardHeight + 14);
      const view = createModCardView(this, x, y, card, card.upgradeLevel, { width: cardWidth, height: cardHeight, selected: card.instanceId === this.selectedCardId, compact: true });
      view.on('pointerdown', () => { this.selectedCardId = card.instanceId; this.scene.restart(); });
    });
    if (!cards.length) this.add.text((gridLeft + gridRight) / 2, height / 2, 'NO COLLECTED CARDS IN THIS GROUP', { fontFamily: 'Orbitron, sans-serif', fontSize: '18px', color: '#607a8c' }).setOrigin(0.5);
    createButton(this, gridLeft + 70, height - 36, '◀', () => { this.page = Math.max(0, this.page - 1); this.scene.restart(); }, 90);
    this.add.text((gridLeft + gridRight) / 2, height - 36, `PAGE ${this.page + 1} / ${maxPage + 1}`, { fontFamily: 'Rajdhani, sans-serif', fontSize: '17px', color: '#a8c8d9' }).setOrigin(0.5);
    createButton(this, gridRight - 70, height - 36, '▶', () => { this.page = Math.min(maxPage, this.page + 1); this.scene.restart(); }, 90);

    const selected = mods.cards.find((card) => card.instanceId === this.selectedCardId);
    this.createDetails(width - detailWidth / 2 - 20, 145, detailWidth, height - 180, selected);
    if (import.meta.env.DEV) this.installDevKeys();
  }

  private createDetails(x: number, y: number, width: number, height: number, card?: ModCardInstance): void {
    this.add.rectangle(x, y + height / 2, width, height, 0x08131f, 0.96).setStrokeStyle(2, 0x50dfff, 0.65);
    if (!card) {
      this.add.text(x, y + 80, 'SELECT A COLLECTED CARD', { fontFamily: 'Orbitron, sans-serif', fontSize: '16px', color: '#7895a8' }).setOrigin(0.5);
      return;
    }
    const definition = MOD_BY_ID.get(card.modId)!;
    const owned = SaveSystem.getModCollection().inventory[card.modId];
    createModCardView(this, x, y + 120, card, card.upgradeLevel, { width: 145, height: 205, interactive: false });
    const corruptedText = definition.variant === 'corrupted' ? `\n+ ${definition.positiveEffect}\n− ${definition.negativeEffect}` : '';
    this.add.text(x, y + 246, `${definition.category.toUpperCase()} • ${definition.rarity.toUpperCase()}\n${definition.description}${corruptedText}\n\nUPGRADES ${card.upgradeLevel}/3 • ${owned.duplicates} DUPLICATES`, {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '15px', color: '#d7efff', align: 'center'
    }).setOrigin(0.5, 0).setWordWrapWidth(width - 28);
    const sameCards = SaveSystem.getModCollection().cards.filter((entry) => entry.modId === card.modId);
    const duplicate = sameCards.length > 1;
    const categorySlot = definition.category === 'utility' ? null : definition.category as ModSlot;
    const buttonY = y + height - 210;
    if (categorySlot) createButton(this, x, buttonY, `Equip ${categorySlot}`, () => this.apply(() => SaveSystem.equipMod(categorySlot, definition.id, card.instanceId)), width - 40);
    createButton(this, x, buttonY + 44, 'Equip Wildcard', () => this.apply(() => SaveSystem.equipMod('wildcard', definition.id, card.instanceId)), width - 40);
    createButton(this, x, buttonY + 88, 'Upgrade Card', () => this.apply(() => SaveSystem.rankUpMod(definition.id, card.instanceId)), width - 40);
    if (duplicate) {
      const sell = MOD_BALANCE.duplicateCreditValueByRarity[definition.rarity];
      const chips = MOD_BALANCE.duplicatePlasmaValueByRarity[definition.rarity];
      createButton(this, x - width * 0.24, buttonY + 132, `Sell +${sell}C`, () => this.apply(() => SaveSystem.sellDuplicateMod(card.instanceId)), width * 0.43);
      createButton(this, x + width * 0.24, buttonY + 132, `Recycle +${chips}◆`, () => this.apply(() => SaveSystem.recycleDuplicateMod(card.instanceId)), width * 0.43);
    }
    const infusion: ModInfusionId = card.infusionId === 'enemy-growth' ? 'detonation-fireworks' : 'enemy-growth';
    createButton(this, x, buttonY + 176, `Infuse: ${infusion === 'enemy-growth' ? 'Big Enemies' : 'Fireworks'} (${MOD_BALANCE.infusionPlasmaCost[infusion]}◆)`, () => this.apply(() => SaveSystem.infuseModCard(card.instanceId, infusion)), width - 40);
    const statusText = this.add.text(x, y + height - 16, this.status, { fontFamily: 'Rajdhani, sans-serif', fontSize: '14px', color: this.status.startsWith('Blocked') ? '#ff9bad' : '#9dffbf', align: 'center' }).setOrigin(0.5, 1).setWordWrapWidth(width - 24);
    if (this.status) this.time.delayedCall(2200, () => { this.status = ''; if (statusText.active) statusText.setText(''); });
  }

  private sortedCards(cards: ModCardInstance[], sort: SortMode): ModCardInstance[] {
    return [...cards].sort((a, b) => {
      const ad = MOD_BY_ID.get(a.modId)!; const bd = MOD_BY_ID.get(b.modId)!;
      if (sort === 'type') return ad.category.localeCompare(bd.category) || ad.name.localeCompare(bd.name);
      if (sort === 'rank') return b.upgradeLevel - a.upgradeLevel;
      if (sort === 'rarity') return RARITY_ORDER[bd.rarity] - RARITY_ORDER[ad.rarity];
      return b.acquiredAt.localeCompare(a.acquiredAt);
    });
  }

  private apply(operation: () => { ok: boolean; message?: string }): void { const result = operation(); this.status = `${result.ok ? 'Success' : 'Blocked'}: ${result.message ?? ''}`; this.scene.restart(); }

  private installDevKeys(): void {
    this.input.keyboard?.once('keydown-G', () => { SaveSystem.addMod(MOD_DEFINITIONS.find((mod) => mod.id === (MOD_BY_ID.get(SaveSystem.getModCollection().cards.find((card) => card.instanceId === this.selectedCardId)?.modId ?? '')?.id))?.id ?? MOD_DEFINITIONS[0].id); this.scene.restart(); });
    this.input.keyboard?.once('keydown-X', () => { const mods = SaveSystem.getModCollection(); mods.inventory = {}; mods.cards = []; mods.plasmaChips = 0; mods.loadouts[0].slots = { weapon: null, player: null, defense: null, bombSite: null, wildcard: null }; mods.loadouts[0].cardSlots = { weapon: null, player: null, defense: null, bombSite: null, wildcard: null }; SaveSystem.persist(); this.scene.restart(); });
    this.input.keyboard?.once('keydown-T', () => { MOD_DEFINITIONS.forEach((mod) => { SaveSystem.addMod(mod.id); SaveSystem.addMod(mod.id); }); this.scene.restart(); });
    this.input.keyboard?.once('keydown-M', () => { const drop = rollModDrop({ source: 'milestone', round: 20, seed: Date.now(), sequence: 0, protocol: 'normal', guaranteed: true }); if (drop) SaveSystem.addMod(drop.id); this.scene.restart(); });
    this.input.keyboard?.once('keydown-I', () => console.info('[MOD RUNTIME]', new ModRuntime(SaveSystem.getModCollection()).snapshot(), SaveSystem.getModCollection()));
  }
}
