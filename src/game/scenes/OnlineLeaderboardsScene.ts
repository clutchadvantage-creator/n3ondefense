import Phaser from 'phaser';
import { LeaderboardClient } from '../../online/LeaderboardClient';
import { OnlineCredentialStore } from '../../online/OnlineCredentialStore';
import { OnlineRunManager } from '../../online/OnlineRunManager';
import type { OnlineLeaderboardCategory, OnlineLeaderboardEntry } from '../../online/onlineTypes';
import { SceneKeys } from '../flow/SceneKeys';
import { SaveSystem } from '../systems/SaveSystem';
import { createButton, disableButton } from '../utils/ui';

const CATEGORIES: Array<{ key: OnlineLeaderboardCategory; title: string; color: number }> = [
  { key: 'highest_round', title: 'HIGHEST ROUND', color: 0x63f4ff },
  { key: 'enemies_destroyed', title: 'ENEMIES DESTROYED', color: 0x71ffad },
  { key: 'bomb_sites_destroyed', title: 'BOMB TARGETS DESTROYED', color: 0xff69d6 }
];

export class OnlineLeaderboardsScene extends Phaser.Scene {
  private boardObjects: Phaser.GameObjects.GameObject[] = [];
  private statusText!: Phaser.GameObjects.Text;
  private aroundMode = false;

  constructor() {
    super(SceneKeys.OnlineLeaderboards);
  }

  create(): void {
    const { width, height } = this.scale;
    this.add.rectangle(width / 2, height / 2, width, height, 0x030813, 1);
    this.drawBackdrop(width, height);
    this.add.text(width / 2, 28, 'N3ONDefense ONLINE LEADERBOARDS', {
      fontFamily: 'Orbitron, sans-serif', fontSize: `${Phaser.Math.Clamp(width * 0.034, 25, 36)}px`, color: '#62f2ff', stroke: '#030711', strokeThickness: 7,
      align: 'center', wordWrap: { width: width - 48, useAdvancedWrap: true }
    }).setOrigin(0.5, 0).setMaxLines(2);
    this.statusText = this.add.text(width / 2, 80, 'CONNECTING TO LEADERBOARD NETWORK...', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '17px', color: '#a9c9d8', align: 'center', lineSpacing: 2,
      wordWrap: { width: Math.min(1120, width - 56), useAdvancedWrap: true }
    }).setOrigin(0.5, 0).setMaxLines(2);

    const aroundButton = createButton(this, width / 2, 144, 'Around Me', () => {
      this.aroundMode = !this.aroundMode;
      void this.loadBoards();
    }, 210);
    const profile = SaveSystem.getActiveProfileSummary();
    if (!profile || !OnlineCredentialStore.load(profile.id)) disableButton(aroundButton);

    createButton(this, width / 2 - 270, height - 38, 'Local Records', () => this.scene.start(SceneKeys.Leaderboards), 220);
    createButton(this, width / 2, height - 38, 'Refresh', () => { void this.loadBoards(); }, 190);
    createButton(this, width / 2 + 270, height - 38, 'Back To Main Menu', () => this.scene.start(SceneKeys.MainMenu), 220);

    if (!LeaderboardClient.configured()) {
      this.statusText.setText('ONLINE SERVICE NOT CONFIGURED • LOCAL LEADERBOARDS REMAIN AVAILABLE').setColor('#ffc67d');
      this.drawUnavailable(width, height);
      return;
    }
    void OnlineRunManager.flushQueue();
    void this.loadBoards();
  }

  private async loadBoards(): Promise<void> {
    this.clearBoards();
    this.statusText.setText(this.aroundMode ? 'LOADING RECORDS AROUND YOUR RANK...' : 'LOADING VERIFIED GLOBAL RECORDS...').setColor('#a9c9d8');
    const profile = SaveSystem.getActiveProfileSummary();
    try {
      const result = await Promise.all(CATEGORIES.map(({ key }) => this.aroundMode && profile
        ? LeaderboardClient.aroundPlayer(profile.id, key)
        : LeaderboardClient.leaderboard(key)));
      this.drawBoards(result);
      const credentials = profile ? OnlineCredentialStore.load(profile.id) : null;
      const pending = OnlineRunManager.pendingCount();
      const lastStatus = OnlineRunManager.lastSubmissionStatus();
      this.statusText.setText(
        `${this.aroundMode ? 'AROUND YOUR RANK' : 'VERIFIED GLOBAL RECORDS'} • ${credentials ? credentials.displayName : 'ANONYMOUS ID CREATED WHEN AN ONLINE RUN STARTS'}${lastStatus ? ` • LAST RUN ${lastStatus.toUpperCase()}` : ''}${pending ? ` • ${pending} SUBMISSION${pending === 1 ? '' : 'S'} PENDING` : ''}`
      ).setColor('#9debcf');
    } catch {
      this.statusText.setText('LEADERBOARD OFFLINE • GAMEPLAY AND LOCAL RECORDS ARE STILL AVAILABLE').setColor('#ff9aab');
      this.drawUnavailable(this.scale.width, this.scale.height);
    }
  }

  private drawBoards(results: OnlineLeaderboardEntry[][]): void {
    const { width, height } = this.scale;
    const gap = Phaser.Math.Clamp(width * 0.012, 12, 24);
    const panelWidth = Math.min((width - gap * 4) / 3, 560);
    const panelHeight = height - 250;
    const totalWidth = panelWidth * 3 + gap * 2;
    const firstX = (width - totalWidth) / 2 + panelWidth / 2;
    const activeProfile = SaveSystem.getActiveProfileSummary();
    const publicId = activeProfile ? OnlineCredentialStore.load(activeProfile.id)?.publicId : undefined;

    CATEGORIES.forEach((category, boardIndex) => {
      const x = firstX + boardIndex * (panelWidth + gap);
      const y = 176 + panelHeight / 2;
      const panel = this.add.rectangle(x, y, panelWidth, panelHeight, 0x091526, 0.93).setStrokeStyle(2, category.color, 0.7);
      const title = this.add.text(x, 202, category.title, {
        fontFamily: 'Orbitron, sans-serif', fontSize: `${Phaser.Math.Clamp(panelWidth * 0.038, 13, 18)}px`,
        color: Phaser.Display.Color.IntegerToColor(category.color).rgba
      }).setOrigin(0.5);
      this.boardObjects.push(panel, title);
      const entries = results[boardIndex].slice(0, Math.max(5, Math.min(10, Math.floor((panelHeight - 70) / 36))));
      if (entries.length === 0) {
        const empty = this.add.text(x, y, this.aroundMode ? 'No verified personal rank yet.' : 'No verified runs yet.', {
          fontFamily: 'Rajdhani, sans-serif', fontSize: '19px', color: '#7897a9', align: 'center'
        }).setOrigin(0.5);
        this.boardObjects.push(empty);
        return;
      }
      entries.forEach((entry, index) => {
        const rowY = 240 + index * 36;
        const active = entry.public_player_id === publicId;
        if (active) {
          const highlight = this.add.rectangle(x, rowY, panelWidth - 18, 31, category.color, 0.12);
          this.boardObjects.push(highlight);
        }
        const rank = this.add.text(x - panelWidth / 2 + 14, rowY, `#${entry.rank}`, {
          fontFamily: 'Orbitron, sans-serif', fontSize: '13px', color: entry.rank === 1 ? '#fff0a3' : '#82a5b8'
        }).setOrigin(0, 0.5);
        const name = this.add.text(x - panelWidth / 2 + 59, rowY, `${entry.display_name}${active ? ' • YOU' : ''}`, {
          fontFamily: 'Rajdhani, sans-serif', fontSize: '18px', color: active ? '#ffffff' : '#c8e2ed'
        }).setOrigin(0, 0.5).setCrop(0, 0, Math.max(32, panelWidth - 170), 31);
        const value = this.add.text(x + panelWidth / 2 - 14, rowY, entry.value.toLocaleString(), {
          fontFamily: 'Orbitron, sans-serif', fontSize: '14px', color: Phaser.Display.Color.IntegerToColor(category.color).rgba
        }).setOrigin(1, 0.5);
        this.boardObjects.push(rank, name, value);
      });
    });
  }

  private drawUnavailable(width: number, height: number): void {
    this.clearBoards();
    const panelWidth = Math.min(760, width - 48);
    const panel = this.add.rectangle(width / 2, height / 2, panelWidth, 250, 0x0a1423, 0.94).setStrokeStyle(2, 0x4edfee, 0.55);
    const message = this.add.text(width / 2, height / 2,
      'Online records could not be loaded.\n\nLocal mode remains available. Online submissions with connectivity failures stay labeled QUEUED until the server accepts or rejects them.', {
        fontFamily: 'Rajdhani, sans-serif', fontSize: '21px', color: '#c8e5ef', align: 'center', lineSpacing: 5,
        wordWrap: { width: panelWidth - 64, useAdvancedWrap: true }
      }).setOrigin(0.5);
    this.boardObjects.push(panel, message);
  }

  private clearBoards(): void {
    this.boardObjects.forEach((object) => object.destroy());
    this.boardObjects = [];
  }

  private drawBackdrop(width: number, height: number): void {
    const grid = this.add.graphics();
    grid.lineStyle(1, 0x255573, 0.13);
    for (let x = 0; x < width; x += 44) grid.lineBetween(x, 0, x, height);
    for (let y = 0; y < height; y += 44) grid.lineBetween(0, y, width, y);
  }
}
