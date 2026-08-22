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
  const initialColor = item.colorMode === 'prism'
    ? getCosmeticDisplayColor(item, scene.time.now)
    : item.previewColor ?? getCosmeticDisplayColor(item, scene.time.now);
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

  const addBombSignaturePreview = (): boolean => {
    if (!item.bombExplosionEffect) return false;
    const size = Math.min(maxWidth, maxHeight);
    const signature = scene.add.container(0, 0);
    const rotatingLayer = scene.add.container(0, 0);
    const heroLayer = scene.add.container(0, 0);
    container.add([rotatingLayer, signature, heroLayer]);
    const animatedTargets: Phaser.GameObjects.GameObject[] = [rotatingLayer, signature, heroLayer];

    if (item.bombExplosionEffect === 'death-signal') {
      const ring = scene.add.circle(0, 0, size * 0.4, 0x62efff, 0.025).setStrokeStyle(Math.max(1, size * 0.018), 0xff58cf, 0.68);
      const segments = scene.add.graphics();
      segments.lineStyle(Math.max(1, size * 0.018), 0x69efff, 0.72);
      for (let index = 0; index < 8; index += 1) {
        const angle = index * Math.PI * 0.25;
        segments.beginPath();
        segments.arc(0, 0, size * 0.34, angle, angle + 0.13, false);
        segments.strokePath();
      }
      rotatingLayer.add([ring, segments]);

      const skull = scene.add.graphics();
      const drawSkull = (color: number): void => {
        skull.clear();
        const width = size * 0.56;
        const height = size * 0.64;
        skull.fillStyle(0x02050a, 0.76);
        skull.fillEllipse(0, -height * 0.12, width * 0.92, height * 0.65);
        skull.lineStyle(Math.max(1.5, size * 0.026), color, 0.96);
        skull.strokeEllipse(0, -height * 0.12, width * 0.9, height * 0.64);
        skull.beginPath();
        skull.moveTo(-width * 0.42, -height * 0.02);
        skull.lineTo(-width * 0.34, height * 0.18);
        skull.lineTo(-width * 0.2, height * 0.36);
        skull.lineTo(-width * 0.09, height * 0.45);
        skull.lineTo(width * 0.09, height * 0.45);
        skull.lineTo(width * 0.2, height * 0.36);
        skull.lineTo(width * 0.34, height * 0.18);
        skull.lineTo(width * 0.42, -height * 0.02);
        skull.strokePath();
        skull.fillStyle(0x010208, 0.96);
        skull.fillEllipse(-width * 0.2, -height * 0.1, width * 0.2, height * 0.17);
        skull.fillEllipse(width * 0.2, -height * 0.1, width * 0.2, height * 0.17);
        skull.fillStyle(0x68efff, 0.86);
        skull.fillCircle(-width * 0.2, -height * 0.1, Math.max(2, size * 0.025));
        skull.fillStyle(0xff58cf, 0.86);
        skull.fillCircle(width * 0.2, -height * 0.1, Math.max(2, size * 0.025));
        skull.fillTriangle(0, 0, -width * 0.055, height * 0.12, width * 0.055, height * 0.12);
        skull.lineStyle(Math.max(1, size * 0.012), 0xffffff, 0.68);
        skull.lineBetween(-width * 0.2, height * 0.28, width * 0.2, height * 0.28);
        for (let tooth = -2; tooth <= 2; tooth += 1) {
          const toothX = tooth * width * 0.07;
          skull.lineBetween(toothX, height * 0.22, toothX, height * 0.35);
        }
      };
      drawSkull(initialColor);
      colorSetters.push(drawSkull);
      heroLayer.add(skull);
      scene.tweens.add({ targets: heroLayer, alpha: { from: 0, to: 1 }, scaleX: { from: 0.34, to: 1.06 }, scaleY: { from: 0.34, to: 1.06 }, y: { from: size * 0.12, to: -size * 0.08 }, duration: 620, hold: 1_240, yoyo: true, repeat: -1, repeatDelay: 120, ease: 'Back.easeOut' });
      scene.tweens.add({ targets: rotatingLayer, angle: 360, duration: 4_600, repeat: -1 });
    } else {
      const blooms = scene.add.graphics();
      const flowerColors = [0xff63d7, 0x64efff, 0xffe76a, 0x9f76ff, 0x76ff8f, 0xffa54f];
      const drawFlower = (x: number, y: number, radius: number, petals: number, color: number, rotation: number): void => {
        for (let petal = 0; petal < petals; petal += 1) {
          const angle = rotation + petal / petals * Math.PI * 2;
          blooms.fillStyle(color, 0.26);
          blooms.fillCircle(x + Math.cos(angle) * radius * 0.58, y + Math.sin(angle) * radius * 0.58, radius * 0.42);
          blooms.lineStyle(Math.max(1, radius * 0.07), color, 0.92);
          blooms.strokeCircle(x + Math.cos(angle) * radius * 0.58, y + Math.sin(angle) * radius * 0.58, radius * 0.4);
        }
        blooms.fillStyle(0xffffff, 0.92);
        blooms.fillCircle(x, y, radius * 0.2);
      };
      drawFlower(0, 0, size * 0.22, 8, flowerColors[0], 0);
      drawFlower(-size * 0.25, size * 0.08, size * 0.12, 6, flowerColors[2], 0.3);
      drawFlower(size * 0.24, -size * 0.1, size * 0.14, 7, flowerColors[1], -0.2);
      drawFlower(size * 0.2, size * 0.2, size * 0.09, 5, flowerColors[4], 0.6);
      drawFlower(-size * 0.16, -size * 0.23, size * 0.08, 5, flowerColors[3], 0.1);
      heroLayer.add(blooms);
      const petals = scene.add.graphics();
      for (let index = 0; index < 13; index += 1) {
        const angle = index * 2.399963229728653;
        const distance = size * (0.28 + index % 4 * 0.045);
        petals.fillStyle(flowerColors[index % flowerColors.length], 0.82);
        petals.fillRect(Math.cos(angle) * distance, Math.sin(angle) * distance, Math.max(2, size * 0.025), Math.max(1, size * 0.012));
      }
      rotatingLayer.add(petals);
      scene.tweens.add({ targets: heroLayer, alpha: { from: 0, to: 1 }, scaleX: { from: 0.05, to: 1.08 }, scaleY: { from: 0.05, to: 1.08 }, angle: { from: -24, to: 18 }, duration: 680, hold: 1_180, yoyo: true, repeat: -1, repeatDelay: 110, ease: 'Back.easeOut' });
      scene.tweens.add({ targets: rotatingLayer, angle: 220, scaleX: { from: 0.42, to: 1.18 }, scaleY: { from: 0.42, to: 1.18 }, alpha: { from: 0.18, to: 0.82 }, duration: 1_700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }

    container.once('destroy', () => animatedTargets.forEach((target) => scene.tweens.killTweensOf(target)));
    return true;
  };

  switch (item.category) {
    case 'playerShape':
      addImage(item.previewIcon ?? item.textureKey ?? item.id);
      break;
    case 'playerColor':
      addImage(item.previewIcon ?? options.operatorTextureKey ?? 'player-circle');
      break;
    case 'projectileShape':
      addImage(item.previewIcon ?? item.textureKey ?? 'projectile-pulse', maxWidth, maxHeight * 0.72);
      break;
    case 'projectileColor':
      addImage(item.previewIcon ?? options.projectileTextureKey ?? 'projectile-pulse', maxWidth, maxHeight * 0.72);
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
      if (addBombSignaturePreview()) break;
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
