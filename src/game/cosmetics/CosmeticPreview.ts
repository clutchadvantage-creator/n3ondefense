import Phaser from 'phaser';
import { getCosmeticDisplayColor } from '../../data/cosmetics.ts';
import type { CosmeticOption } from '../types.ts';

export interface CosmeticPreviewOptions {
  maxWidth: number;
  maxHeight: number;
  operatorTextureKey?: string;
  projectileTextureKey?: string;
}

export interface CosmeticPreviewHandle {
  container: Phaser.GameObjects.Container;
  setColor: (color: number) => void;
}

/**
 * Native-canvas counterpart to the Storefront cosmetic visual. It reads the
 * same CosmeticOption category/shape/texture data so Garage cards show the
 * actual frame, projectile, trail, charge, turret, or fence design.
 */
export const createCosmeticPreview = (
  scene: Phaser.Scene,
  item: CosmeticOption,
  x: number,
  y: number,
  options: CosmeticPreviewOptions
): CosmeticPreviewHandle => {
  const container = scene.add.container(x, y);
  const colorSetters: Array<(color: number) => void> = [];
  const initialColor = getCosmeticDisplayColor(item, scene.time.now);
  const maxWidth = Math.max(12, options.maxWidth);
  const maxHeight = Math.max(12, options.maxHeight);

  const addImage = (textureKey: string, width = maxWidth, height = maxHeight): Phaser.GameObjects.Image => {
    const fallback = scene.textures.exists('player-circle') ? 'player-circle' : 'circle';
    const image = scene.add.image(0, 0, scene.textures.exists(textureKey) ? textureKey : fallback);
    const scale = Math.min(width / Math.max(1, image.width), height / Math.max(1, image.height));
    image.setScale(scale).setTint(initialColor);
    colorSetters.push((color) => image.setTint(color));
    container.add(image);
    return image;
  };

  const addRectangle = (offsetX: number, offsetY: number, width: number, height: number, alpha = 1): Phaser.GameObjects.Rectangle => {
    const rectangle = scene.add.rectangle(offsetX, offsetY, width, height, initialColor, alpha);
    colorSetters.push((color) => rectangle.setFillStyle(color, alpha));
    container.add(rectangle);
    return rectangle;
  };

  const addCircle = (offsetX: number, offsetY: number, radius: number, alpha = 1, strokeWidth = 0): Phaser.GameObjects.Arc => {
    const circle = scene.add.circle(offsetX, offsetY, radius, initialColor, alpha);
    if (strokeWidth > 0) circle.setStrokeStyle(strokeWidth, initialColor, 0.95);
    colorSetters.push((color) => {
      circle.setFillStyle(color, alpha);
      if (strokeWidth > 0) circle.setStrokeStyle(strokeWidth, color, 0.95);
    });
    container.add(circle);
    return circle;
  };

  switch (item.category) {
    case 'playerShape':
      addImage(item.textureKey ?? item.id);
      break;
    case 'playerColor':
      addImage(options.operatorTextureKey ?? 'player-circle');
      break;
    case 'projectileShape':
      addImage(item.textureKey ?? 'projectile-pulse', maxWidth, maxHeight * 0.72);
      break;
    case 'projectileColor':
      addImage(options.projectileTextureKey ?? 'projectile-pulse', maxWidth, maxHeight * 0.72);
      break;
    case 'trailColor':
    case 'dashTrail': {
      const streakWidth = maxWidth * 0.62;
      addRectangle(-maxWidth * 0.16, -maxHeight * 0.2, streakWidth, Math.max(2, maxHeight * 0.11), 0.22);
      addRectangle(-maxWidth * 0.08, 0, streakWidth * 0.82, Math.max(2, maxHeight * 0.13), 0.48);
      addRectangle(-maxWidth * 0.01, maxHeight * 0.2, streakWidth * 0.62, Math.max(2, maxHeight * 0.1), 0.78);
      const core = addCircle(maxWidth * 0.28, 0, Math.min(maxHeight * 0.24, maxWidth * 0.11), 0.95, 1);
      core.setFillStyle(0x07131d, 0.92);
      colorSetters[colorSetters.length - 1] = (color) => core.setFillStyle(0x07131d, 0.92).setStrokeStyle(1, color, 1);
      break;
    }
    case 'bombColor': {
      const radius = Math.min(maxWidth, maxHeight) * 0.26;
      addCircle(0, 0, radius, 0.18, Math.max(1, radius * 0.08));
      addCircle(0, 0, radius * 0.62, 0.72, Math.max(1, radius * 0.06));
      addCircle(0, 0, radius * 0.2, 1);
      break;
    }
    case 'turretSkin': {
      const unit = Math.min(maxWidth / 2.8, maxHeight / 2.5);
      addCircle(0, unit * 0.42, unit * 0.78, 0.12, 1);
      const base = addCircle(0, unit * 0.38, unit * 0.52, 0.12, 2);
      base.setFillStyle(0x07131d, 0.96);
      colorSetters[colorSetters.length - 1] = (color) => base.setFillStyle(0x07131d, 0.96).setStrokeStyle(2, color, 0.95);
      const housing = addRectangle(0, 0, unit * 1.02, unit * 0.76, 0.16).setStrokeStyle(2, initialColor, 1);
      colorSetters[colorSetters.length - 1] = (color) => housing.setFillStyle(0x102838, 1).setStrokeStyle(2, color, 1);
      housing.setFillStyle(0x102838, 1);
      addRectangle(0, -unit * 0.7, unit * 0.32, unit, 0.92).setStrokeStyle(1, 0xffffff, 0.72);
      addCircle(0, 0, unit * 0.16, 1);
      break;
    }
    case 'fenceStyle': {
      const fenceWidth = maxWidth * 0.88;
      const beam = addRectangle(0, 0, fenceWidth, Math.max(4, maxHeight * 0.14), 0.66).setStrokeStyle(2, initialColor, 1);
      colorSetters[colorSetters.length - 1] = (color) => beam.setFillStyle(color, 0.66).setStrokeStyle(2, color, 1);
      addCircle(-fenceWidth / 2, 0, Math.max(3, maxHeight * 0.13), 0.92, 1);
      addCircle(0, 0, Math.max(3, maxHeight * 0.11), 0.92, 1);
      addCircle(fenceWidth / 2, 0, Math.max(3, maxHeight * 0.13), 0.92, 1);
      break;
    }
  }

  return {
    container,
    setColor: (color: number) => colorSetters.forEach((setter) => setter(color))
  };
};
