import Phaser from 'phaser';
import { getWaveConfig } from '../../data/waves';
import type { EnemyType } from '../types';

export interface WaveCallbacks {
  spawnEnemy: (type: EnemyType) => void;
  activeEnemies: () => number;
  onWaveStart?: (wave: number, count: number) => void;
}

export class WaveManager {
  wave = 0;
  enemiesRemainingToSpawn = 0;
  private nextSpawnAt = 0;
  private betweenWaveUntil = 0;
  private configEnemies: EnemyType[] = ['grunt'];
  private spawnDelayMs = 600;
  private readonly callbacks: WaveCallbacks;

  constructor(_scene: Phaser.Scene, callbacks: WaveCallbacks) {
    this.callbacks = callbacks;
  }

  startNextWave(now: number): void {
    this.wave += 1;
    const cfg = getWaveConfig(this.wave);
    this.enemiesRemainingToSpawn = cfg.count;
    this.configEnemies = cfg.enemies;
    this.spawnDelayMs = cfg.spawnDelayMs;
    this.nextSpawnAt = now + 350;
    this.callbacks.onWaveStart?.(this.wave, cfg.count);
  }

  update(now: number): void {
    if (this.betweenWaveUntil > now) return;

    if (this.enemiesRemainingToSpawn > 0 && now >= this.nextSpawnAt) {
      this.enemiesRemainingToSpawn -= 1;
      this.nextSpawnAt = now + this.spawnDelayMs;

      const roll = Phaser.Math.RND.pick(this.configEnemies);
      this.callbacks.spawnEnemy(roll);
      return;
    }

    if (this.enemiesRemainingToSpawn === 0 && this.callbacks.activeEnemies() === 0) {
      this.betweenWaveUntil = now + 2500;
      this.startNextWave(this.betweenWaveUntil);
    }
  }

  totalRemaining(active: number): number {
    return this.enemiesRemainingToSpawn + active;
  }
}
