import Phaser from 'phaser';
import { SceneKeys } from '../flow/SceneKeys';
import { MOD_DEFINITIONS, MOD_BY_ID } from '../mods/definitions.ts';
import { MOD_BALANCE } from '../mods/modBalance.ts';
import { createModCardView } from '../mods/ModCardView.ts';
import type { ModCardInstance, ModCategory, ModSlot } from '../mods/types.ts';
import { SaveSystem } from '../systems/SaveSystem';
import { createButton, disableButton } from '../utils/ui';
import { ModRuntime } from '../mods/ModRuntime.ts';
import { rollModDrop } from '../mods/ModDropService.ts';
import { MOD_INFUSIONS } from '../mods/infusions.ts';

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
  private infusionModal: Phaser.GameObjects.Container | null = null;

  constructor() { super(SceneKeys.Mods); }

  create(): void {
    const { width, height } = this.scale;
    const mods = SaveSystem.getModCollection();
    const category = CATEGORIES[this.categoryIndex];
    const sort = SORTS[this.sortIndex];
    const cards = this.sortedCards(mods.cards.filter((card) => category === 'all' || MOD_BY_ID.get(card.modId)?.category === category), sort);
    const activeLoadout = mods.loadouts.find((loadout) => loadout.id === mods.activeLoadoutId) ?? mods.loadouts[0];
    const equippedCardIds = new Set(Object.values(activeLoadout?.cardSlots ?? {}).filter((cardId): cardId is string => typeof cardId === 'string'));
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
      const view = createModCardView(this, x, y, card, card.upgradeLevel, { width: cardWidth, height: cardHeight, selected: card.instanceId === this.selectedCardId, compact: true, equipped: equippedCardIds.has(card.instanceId) });
      view.on('pointerdown', () => { this.selectedCardId = card.instanceId; this.scene.restart(); });
    });
    if (!cards.length) this.add.text((gridLeft + gridRight) / 2, height / 2, 'NO COLLECTED CARDS IN THIS GROUP', { fontFamily: 'Orbitron, sans-serif', fontSize: '18px', color: '#607a8c' }).setOrigin(0.5);
    createButton(this, gridLeft + 70, height - 36, '◀', () => { this.page = Math.max(0, this.page - 1); this.scene.restart(); }, 90);
    this.add.text((gridLeft + gridRight) / 2, height - 36, `PAGE ${this.page + 1} / ${maxPage + 1}`, { fontFamily: 'Rajdhani, sans-serif', fontSize: '17px', color: '#a8c8d9' }).setOrigin(0.5);
    createButton(this, gridRight - 70, height - 36, '▶', () => { this.page = Math.min(maxPage, this.page + 1); this.scene.restart(); }, 90);

    const selected = mods.cards.find((card) => card.instanceId === this.selectedCardId);
    this.createDetails(width - detailWidth / 2 - 20, 145, detailWidth, height - 180, selected, selected ? equippedCardIds.has(selected.instanceId) : false);
    if (import.meta.env.DEV) this.installDevKeys();
  }

  private createDetails(x: number, y: number, width: number, height: number, card?: ModCardInstance, equipped = false): void {
    this.add.rectangle(x, y + height / 2, width, height, 0x08131f, 0.96).setStrokeStyle(2, 0x50dfff, 0.65);
    if (!card) {
      this.add.text(x, y + 80, 'SELECT A COLLECTED CARD', { fontFamily: 'Orbitron, sans-serif', fontSize: '16px', color: '#7895a8' }).setOrigin(0.5);
      return;
    }
    const definition = MOD_BY_ID.get(card.modId)!;
    const owned = SaveSystem.getModCollection().inventory[card.modId];
    createModCardView(this, x, y + 120, card, card.upgradeLevel, { width: 145, height: 205, interactive: false, equipped });
    const corruptedText = definition.variant === 'corrupted' ? `\n+ ${definition.positiveEffect}\n− ${definition.negativeEffect}` : '';
    this.add.text(x, y + 246, `${definition.category.toUpperCase()} • ${definition.rarity.toUpperCase()}\n${definition.description}${corruptedText}\n\nUPGRADES ${card.upgradeLevel}/3 • ${owned.duplicates} DUPLICATES`, {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '15px', color: '#d7efff', align: 'center'
    }).setOrigin(0.5, 0).setWordWrapWidth(width - 28);
    const categorySlot = definition.category === 'utility' ? null : definition.category as ModSlot;
    const buttonY = y + height - 210;
    if (categorySlot) createButton(this, x, buttonY, `Equip ${categorySlot}`, () => this.apply(() => SaveSystem.equipMod(categorySlot, definition.id, card.instanceId)), width - 40);
    createButton(this, x, buttonY + 44, 'Equip Wildcard', () => this.apply(() => SaveSystem.equipMod('wildcard', definition.id, card.instanceId)), width - 40);
    const nextUpgrade = card.upgradeLevel < 3 ? (card.upgradeLevel + 1) as 1 | 2 | 3 : null;
    const upgradeButton = createButton(this, x, buttonY + 88, nextUpgrade ? `Upgrade Card — ${MOD_BALANCE.rankCreditCosts[nextUpgrade].toLocaleString()} Credits` : 'Upgrade Card — MAX LEVEL', () => {
      if (nextUpgrade) this.apply(() => SaveSystem.rankUpMod(definition.id, card.instanceId));
    }, width - 40);
    if (!nextUpgrade) disableButton(upgradeButton);
    const sell = MOD_BALANCE.duplicateCreditValueByRarity[definition.rarity];
    const chips = MOD_BALANCE.duplicatePlasmaValueByRarity[definition.rarity];
    createButton(this, x - width * 0.31, buttonY + 132, `Sell +${sell}C`, () => this.apply(() => SaveSystem.sellDuplicateMod(card.instanceId)), width * 0.29);
    createButton(this, x, buttonY + 132, `Recycle +${chips}◆`, () => this.apply(() => SaveSystem.recycleDuplicateMod(card.instanceId)), width * 0.31);
    createButton(this, x + width * 0.31, buttonY + 132, 'Delete', () => this.apply(() => SaveSystem.deleteModCard(card.instanceId)), width * 0.25);
    createButton(this, x, buttonY + 176, card.infusionId ? 'Change Infusion' : 'Infuse Card', () => this.showInfusionModal(card), width - 40);
    const statusText = this.add.text(x, y + height - 16, this.status, { fontFamily: 'Rajdhani, sans-serif', fontSize: '14px', color: this.status.startsWith('Blocked') ? '#ff9bad' : '#9dffbf', align: 'center' }).setOrigin(0.5, 1).setWordWrapWidth(width - 24);
    if (this.status) this.time.delayedCall(2200, () => { this.status = ''; if (statusText.active) statusText.setText(''); });
  }

  private showInfusionModal(card: ModCardInstance): void {
    this.hideInfusionModal();
    const { width, height } = this.scale;
    const root = this.add.container(0, 0).setDepth(6000);
    const blocker = this.add.rectangle(width / 2, height / 2, width, height, 0x02050b, 0.88).setInteractive();
    const panelWidth = Math.min(760, width - 50);
    const panelHeight = Math.min(590, height - 50);
    root.add([blocker, this.add.rectangle(width / 2, height / 2, panelWidth, panelHeight, 0x091522, 0.99).setStrokeStyle(3, 0x55e9ff, 0.95)]);
    root.add(this.add.text(width / 2, height / 2 - panelHeight / 2 + 38, 'SELECT COSMETIC INFUSION', { fontFamily: 'Orbitron, sans-serif', fontSize: '25px', color: '#69f5ff' }).setOrigin(0.5));
    root.add(this.add.text(width / 2, height / 2 - panelHeight / 2 + 70, `Available Plasma Chips: ${SaveSystem.getModCollection().plasmaChips}`, { fontFamily: 'Rajdhani, sans-serif', fontSize: '18px', color: '#a7ffe8' }).setOrigin(0.5));
    root.add(this.add.text(width / 2, height / 2 - panelHeight / 2 + 98, 'Infusions are visual effects only. They never alter combat, health, energy, abilities, or difficulty.', { fontFamily: 'Rajdhani, sans-serif', fontSize: '15px', color: '#a6bed0', align: 'center' }).setOrigin(0.5).setWordWrapWidth(panelWidth - 50));

    MOD_INFUSIONS.forEach((infusion, index) => {
      const rowY = height / 2 - panelHeight / 2 + 160 + index * 142;
      const installed = card.infusionId === infusion.id;
      const affordable = SaveSystem.getModCollection().plasmaChips >= infusion.plasmaCost;
      root.add(this.add.rectangle(width / 2, rowY, panelWidth - 54, 118, installed ? 0x103329 : 0x0c1a29, 0.95).setStrokeStyle(installed ? 3 : 1, installed ? 0x62ffae : 0x4bbfdb, installed ? 1 : 0.65));
      root.add(this.add.text(width / 2 - panelWidth / 2 + 58, rowY, infusion.icon, { fontFamily: 'Orbitron, sans-serif', fontSize: '36px', color: '#8ff7ff' }).setOrigin(0.5));
      root.add(this.add.text(width / 2 - panelWidth / 2 + 96, rowY - 32, infusion.name.toUpperCase(), { fontFamily: 'Orbitron, sans-serif', fontSize: '16px', color: installed ? '#7dffb4' : '#e5fbff' }).setOrigin(0, 0.5));
      root.add(this.add.text(width / 2 - panelWidth / 2 + 96, rowY - 2, infusion.description, { fontFamily: 'Rajdhani, sans-serif', fontSize: '15px', color: '#abc9da' }).setOrigin(0, 0.5).setWordWrapWidth(panelWidth - 355));
      root.add(this.add.text(width / 2 - panelWidth / 2 + 96, rowY + 36, installed ? 'INSTALLED' : `${infusion.plasmaCost} PLASMA CHIPS`, { fontFamily: 'Rajdhani, sans-serif', fontSize: '14px', color: installed ? '#70ffad' : affordable ? '#ffd98a' : '#ff91a4' }).setOrigin(0, 0.5));
      const install = createButton(this, width / 2 + panelWidth / 2 - 130, rowY, installed ? 'Installed' : affordable ? 'Install' : 'Not Enough Chips', () => {
        if (!installed) this.apply(() => SaveSystem.infuseModCard(card.instanceId, infusion.id));
      }, 180);
      if (installed || !affordable) disableButton(install);
      root.add(install);
    });

    root.add(createButton(this, width / 2, height / 2 + panelHeight / 2 - 38, 'Close', () => this.hideInfusionModal(), 200));
    this.input.keyboard?.once('keydown-ESC', () => this.hideInfusionModal());
    this.infusionModal = root;
  }

  private hideInfusionModal(): void {
    this.infusionModal?.destroy(true);
    this.infusionModal = null;
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
