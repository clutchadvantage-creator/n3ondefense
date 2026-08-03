import type { EnemyType } from '../game/types';

export interface WaveEntry {
  count: number;
  spawnDelayMs: number;
  enemies: EnemyType[];
  specialChance: number;
}

export const getWaveConfig = (wave: number): WaveEntry => {
  const baseCount = 6 + Math.floor(wave * 1.8);
  const shooterUnlock = wave >= 2;
  const defuserUnlock = wave >= 1;
  const tankUnlock = wave >= 4;
  const disruptorUnlock = wave >= 6;

  const enemies: EnemyType[] = ['grunt'];
  if (shooterUnlock) enemies.push('shooter');
  if (defuserUnlock) enemies.push('defuser');
  if (tankUnlock) enemies.push('tank');
  if (disruptorUnlock) enemies.push('disruptor');

  return {
    count: baseCount,
    spawnDelayMs: Math.max(240, 650 - wave * 22),
    enemies,
    specialChance: Math.min(0.45, 0.12 + wave * 0.03)
  };
};
