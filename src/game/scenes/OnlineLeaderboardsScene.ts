import Phaser from 'phaser';
import { LeaderboardClient } from '../../online/LeaderboardClient';
import { OnlineCredentialStore } from '../../online/OnlineCredentialStore';
import { OnlineRunManager } from '../../online/OnlineRunManager';
import type { OnlineLeaderboardCategory, OnlineLeaderboardEntry } from '../../online/onlineTypes';
import { SceneKeys } from '../flow/SceneKeys';
import { SaveSystem } from '../systems/SaveSystem';
import { createModCollectionButton } from '../ui/ModCollectionUi.ts';
import { disableButton } from '../utils/ui';

const CATEGORIES: Array<{ key: OnlineLeaderboardCategory; title: string; color: number }> = [
  { key: 'highest_round', title: 'HIGHEST ROUND', color: 0x63f4ff },
  { key: 'enemies_destroyed', title: 'ENEMIES DESTROYED', color: 0x71ffad },
  { key: 'bomb_sites_destroyed', title: 'BOMB TARGETS DESTROYED', color: 0xff69d6 }
];

interface LeaderboardLayout {
  compact: boolean;
  margin: number;
  contentTop: number;
  contentBottom: number;
  panelWidth: number;
  panelHeight: number;
  gap: number;
  firstX: number;
  footerY: number;
  footerButtonHeight: number;
}

const chamferedPoints = (width: number, height: number, cut: number): number[] => [
  cut, 0, width - cut, 0,
  width, cut, width, height - cut,
  width - cut, height, cut, height,
  0, height - cut, 0, cut
];

const calculateLayout = (width: number, height: number): LeaderboardLayout => {
  const compact = width < 1100 || height < 760;
  const margin = compact ? 12 : 18;
  const gap = Phaser.Math.Clamp(width * 0.011, compact ? 8 : 14, compact ? 14 : 22);
  const contentTop = compact ? 146 : 164;
  const footerY = height - (compact ? 31 : 39);
  const footerButtonHeight = compact ? 36 : 44;
  const contentBottom = footerY - footerButtonHeight / 2 - (compact ? 12 : 17);
  const availableWidth = width - margin * 2 - gap * 2 - (compact ? 10 : 24);
  const panelWidth = Math.min(560, availableWidth / 3);
  const panelHeight = Math.max(compact ? 180 : 250, contentBottom - contentTop);
  const totalWidth = panelWidth * 3 + gap * 2;
  return {
    compact,
    margin,
    contentTop,
    contentBottom,
    panelWidth,
    panelHeight,
    gap,
    firstX: (width - totalWidth) / 2 + panelWidth / 2,
    footerY,
    footerButtonHeight
  };
};

export class OnlineLeaderboardsScene extends Phaser.Scene {
  private boardObjects: Phaser.GameObjects.GameObject[] = [];
  private statusText!: Phaser.GameObjects.Text;
  private aroundMode = false;
  private requestGeneration = 0;
  private readonly handleResize = (): void => { this.scene.restart(); };

  constructor() {
    super(SceneKeys.OnlineLeaderboards);
  }

  create(): void {
    const { width, height } = this.scale;
    const layout = calculateLayout(width, height);
    this.createConsoleShell(width, height, layout);

    const statusLeft = layout.margin + (layout.compact ? 24 : 34);
    const viewWidth = layout.compact ? 152 : 186;
    const viewX = width - layout.margin - (layout.compact ? 22 : 32) - viewWidth / 2;
    const statusRight = viewX - viewWidth / 2 - (layout.compact ? 12 : 18);
    const profile = SaveSystem.getActiveProfileSummary();
    const aroundAvailable = Boolean(profile && OnlineCredentialStore.load(profile.id));
    if (!aroundAvailable) this.aroundMode = false;
    this.statusText = this.add.text((statusLeft + statusRight) / 2, layout.compact ? 105 : 117, 'CONNECTING TO LEADERBOARD NETWORK...', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${layout.compact ? 13 : 16}px`, color: '#a9c9d8',
      fontStyle: 'bold', align: 'center', lineSpacing: 1, letterSpacing: layout.compact ? 0 : 1,
      wordWrap: { width: Math.max(180, statusRight - statusLeft), useAdvancedWrap: true }
    }).setOrigin(0.5).setMaxLines(2).setDepth(22);

    const aroundButton = createModCollectionButton(this, viewX, layout.compact ? 111 : 122, this.aroundMode ? 'VIEW // AROUND ME' : 'VIEW // GLOBAL', () => {
      this.aroundMode = !this.aroundMode;
      const label = aroundButton.getByName('button-label') as Phaser.GameObjects.Text | null;
      label?.setText(this.aroundMode ? 'VIEW // AROUND ME' : 'VIEW // GLOBAL');
      void this.loadBoards();
      return true;
    }, viewWidth, 'utility', { height: layout.compact ? 32 : 38, fontSize: layout.compact ? 12 : 14 });
    aroundButton.setDepth(23);
    if (!aroundAvailable) disableButton(aroundButton);

    const footerGap = layout.compact ? 10 : 16;
    const availableFooterWidth = width - layout.margin * 2 - (layout.compact ? 20 : 80);
    const localWidth = Phaser.Math.Clamp((availableFooterWidth - footerGap * 2) * 0.31, 160, 250);
    const refreshWidth = Phaser.Math.Clamp((availableFooterWidth - footerGap * 2) * 0.25, 140, 210);
    const backWidth = Phaser.Math.Clamp((availableFooterWidth - footerGap * 2) * 0.34, 180, 270);
    const totalFooterWidth = localWidth + refreshWidth + backWidth + footerGap * 2;
    let footerX = width / 2 - totalFooterWidth / 2;
    createModCollectionButton(this, footerX + localWidth / 2, layout.footerY, 'LOCAL RECORDS', () => this.scene.start(SceneKeys.Leaderboards), localWidth, 'utility', {
      height: layout.footerButtonHeight, fontSize: layout.compact ? 13 : 16
    }).setDepth(24);
    footerX += localWidth + footerGap;
    createModCollectionButton(this, footerX + refreshWidth / 2, layout.footerY, 'REFRESH FEED', () => { void this.loadBoards(); return true; }, refreshWidth, 'standard', {
      height: layout.footerButtonHeight, fontSize: layout.compact ? 13 : 16
    }).setDepth(24);
    footerX += refreshWidth + footerGap;
    createModCollectionButton(this, footerX + backWidth / 2, layout.footerY, 'BACK TO MAIN MENU', () => this.scene.start(SceneKeys.MainMenu), backWidth, 'return', {
      height: layout.footerButtonHeight, fontSize: layout.compact ? 13 : 16
    }).setDepth(24);

    this.scale.off('resize', this.handleResize, this);
    this.scale.on('resize', this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.requestGeneration += 1;
      this.scale.off('resize', this.handleResize, this);
      this.clearBoards();
    });

    if (!LeaderboardClient.configured()) {
      this.statusText.setText('ONLINE SERVICE NOT CONFIGURED • LOCAL LEADERBOARDS REMAIN AVAILABLE').setColor('#ffc67d');
      this.drawUnavailable(layout);
      return;
    }
    void OnlineRunManager.flushQueue();
    void this.loadBoards();
  }

  private async loadBoards(): Promise<void> {
    const generation = ++this.requestGeneration;
    this.clearBoards();
    this.statusText.setText(this.aroundMode ? 'LOADING RECORDS AROUND YOUR RANK...' : 'LOADING VERIFIED GLOBAL RECORDS...').setColor('#a9c9d8');
    const profile = SaveSystem.getActiveProfileSummary();
    try {
      const result = await Promise.all(CATEGORIES.map(({ key }) => this.aroundMode && profile
        ? LeaderboardClient.aroundPlayer(profile.id, key)
        : LeaderboardClient.leaderboard(key)));
      if (!this.scene.isActive() || generation !== this.requestGeneration) return;
      this.drawBoards(result);
      const credentials = profile ? OnlineCredentialStore.load(profile.id) : null;
      const pending = OnlineRunManager.pendingCount();
      const lastStatus = OnlineRunManager.lastSubmissionStatus();
      this.statusText.setText(
        `${this.aroundMode ? 'AROUND YOUR RANK' : 'VERIFIED GLOBAL RECORDS'} • ${credentials ? credentials.displayName : 'ANONYMOUS ID CREATED WHEN AN ONLINE RUN STARTS'}${lastStatus ? ` • LAST RUN ${lastStatus.toUpperCase()}` : ''}${pending ? ` • ${pending} SUBMISSION${pending === 1 ? '' : 'S'} PENDING` : ''}`
      ).setColor('#9debcf');
    } catch {
      if (!this.scene.isActive() || generation !== this.requestGeneration) return;
      this.statusText.setText('LEADERBOARD OFFLINE • GAMEPLAY AND LOCAL RECORDS ARE STILL AVAILABLE').setColor('#ff9aab');
      this.drawUnavailable(calculateLayout(this.scale.width, this.scale.height));
    }
  }

  private drawBoards(results: OnlineLeaderboardEntry[][]): void {
    const { width, height } = this.scale;
    const layout = calculateLayout(width, height);
    const activeProfile = SaveSystem.getActiveProfileSummary();
    const publicId = activeProfile ? OnlineCredentialStore.load(activeProfile.id)?.publicId : undefined;
    CATEGORIES.forEach((category, boardIndex) => {
      const x = layout.firstX + boardIndex * (layout.panelWidth + layout.gap);
      this.drawBoardModule(x, layout.contentTop, layout.panelWidth, layout.panelHeight, category, results[boardIndex], publicId, boardIndex, layout.compact);
    });
  }

  private drawBoardModule(
    x: number,
    top: number,
    width: number,
    height: number,
    category: (typeof CATEGORIES)[number],
    source: OnlineLeaderboardEntry[],
    publicId: string | undefined,
    boardIndex: number,
    compact: boolean
  ): void {
    const root = this.add.container(x - width / 2, top).setDepth(18).setAlpha(0).setY(top + 8);
    const cut = compact ? 9 : 14;
    const points = chamferedPoints(width, height, cut);
    const shadow = this.add.polygon(width / 2 + 4, height / 2 + 6, points, 0x000000, 0.52);
    const chassis = this.add.polygon(width / 2, height / 2, points, 0x07131e, 0.97).setStrokeStyle(1.5, category.color, 0.58);
    const glass = this.add.rectangle(8, 8, width - 16, height - 16, 0x081925, 0.74).setOrigin(0, 0).setStrokeStyle(1, category.color, 0.14);
    const headerHeight = compact ? 48 : 58;
    const header = this.add.rectangle(9, 9, width - 18, headerHeight, 0x0b2130, 0.94).setOrigin(0, 0);
    const topRail = this.add.rectangle(18, 13, width - 36, 3, category.color, 0.72).setOrigin(0, 0);
    const divider = this.add.rectangle(18, headerHeight + 5, width - 36, 1, category.color, 0.3).setOrigin(0, 0);
    const leftRail = this.add.rectangle(7, headerHeight + 19, 3, Math.max(12, height - headerHeight - 38), category.color, 0.44).setOrigin(0, 0);
    const led = this.add.circle(width - 23, compact ? 33 : 37, 3, category.color, 0.95);
    const title = this.add.text(21, compact ? 23 : 25, category.title, {
      fontFamily: 'Orbitron, sans-serif', fontSize: `${Phaser.Math.Clamp(width * 0.039, compact ? 10 : 12, compact ? 13 : 16)}px`,
      color: Phaser.Display.Color.IntegerToColor(category.color).rgba, fontStyle: 'bold', letterSpacing: compact ? 0 : 1
    }).setOrigin(0, 0).setWordWrapWidth(width - 56, true).setMaxLines(2);
    const feed = this.add.text(width - 22, headerHeight - 8, `VERIFIED FEED // 0${boardIndex + 1}`, {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${compact ? 8 : 10}px`, color: '#70aab9', fontStyle: 'bold', letterSpacing: 1
    }).setOrigin(1, 1);
    root.add([shadow, chassis, glass, header, topRail, divider, leftRail, led, title, feed]);

    const contentTop = headerHeight + (compact ? 12 : 16);
    const contentBottom = height - (compact ? 12 : 16);
    const availableHeight = contentBottom - contentTop;
    const entryLimit = Math.max(5, Math.min(10, Math.floor(availableHeight / (compact ? 31 : 38))));
    const entries = source.slice(0, entryLimit);
    if (entries.length === 0) {
      const emptyPlate = this.add.rectangle(18, contentTop + availableHeight * 0.5 - 34, width - 36, 68, 0x06111a, 0.76)
        .setOrigin(0, 0).setStrokeStyle(1, category.color, 0.2);
      const empty = this.add.text(width / 2, contentTop + availableHeight * 0.5,
        this.aroundMode ? 'NO VERIFIED\nPERSONAL RANK YET' : 'NO VERIFIED\nRUNS YET', {
          fontFamily: 'Rajdhani, sans-serif', fontSize: `${compact ? 14 : 18}px`, color: '#7897a9',
          fontStyle: 'bold', align: 'center', lineSpacing: 3
        }).setOrigin(0.5);
      root.add([emptyPlate, empty]);
    } else {
      const rowGap = compact ? 4 : 6;
      const rowHeight = Math.min(compact ? 36 : 43, (availableHeight - rowGap * Math.max(0, entries.length - 1)) / entries.length);
      entries.forEach((entry, index) => {
        const rowY = contentTop + index * (rowHeight + rowGap);
        const active = entry.public_player_id === publicId;
        const rowFill = active ? category.color : index % 2 === 0 ? 0x0a1a25 : 0x07141e;
        const plate = this.add.rectangle(17, rowY, width - 34, rowHeight, rowFill, active ? 0.13 : 0.72)
          .setOrigin(0, 0).setStrokeStyle(1, active ? category.color : 0x285264, active ? 0.54 : 0.2);
        const edge = this.add.rectangle(20, rowY + rowHeight / 2, 3, Math.max(8, rowHeight - 10), active ? category.color : 0x3d7a8b, active ? 0.92 : 0.38);
        const rankColor = entry.rank === 1 ? '#fff0a3' : entry.rank <= 3 ? '#d5c7ff' : '#82a5b8';
        const rank = this.add.text(29, rowY + rowHeight / 2, `#${entry.rank}`, {
          fontFamily: 'Orbitron, sans-serif', fontSize: `${compact ? 10 : 12}px`, color: rankColor, fontStyle: 'bold'
        }).setOrigin(0, 0.5);
        const nameX = compact ? 69 : 78;
        const valueReserve = compact ? 68 : 86;
        const name = this.add.text(nameX, rowY + rowHeight / 2, `${entry.display_name}${active ? '  • YOU' : ''}`, {
          fontFamily: 'Rajdhani, sans-serif', fontSize: `${compact ? 13 : 17}px`, color: active ? '#ffffff' : '#c8e2ed', fontStyle: active ? 'bold' : 'normal'
        }).setOrigin(0, 0.5).setCrop(0, 0, Math.max(24, width - nameX - valueReserve), rowHeight);
        const value = this.add.text(width - 27, rowY + rowHeight / 2, entry.value.toLocaleString(), {
          fontFamily: 'Orbitron, sans-serif', fontSize: `${compact ? 10 : 13}px`, color: Phaser.Display.Color.IntegerToColor(category.color).rgba, fontStyle: 'bold'
        }).setOrigin(1, 0.5);
        root.add([plate, edge, rank, name, value]);
      });
    }

    this.tweens.add({ targets: led, alpha: { from: 0.24, to: 1 }, duration: 740 + boardIndex * 90, yoyo: true, repeat: -1 });
    this.tweens.add({ targets: root, y: top, alpha: 1, duration: 300, delay: boardIndex * 85, ease: 'Sine.easeOut' });
    this.boardObjects.push(root);
  }

  private drawUnavailable(layout: LeaderboardLayout): void {
    this.clearBoards();
    const width = Math.min(layout.compact ? 620 : 760, this.scale.width - layout.margin * 2 - 28);
    const height = Math.min(layout.panelHeight, layout.compact ? 220 : 270);
    const x = this.scale.width / 2 - width / 2;
    const y = layout.contentTop + Math.max(0, (layout.panelHeight - height) / 2);
    const root = this.add.container(x, y).setDepth(18).setAlpha(0);
    const points = chamferedPoints(width, height, layout.compact ? 11 : 17);
    const shadow = this.add.polygon(width / 2 + 5, height / 2 + 7, points, 0x000000, 0.55);
    const chassis = this.add.polygon(width / 2, height / 2, points, 0x08141f, 0.98).setStrokeStyle(2, 0x4edfee, 0.58);
    const header = this.add.rectangle(12, 12, width - 24, layout.compact ? 45 : 55, 0x0b2130, 0.94).setOrigin(0, 0);
    const rail = this.add.rectangle(24, 17, width - 48, 3, 0xff5bcf, 0.64).setOrigin(0, 0);
    const heading = this.add.text(28, layout.compact ? 29 : 32, 'NETWORK LINK // UNAVAILABLE', {
      fontFamily: 'Orbitron, sans-serif', fontSize: `${layout.compact ? 13 : 17}px`, color: '#ff9aab', fontStyle: 'bold'
    }).setOrigin(0, 0);
    const iconX = layout.compact ? 58 : 76;
    const iconY = height * 0.61;
    const halo = this.add.circle(iconX, iconY, layout.compact ? 29 : 39, 0xff668a, 0.06).setStrokeStyle(1, 0xff668a, 0.26);
    const core = this.add.circle(iconX, iconY, layout.compact ? 17 : 22, 0x101c28, 0.95).setStrokeStyle(2, 0xff668a, 0.72);
    const glyph = this.add.text(iconX, iconY - 1, '!', { fontFamily: 'Orbitron, sans-serif', fontSize: `${layout.compact ? 19 : 25}px`, color: '#ff8ca3', fontStyle: 'bold' }).setOrigin(0.5);
    const message = this.add.text(layout.compact ? 104 : 132, iconY,
      'Online records could not be loaded.\n\nLocal mode remains available. Failed submissions remain queued until the server accepts or rejects them.', {
        fontFamily: 'Rajdhani, sans-serif', fontSize: `${layout.compact ? 15 : 19}px`, color: '#c8e5ef',
        fontStyle: 'bold', lineSpacing: layout.compact ? 2 : 4, wordWrap: { width: width - (layout.compact ? 128 : 165), useAdvancedWrap: true }
      }).setOrigin(0, 0.5).setMaxLines(5);
    root.add([shadow, chassis, header, rail, heading, halo, core, glyph, message]);
    this.tweens.add({ targets: [halo, core], alpha: { from: 0.45, to: 1 }, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: root, alpha: 1, duration: 300, ease: 'Sine.easeOut' });
    this.boardObjects.push(root);
  }

  private clearBoards(): void {
    for (const object of this.boardObjects) {
      this.tweens.killTweensOf(object);
      object.destroy(true);
    }
    this.boardObjects = [];
  }

  private createConsoleShell(width: number, height: number, layout: LeaderboardLayout): void {
    this.add.rectangle(width / 2, height / 2, width, height, 0x03070d, 1);
    this.add.grid(width / 2, height / 2, width, height, layout.compact ? 42 : 54, layout.compact ? 42 : 54, 0x040a12, 0.14, 0x174257, 0.12);
    const leftRing = this.add.circle(width * 0.1, height * 0.72, layout.compact ? 78 : 132, 0x56efff, 0.018).setStrokeStyle(2, 0x56efff, 0.15);
    const rightRing = this.add.circle(width * 0.91, height * 0.25, layout.compact ? 66 : 108, 0xff5bd2, 0.018).setStrokeStyle(2, 0xff5bd2, 0.15);

    const shellWidth = width - layout.margin * 2;
    const shellHeight = height - layout.margin * 2;
    const points = chamferedPoints(shellWidth, shellHeight, layout.compact ? 12 : 20);
    const root = this.add.container(0, 0).setDepth(10).setAlpha(0);
    const shadow = this.add.polygon(width / 2 + 6, height / 2 + 8, points, 0x000000, 0.62);
    const chassis = this.add.polygon(width / 2, height / 2, points, 0x07111b, 0.94).setStrokeStyle(2, 0x3fbed0, 0.72);
    const glass = this.add.rectangle(layout.margin + 10, layout.margin + 10, shellWidth - 20, shellHeight - 20, 0x081925, 0.44)
      .setOrigin(0, 0).setStrokeStyle(1, 0x55efff, 0.14);
    const topRail = this.add.rectangle(width / 2, layout.margin + 5, shellWidth - 42, 4, 0x55efff, 0.62);
    const leftRail = this.add.rectangle(layout.margin + 7, height / 2, 3, shellHeight - 42, 0xff5bcf, 0.48);
    const rightRail = this.add.rectangle(width - layout.margin - 7, height / 2, 3, shellHeight - 42, 0x55efff, 0.4);
    const headerHeight = layout.compact ? 119 : 135;
    const header = this.add.rectangle(layout.margin + 14, layout.margin + 12, shellWidth - 28, headerHeight, 0x081a27, 0.9)
      .setOrigin(0, 0).setStrokeStyle(1, 0x55efff, 0.22);
    const headerAccent = this.add.rectangle(layout.margin + 30, layout.margin + 17, shellWidth - 60, 3, 0xff5bcf, 0.56).setOrigin(0, 0);
    root.add([shadow, chassis, glass, topRail, leftRail, rightRail, header, headerAccent]);

    const titleSize = layout.compact ? Phaser.Math.Clamp(width * 0.033, 24, 32) : Phaser.Math.Clamp(width * 0.027, 34, 44);
    const titleY = layout.compact ? 23 : 26;
    const ghost = this.add.text(width / 2 + 2, titleY + 2, 'ONLINE LEADERBOARDS', {
      fontFamily: 'Orbitron, sans-serif', fontSize: `${titleSize}px`, color: '#ff48ca', fontStyle: 'bold'
    }).setOrigin(0.5, 0).setAlpha(0.17).setBlendMode(Phaser.BlendModes.ADD);
    const title = this.add.text(width / 2, titleY, 'ONLINE LEADERBOARDS', {
      fontFamily: 'Orbitron, sans-serif', fontSize: `${titleSize}px`, color: '#75f4ff', fontStyle: 'bold',
      shadow: { color: '#39eeff', blur: 9, fill: true }, letterSpacing: 1
    }).setOrigin(0.5, 0);
    const subtitle = this.add.text(width / 2, titleY + titleSize + (layout.compact ? 2 : 4), 'N3ON NETWORK // VERIFIED DEPLOYMENT ARCHIVE', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${layout.compact ? 11 : 14}px`, color: '#d28abb', fontStyle: 'bold', letterSpacing: 2
    }).setOrigin(0.5, 0);
    const leftStatus = this.add.text(layout.margin + (layout.compact ? 25 : 36), layout.margin + 17, 'RANK RELAY // GLOBAL', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${layout.compact ? 8 : 10}px`, color: '#73c7d4', fontStyle: 'bold', letterSpacing: 1
    }).setOrigin(0, 0);
    const rightStatus = this.add.text(width - layout.margin - (layout.compact ? 25 : 36), layout.margin + 17, 'SECURE LINK // ACTIVE', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: `${layout.compact ? 8 : 10}px`, color: '#76ffb0', fontStyle: 'bold', letterSpacing: 1
    }).setOrigin(1, 0);
    const statusPlateWidth = width - layout.margin * 2 - (layout.compact ? 206 : 258);
    const statusPlate = this.add.rectangle(layout.margin + (layout.compact ? 18 : 26), layout.compact ? 94 : 102, statusPlateWidth, layout.compact ? 35 : 42, 0x06131e, 0.88)
      .setOrigin(0, 0).setStrokeStyle(1, 0x55efff, 0.2);
    const statusEdge = this.add.rectangle(layout.margin + (layout.compact ? 23 : 31), layout.compact ? 111.5 : 123, 3, layout.compact ? 22 : 28, 0x71ffad, 0.66);
    root.add([ghost, title, subtitle, leftStatus, rightStatus, statusPlate, statusEdge]);

    for (const x of [layout.margin + 15, width - layout.margin - 15]) {
      for (const y of [layout.margin + 15, height - layout.margin - 15]) root.add(this.add.circle(x, y, layout.compact ? 2 : 3, x < width / 2 ? 0xff5bcf : 0x55efff, 0.8));
    }
    const footerRail = this.add.rectangle(width / 2, layout.footerY - layout.footerButtonHeight / 2 - (layout.compact ? 12 : 15), Math.min(width - 80, 980), 2, 0x55efff, 0.25);
    const sweep = this.add.rectangle(layout.margin + 18, height / 2, 2, shellHeight - 38, 0x55efff, 0.05);
    root.add([footerRail, sweep]);
    this.tweens.add({ targets: [leftRing, rightRing], scale: { from: 0.96, to: 1.04 }, alpha: { from: 0.3, to: 0.7 }, duration: 3400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: sweep, x: width - layout.margin - 18, alpha: { from: 0.015, to: 0.11 }, duration: 4200, repeat: -1, repeatDelay: 2800, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: [title, topRail], alpha: { from: 0.75, to: 1 }, duration: 1750, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: rightStatus, alpha: { from: 0.3, to: 1 }, duration: 860, yoyo: true, repeat: -1 });
    this.tweens.add({ targets: root, alpha: 1, duration: 330, ease: 'Sine.easeOut' });
  }
}
