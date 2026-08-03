import Phaser from 'phaser';
import type { LocalLeaderboardEntry } from '../save/LocalSaveTypes';
import { SceneKeys } from '../flow/SceneKeys';
import { SaveSystem } from '../systems/SaveSystem';
import { createButton } from '../utils/ui';

interface BoardDefinition {
  title: string;
  color: number;
  value(entry: LocalLeaderboardEntry): number;
  format(value: number): string;
}

export class LeaderboardsScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Leaderboards);
  }

  create(): void {
    const { width, height } = this.scale;
    const entries = SaveSystem.getLeaderboardEntries();
    const activeId = SaveSystem.getActiveProfileSummary()?.id;
    this.add.rectangle(width / 2, height / 2, width, height, 0x050914, 1);
    this.drawBackdrop(width, height);

    this.add.text(width / 2, 58, 'LEADERBOARDS', {
      fontFamily: 'Orbitron, sans-serif', fontSize: '42px', color: '#64f4ff',
      stroke: '#040812', strokeThickness: 7
    }).setOrigin(0.5);
    this.add.text(width / 2, 98, 'LOCAL PROFILE RECORDS • THIS BROWSER', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '20px', color: '#b4d6e8'
    }).setOrigin(0.5);

    const boards: BoardDefinition[] = [
      { title: 'MOST CREDITS', color: 0xffd66e, value: (entry) => entry.credits, format: (value) => value.toLocaleString() },
      { title: 'LEVELS COMPLETED', color: 0x64f4ff, value: (entry) => entry.roundsCompleted, format: (value) => value.toLocaleString() },
      { title: 'BOMB TARGETS DESTROYED', color: 0xff68d7, value: (entry) => entry.bombSitesDestroyed, format: (value) => value.toLocaleString() },
      { title: 'ENEMIES DESTROYED', color: 0x73ffac, value: (entry) => entry.enemiesDestroyed, format: (value) => value.toLocaleString() }
    ];

    const gap = Phaser.Math.Clamp(width * 0.018, 18, 30);
    const panelWidth = Math.min((width - gap * 3) / 2, 760);
    const panelHeight = Math.min((height - 250 - gap) / 2, 280);
    const totalWidth = panelWidth * 2 + gap;
    const startX = (width - totalWidth) / 2 + panelWidth / 2;
    const startY = 142 + panelHeight / 2;
    boards.forEach((board, index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      this.drawBoard(
        startX + column * (panelWidth + gap),
        startY + row * (panelHeight + gap),
        panelWidth,
        panelHeight,
        board,
        entries,
        activeId
      );
    });

    createButton(this, width / 2, height - 42, 'Back To Splash', () => this.scene.start(SceneKeys.Splash), 240);
  }

  private drawBoard(
    x: number,
    y: number,
    width: number,
    height: number,
    board: BoardDefinition,
    entries: LocalLeaderboardEntry[],
    activeId?: string
  ): void {
    this.add.rectangle(x, y, width, height, 0x0a1423, 0.9).setStrokeStyle(2, board.color, 0.72);
    this.add.rectangle(x, y - height / 2 + 25, width - 4, 46, board.color, 0.08);
    this.add.text(x, y - height / 2 + 25, board.title, {
      fontFamily: 'Orbitron, sans-serif', fontSize: '17px', color: Phaser.Display.Color.IntegerToColor(board.color).rgba
    }).setOrigin(0.5);

    const ranked = [...entries].sort((a, b) => board.value(b) - board.value(a) || a.name.localeCompare(b.name)).slice(0, 5);
    if (ranked.length === 0) {
      this.add.text(x, y + 14, 'No local records yet.', {
        fontFamily: 'Rajdhani, sans-serif', fontSize: '20px', color: '#7895a8'
      }).setOrigin(0.5);
      return;
    }

    const rowStart = y - height / 2 + 63;
    const rowGap = Math.max(29, (height - 76) / 5);
    ranked.forEach((entry, index) => {
      const rowY = rowStart + index * rowGap;
      const active = entry.profileId === activeId;
      if (active) this.add.rectangle(x, rowY, width - 24, rowGap - 4, board.color, 0.1);
      this.add.text(x - width / 2 + 20, rowY, `#${index + 1}`, {
        fontFamily: 'Orbitron, sans-serif', fontSize: '15px', color: index === 0 ? '#fff2a6' : '#80a8bc'
      }).setOrigin(0, 0.5);
      this.add.text(x - width / 2 + 68, rowY, `${entry.name}${active ? '  • YOU' : ''}`, {
        fontFamily: 'Rajdhani, sans-serif', fontSize: '19px', color: active ? '#ffffff' : '#c9e1ec'
      }).setOrigin(0, 0.5);
      this.add.text(x + width / 2 - 20, rowY, board.format(board.value(entry)), {
        fontFamily: 'Orbitron, sans-serif', fontSize: '16px', color: Phaser.Display.Color.IntegerToColor(board.color).rgba
      }).setOrigin(1, 0.5);
    });
  }

  private drawBackdrop(width: number, height: number): void {
    const grid = this.add.graphics();
    grid.lineStyle(1, 0x31516b, 0.14);
    for (let x = 0; x < width; x += 48) grid.lineBetween(x, 0, x, height);
    for (let y = 0; y < height; y += 48) grid.lineBetween(0, y, width, y);
    for (let i = 0; i < 14; i += 1) {
      const dot = this.add.circle(Phaser.Math.Between(0, width), Phaser.Math.Between(0, height), 2, i % 2 ? 0x64f4ff : 0xff68d7, 0.35);
      this.tweens.add({ targets: dot, alpha: { from: 0.12, to: 0.65 }, duration: 900 + i * 90, yoyo: true, repeat: -1 });
    }
  }
}
