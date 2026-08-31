import Phaser from 'phaser';
import {
  calculateModDatabaseTypography,
  type ModDatabaseTypography,
  type ModLibraryRect
} from '../garage/modLibraryLayout.ts';
import { MOD_RARITY_COLORS, createModCardView } from './ModCardView.ts';
import {
  formatModDatabaseProbability,
  type ModDatabaseEntry,
  type ModDatabaseSourceChance
} from './ModDatabaseService.ts';
import type { ModCardInstance } from './types.ts';

const syntheticCard = (entry: ModDatabaseEntry): ModCardInstance => ({
  instanceId: `database-${entry.definition.id}`,
  modId: entry.definition.id,
  acquiredAt: new Date(0).toISOString(),
  upgradeLevel: 0
});

const CATEGORY_LABELS = {
  weapon: 'WEAPON',
  player: 'PLAYER',
  defense: 'DEFENSE',
  bombSite: 'BOMBSITE',
  utility: 'UTILITY'
} as const;

const STATUS_LABELS = {
  owned: 'OWNED',
  discovered: 'DISCOVERED // NOT OWNED',
  undiscovered: 'UNDISCOVERED // DATABASE VISIBLE'
} as const;

const STATUS_COLORS = {
  owned: '#76ffb0',
  discovered: '#ffd676',
  undiscovered: '#ff91ac'
} as const;

const formatCurrencyPair = (credits: number, coreTokens: number): string =>
  `${credits.toLocaleString()} C${coreTokens > 0 ? `  +  ${coreTokens.toLocaleString()} CORE` : ''}`;

const formatSourceLine = (source: ModDatabaseSourceChance): string =>
  `${source.label}\nOPPORTUNITY ${formatModDatabaseProbability(source.opportunityChance)}  //  RARITY ${formatModDatabaseProbability(source.rarityPoolChance)}\nMOD POOL ${formatModDatabaseProbability(source.definitionPoolChance)}  //  CARD ${formatModDatabaseProbability(source.effectiveChance)}`;

export class ModDatabaseViewer {
  private readonly detailContent: Phaser.GameObjects.Container;
  private readonly maskGraphics: Phaser.GameObjects.Graphics;
  private readonly scrollThumb: Phaser.GameObjects.Rectangle;
  private readonly viewport: ModLibraryRect;
  private readonly contentHeight: number;
  private scroll = 0;
  private readonly maxScroll: number;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly parent: Phaser.GameObjects.Container,
    rect: ModLibraryRect,
    private readonly entry: ModDatabaseEntry
  ) {
    const rarityColor = MOD_RARITY_COLORS[entry.definition.rarity];
    const shortViewport = rect.height < 720;
    const typography = calculateModDatabaseTypography(rect.width);
    const headerHeight = shortViewport ? 54 : 58;
    const padding = shortViewport ? 12 : 16;
    const frame = scene.add.rectangle(rect.x, rect.y, rect.width, rect.height, 0x06131e, 0.975)
      .setOrigin(0, 0).setStrokeStyle(2, rarityColor, 0.78);
    const header = scene.add.rectangle(rect.x + 2, rect.y + 2, rect.width - 4, headerHeight, rarityColor, 0.075)
      .setOrigin(0, 0).setStrokeStyle(1, rarityColor, 0.34);
    const headerText = scene.add.text(rect.x + padding, rect.y + 9, 'SELECTED MOD // TECHNICAL DOSSIER', {
      fontFamily: 'Orbitron, sans-serif', fontSize: `${typography.dossierTitle}px`, color: '#8ef7ff', fontStyle: 'bold', letterSpacing: 1
    }).setOrigin(0, 0);
    const statusText = scene.add.text(rect.x + padding, rect.y + headerHeight - 8, STATUS_LABELS[entry.status], {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${typography.status}px`, color: STATUS_COLORS[entry.status], fontStyle: 'bold'
    }).setOrigin(0, 1);
    parent.add([frame, header, headerText, statusText]);

    const cardWidth = Phaser.Math.Clamp(
      Math.min(rect.width * 0.4, rect.height * 0.39 / 1.4),
      shortViewport ? 164 : 188,
      250
    );
    const cardHeight = cardWidth * 1.4;
    const identityTop = rect.y + headerHeight + padding;
    const cardX = rect.x + padding + cardWidth / 2;
    const cardY = identityTop + cardHeight / 2;
    const card = entry.card ?? syntheticCard(entry);
    const cardView = createModCardView(scene, cardX, cardY, card, card.upgradeLevel, {
      width: cardWidth,
      height: cardHeight,
      interactive: false,
      compact: false,
      presentationState: 'idle',
      rankLabel: entry.owned ? undefined : 'R—/3'
    }).setAlpha(entry.status === 'undiscovered' ? 0.72 : 1);
    parent.add(cardView);

    const identityX = cardX + cardWidth / 2 + padding;
    const identityWidth = rect.x + rect.width - padding - identityX;
    let identityY = identityTop + 3;
    identityY = this.addFixedLabel(identityX, identityY, identityWidth, 'MOD IDENTITY', '#ff7bd5', typography.identityLabel);
    identityY = this.addFixedValue(identityX, identityY, identityWidth, entry.definition.name.toUpperCase(), '#f4fdff', typography.identityName);
    identityY = this.addFixedRow(identityX, identityY + 3, identityWidth, 'RARITY', entry.definition.rarity.toUpperCase(), rarityColor, typography);
    identityY = this.addFixedRow(
      identityX,
      identityY,
      identityWidth,
      'SLOT',
      entry.definition.rarity === 'supreme' ? 'UNIVERSAL // ANY SLOT' : CATEGORY_LABELS[entry.definition.category],
      0x62f4ff,
      typography
    );
    identityY = this.addFixedRow(identityX, identityY, identityWidth, 'RANK', entry.currentRank === null ? 'NOT OWNED' : `${entry.currentRank} / ${entry.definition.maxRank}`, 0x76ffb0, typography);
    const classification = entry.definition.variant === 'corrupted'
      ? 'CORRUPTED'
      : entry.definition.rarity === 'supreme'
        ? 'SUPREME'
        : entry.definition.rarity === 'legendary' ? 'LEGENDARY' : 'STANDARD';
    identityY = this.addFixedRow(identityX, identityY, identityWidth, 'CLASS', classification, rarityColor, typography);
    identityY = this.addFixedRow(
      identityX,
      identityY,
      identityWidth,
      'STAT STATE',
      entry.calibrationActive ? 'STAR // RECALIBRATED' : 'FEATHER // NATIVE',
      entry.calibrationActive ? 0xff75dc : 0x77f6ff,
      typography
    );
    identityY = this.addFixedValue(identityX, identityY + 6, identityWidth, entry.definition.tags.map((tag) => tag.toUpperCase()).join(' // '), '#9ac2ce', typography.secondary);

    const detailTop = Math.max(cardY + cardHeight / 2, identityY) + (shortViewport ? 14 : 18);
    this.viewport = {
      x: rect.x + padding,
      y: detailTop,
      width: rect.width - padding * 2 - 9,
      height: Math.max(80, rect.y + rect.height - padding - detailTop)
    };
    const viewportBack = scene.add.rectangle(this.viewport.x, this.viewport.y, this.viewport.width, this.viewport.height, 0x020911, 0.72)
      .setOrigin(0, 0).setStrokeStyle(1, 0x4deafa, 0.16);
    parent.add(viewportBack);

    this.detailContent = scene.add.container(this.viewport.x, this.viewport.y);
    parent.add(this.detailContent);
    this.contentHeight = this.buildDetails(this.viewport.width - 13, typography);
    this.maxScroll = Math.max(0, this.contentHeight - this.viewport.height);

    this.maskGraphics = scene.make.graphics({ x: 0, y: 0 }, false);
    this.maskGraphics.fillStyle(0xffffff).fillRect(this.viewport.x, this.viewport.y, this.viewport.width, this.viewport.height);
    this.detailContent.setMask(this.maskGraphics.createGeometryMask());

    const trackX = this.viewport.x + this.viewport.width + 4;
    const track = scene.add.rectangle(trackX, this.viewport.y, 3, this.viewport.height, 0x214252, 0.72).setOrigin(0.5, 0);
    const thumbHeight = this.maxScroll > 0
      ? Math.max(24, this.viewport.height * this.viewport.height / this.contentHeight)
      : this.viewport.height;
    this.scrollThumb = scene.add.rectangle(trackX, this.viewport.y, 5, thumbHeight, rarityColor, this.maxScroll > 0 ? 0.9 : 0.25).setOrigin(0.5, 0);
    parent.add([track, this.scrollThumb]);
    if (this.maxScroll > 0) {
      this.scrollThumb.setInteractive({ useHandCursor: true });
      scene.input.setDraggable(this.scrollThumb);
      this.scrollThumb.on('drag', (_pointer: Phaser.Input.Pointer, _dragX: number, dragY: number) => {
        const travel = Math.max(1, this.viewport.height - this.scrollThumb.height);
        const clampedY = Phaser.Math.Clamp(dragY, this.viewport.y, this.viewport.y + travel);
        this.setScroll((clampedY - this.viewport.y) / travel * this.maxScroll);
      });
    }
  }

  containsDetailPoint(x: number, y: number): boolean {
    return x >= this.viewport.x && x <= this.viewport.x + this.viewport.width + 10
      && y >= this.viewport.y && y <= this.viewport.y + this.viewport.height;
  }

  scrollBy(delta: number): void {
    if (this.maxScroll <= 0) return;
    this.setScroll(this.scroll + delta);
  }

  private setScroll(value: number): void {
    this.scroll = Phaser.Math.Clamp(value, 0, this.maxScroll);
    this.detailContent.y = this.viewport.y - this.scroll;
    const travel = this.viewport.height - this.scrollThumb.height;
    this.scrollThumb.y = this.viewport.y + travel * (this.scroll / this.maxScroll);
  }

  destroy(): void {
    this.detailContent.clearMask(true);
    this.maskGraphics.destroy();
  }

  private addFixedLabel(x: number, y: number, width: number, value: string, color: string, size: number): number {
    const text = this.scene.add.text(x, y, value, {
      fontFamily: 'Orbitron, sans-serif', fontSize: `${size}px`, color, fontStyle: 'bold', letterSpacing: 1,
      wordWrap: { width, useAdvancedWrap: true }
    }).setOrigin(0, 0);
    this.parent.add(text);
    return y + text.height + 5;
  }

  private addFixedValue(x: number, y: number, width: number, value: string, color: string, size: number): number {
    const text = this.scene.add.text(x, y, value, {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${size}px`, color, fontStyle: 'bold', lineSpacing: 2,
      wordWrap: { width, useAdvancedWrap: true }
    }).setOrigin(0, 0);
    this.parent.add(text);
    return y + text.height + 5;
  }

  private addFixedRow(x: number, y: number, width: number, label: string, value: string, color: number, typography: ModDatabaseTypography): number {
    const rowHeight = typography.identityRowValue + 14;
    const back = this.scene.add.rectangle(x, y, width, rowHeight, 0x0a1b26, 0.82).setOrigin(0, 0);
    const key = this.scene.add.text(x + 6, y + rowHeight / 2, label, {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${typography.identityRowLabel}px`, color: '#8eb4c0', fontStyle: 'bold'
    }).setOrigin(0, 0.5);
    const displayColor = Phaser.Display.Color.IntegerToColor(color).rgba;
    const output = this.scene.add.text(x + width - 6, y + rowHeight / 2, value, {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${typography.identityRowValue}px`, color: displayColor, fontStyle: 'bold'
    }).setOrigin(1, 0.5);
    this.parent.add([back, key, output]);
    return y + rowHeight + 3;
  }

  private buildDetails(width: number, typography: ModDatabaseTypography): number {
    let y = 9;
    const bodySize = typography.body;
    const smallSize = typography.secondary;
    const addHeader = (label: string, color = '#63f1ff'): void => {
      if (y > 10) y += 18;
      const line = this.scene.add.rectangle(0, y + typography.sectionHeading * 0.62, width, 1, Phaser.Display.Color.HexStringToColor(color).color, 0.42).setOrigin(0, 0.5);
      const text = this.scene.add.text(7, y, label, {
        fontFamily: 'Orbitron, sans-serif', fontSize: `${typography.sectionHeading}px`, color, fontStyle: 'bold', backgroundColor: '#020911'
      }).setOrigin(0, 0).setPadding(4, 0, 8, 0);
      this.detailContent.add([line, text]);
      y += text.height + 11;
    };
    const addParagraph = (value: string, color = '#c8e5ed', size = bodySize): void => {
      const text = this.scene.add.text(5, y, value, {
        fontFamily: 'Rajdhani, sans-serif', fontSize: `${size}px`, color, lineSpacing: typography.lineSpacing,
        wordWrap: { width: width - 10, useAdvancedWrap: true }
      }).setOrigin(0, 0);
      this.detailContent.add(text);
      y += text.height + 10;
    };
    const addDataRow = (label: string, value: string, color = '#e6f8fc'): void => {
      const output = this.scene.add.text(width - 12, y + 7, value, {
        fontFamily: 'Rajdhani, sans-serif', fontSize: `${typography.dataValue}px`, color, fontStyle: 'bold', align: 'right',
        lineSpacing: typography.lineSpacing,
        wordWrap: { width: width * 0.62, useAdvancedWrap: true }
      }).setOrigin(1, 0);
      const rowHeight = Math.max(typography.dataValue + 20, output.height + 14);
      const back = this.scene.add.rectangle(3, y, width - 6, rowHeight, 0x0a1924, 0.8).setOrigin(0, 0)
        .setStrokeStyle(1, 0x2e7684, 0.18);
      const key = this.scene.add.text(10, y + rowHeight / 2, label, {
        fontFamily: 'Rajdhani, sans-serif', fontSize: `${typography.dataLabel}px`, color: '#8eb9c5', fontStyle: 'bold',
        wordWrap: { width: width * 0.32, useAdvancedWrap: true }
      }).setOrigin(0, 0.5);
      this.detailContent.add([back, key, output]);
      y += rowHeight + 6;
    };

    addHeader('EFFECT OVERVIEW', '#64f2ff');
    addParagraph(this.entry.definition.description);
    if (this.entry.definition.rarity === 'supreme') {
      addDataRow('MODE LOCK', 'SUPREME OVERDRIVE ONLY', '#ff9ee5');
      addDataRow('SLOT ACCESS', 'UNIVERSAL // ANY SLOT', '#86f8ff');
      addDataRow('ACTIVE LIMIT', 'MAX 2 SUPREME MODS', '#ffe78a');
      if (this.entry.definition.supremeEffects) {
        for (const [index, effect] of this.entry.definition.supremeEffects.entries()) {
          addDataRow(`SYSTEM EFFECT ${index + 1}`, effect.label, '#e8ffff');
        }
      }
    }
    if (this.entry.definition.positiveEffect) {
      addDataRow('POSITIVE EFFECT', this.entry.definition.positiveEffect, '#7dffb0');
    }
    if (this.entry.definition.negativeEffect) {
      addDataRow('CORRUPTED PENALTY', this.entry.definition.negativeEffect, '#ff82bb');
    }

    addHeader('RANK ANALYSIS // ACQUIRED CARD R0 TO MAX R3', '#c384ff');
    addParagraph('BASELINE / NO MOD contributes 0. R0 is the newly acquired card before any paid upgrades.', '#9bbbc5', smallSize);
    for (const rank of this.entry.ranks) {
      const current = rank.current ? '  // CURRENT' : '';
      const label = rank.rank === 3 ? `R3 / MAX${current}` : `R${rank.rank}${current}`;
      addDataRow(label, rank.description, rank.current ? '#76ffb0' : '#e1eef2');
    }

    if (this.entry.stats.length > 0) {
      addHeader('STAT PROGRESSION // MOD CONTRIBUTION', '#7ae9ff');
      const columnWidth = (width - 8) / 6;
      const tableLabels = ['STAT', 'BASE', 'R0', 'R1', 'R2', 'R3'];
      tableLabels.forEach((label, index) => {
        const text = this.scene.add.text(5 + columnWidth * index + (index === 0 ? 0 : columnWidth / 2), y, label, {
          fontFamily: 'Rajdhani, sans-serif', fontSize: `${typography.table}px`, color: '#82b6c4', fontStyle: 'bold', align: index === 0 ? 'left' : 'center'
        }).setOrigin(index === 0 ? 0 : 0.5, 0);
        this.detailContent.add(text);
      });
      y += typography.table + 14;
      for (const stat of this.entry.stats) {
        const rowHeight = typography.table + 34;
        const back = this.scene.add.rectangle(3, y, width - 6, rowHeight, 0x081722, 0.82).setOrigin(0, 0);
        this.detailContent.add(back);
        const values = [`${stat.label}${stat.calibrated ? '\nPLASMA CALIBRATED' : ''}`, stat.displays.baseline, stat.displays[0], stat.displays[1], stat.displays[2], stat.displays[3]];
        values.forEach((value, index) => {
          const current = index > 1 && this.entry.currentRank === index - 2;
          const text = this.scene.add.text(5 + columnWidth * index + (index === 0 ? 0 : columnWidth / 2), y + rowHeight / 2, value, {
            fontFamily: 'Rajdhani, sans-serif', fontSize: `${typography.table}px`, color: current ? '#76ffb0' : index === 0 ? '#b9dbe4' : '#ecf8fb',
            fontStyle: current ? 'bold' : 'normal', align: index === 0 ? 'left' : 'center',
            lineSpacing: 2,
            wordWrap: index === 0 ? { width: columnWidth - 4, useAdvancedWrap: true } : undefined
          }).setOrigin(index === 0 ? 0 : 0.5, 0.5);
          this.detailContent.add(text);
        });
        y += rowHeight + 5;
      }
    }

    addHeader('UPGRADE ECONOMY', '#ffd174');
    addDataRow('ACQUISITION STATE', 'R0 // NO PAID UPGRADES');
    for (const step of this.entry.economy.upgradeSteps) {
      addDataRow(`R${step.targetRank - 1} → R${step.targetRank}`, formatCurrencyPair(step.credits, step.coreTokens));
    }
    addDataRow('FULLY UPGRADED COST', formatCurrencyPair(this.entry.economy.fullCredits, this.entry.economy.fullCoreTokens), '#ffd982');
    if (this.entry.currentRank !== null) {
      addDataRow('CURRENT INVESTMENT', formatCurrencyPair(this.entry.economy.investedCredits, this.entry.economy.investedCoreTokens));
      addDataRow('REMAINING TO MAX', formatCurrencyPair(this.entry.economy.remainingCredits, this.entry.economy.remainingCoreTokens));
    }

    addHeader('RECYCLE / SALVAGE VALUE', '#9ae6ff');
    addDataRow('SELL COPY', `${this.entry.economy.recycleCredits.toLocaleString()} CREDITS`);
    addDataRow('RECYCLE COPY', `${this.entry.economy.recyclePlasmaChips.toLocaleString()} PLASMA CHIPS`);
    if (this.entry.economy.recycleRankIndependent) addParagraph('Recycle and sell values are rarity-based and do not change with card rank.', '#90aeb8', smallSize);

    addHeader('BEST DROP OPPORTUNITY', '#ff8edb');
    if (this.entry.acquisition.bestSources.length > 0) {
      for (const best of this.entry.acquisition.bestSources) {
        addParagraph(`${best.label} // ${best.protocolLabel}\nSPECIFIC CARD ${formatModDatabaseProbability(best.effectiveChance)}`, '#ffe4f6');
      }
    } else addParagraph('NO ACTIVE DROP SOURCE IN THE CURRENT PROTOCOL DATABASE.', '#ff9db2');
    if (this.entry.acquisition.supremeExclusive) {
      addDataRow('PRIMARY SOURCE', 'SUPREME OVERDRIVE', '#f7fdff');
      addDataRow('BRIDGE ACCESS', 'ONE CONTROLLED REGULAR OVERDRIVE AWARD // R48-50', '#ffb7e9');
    }

    addHeader('ACQUISITION DATA // BASELINE WEIGHTS', '#70f0ff');
    addParagraph('CARD = opportunity chance × this exact Mod’s share of the weighted selection pool. Reference profiles use no Signal or Contract.', '#91b6c0', smallSize);
    for (const protocol of this.entry.acquisition.protocols) {
      addDataRow(`${protocol.family.toUpperCase()} // R${protocol.referenceRound}`, protocol.available ? protocol.protocolLabel : 'UNAVAILABLE', protocol.available ? '#dff8ff' : '#ff819b');
      for (const source of protocol.sources) addParagraph(formatSourceLine(source), '#bddce5', smallSize);
    }

    addHeader('SIGNAL / CONTRACT INTERACTION', '#79ffb0');
    addDataRow(this.entry.acquisition.signalLabel.toUpperCase(), `${this.entry.acquisition.signalWeightMultiplier.toFixed(1)}× CATEGORY WEIGHT`, '#7dffb1');
    addParagraph('Signal weighting changes category selection weight. It does not change rarity weights or create additional Mod opportunities.', '#9fc1c9', smallSize);
    for (const contract of this.entry.acquisition.contractBonuses) {
      addDataRow(`${contract.label.toUpperCase()} CONTRACT`, `${contract.multiplier.toFixed(2)}× MOD OPPORTUNITY`);
    }

    addHeader('DATABASE CLASSIFICATION', '#bb8bff');
    addDataRow('DEFINITION ID', this.entry.definition.id.toUpperCase());
    addDataRow('DROP WEIGHT', this.entry.definition.dropWeight.toLocaleString());
    addDataRow('TAGS', this.entry.definition.tags.map((tag) => tag.toUpperCase()).join(' // '));
    return y + 12;
  }
}
