import type Phaser from 'phaser';
import { publicAssetUrl } from '../utils/assetUrl';

export const BOSS_MODEL_PARTS = [
  'artillery-chassis', 'artillery-gun',
  'storm-mage-chassis', 'storm-mage-rotor',
  'void-brawler-chassis', 'void-brawler-hammer', 'void-brawler-shield',
  'artillery-leg-upper', 'artillery-leg-lower', 'artillery-leg-foot',
  'artillery-leg-joint', 'storm-mage-leg-joint', 'void-brawler-leg-joint',
  'storm-mage-leg-upper', 'storm-mage-leg-lower', 'storm-mage-leg-foot',
  'void-brawler-leg-upper', 'void-brawler-leg-lower', 'void-brawler-leg-foot'
] as const;

export function preloadBossModels(scene: Phaser.Scene): void {
  for (const part of BOSS_MODEL_PARTS) scene.load.image(`rwg-${part}`, publicAssetUrl(`assets/bosses/${part}.png`));
}
