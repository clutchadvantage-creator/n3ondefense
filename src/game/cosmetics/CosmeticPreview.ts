import Phaser from 'phaser';
import { getCosmeticDisplayColor, resolveOperativeFrameAppearance } from '../../data/cosmetics.ts';
import type { CosmeticOption } from '../types.ts';
import { createPremiumTurretVisual } from './PremiumTurretVisual.ts';

export interface CosmeticPreviewOptions {
  maxWidth: number;
  maxHeight: number;
  operatorTextureKey?: string;
  operatorFrameId?: string | null;
  operativeColorId?: string | null;
  projectileTextureKey?: string;
}

export interface CosmeticPreviewHandle {
  container: Phaser.GameObjects.Container;
  setColor: (color: number) => void;
  update?: (timeMs: number) => void;
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
  let previewUpdater: ((timeMs: number) => void) | undefined;
  const operativeAppearance = item.category === 'playerShape'
    ? resolveOperativeFrameAppearance(item.id, options.operativeColorId, scene.time.now)
    : item.category === 'playerColor'
      ? resolveOperativeFrameAppearance(options.operatorFrameId, item.id, scene.time.now)
      : null;
  const initialColor = operativeAppearance?.primaryColor ?? (item.colorMode === 'prism'
    ? getCosmeticDisplayColor(item, scene.time.now)
    : item.previewColor ?? getCosmeticDisplayColor(item, scene.time.now));
  const maxWidth = Math.max(12, options.maxWidth);
  const maxHeight = Math.max(12, options.maxHeight);

  const addImage = (textureKey: string, width = maxWidth, height = maxHeight, tint: number | null = initialColor): Phaser.GameObjects.Image => {
    const fallback = scene.textures.exists('player-circle') ? 'player-circle' : 'circle';
    const resolvedTexture = scene.textures.exists(textureKey) ? textureKey : fallback;
    const image = scene.add.image(0, 0, resolvedTexture);
    const scale = Math.min(width / Math.max(1, image.width), height / Math.max(1, image.height));
    const previewScale = Phaser.Math.Clamp(item.previewScale ?? 1, 0.7, 1.1);
    image
      .setPosition(item.previewOffsetX ?? 0, item.previewOffsetY ?? 0)
      .setScale(scale * previewScale);
    if (tint === null && resolvedTexture === textureKey) image.clearTint();
    else image.setTint(tint ?? initialColor);
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
    } else if (item.bombExplosionEffect === 'neon-bats') {
      const bats = scene.add.graphics();
      for (let index = 0; index < 9; index += 1) {
        const angle = index * 2.399963229728653;
        const distance = size * (0.1 + index % 4 * 0.075);
        const x = Math.cos(angle) * distance;
        const y = Math.sin(angle) * distance;
        const unit = size * (index === 0 ? 0.11 : 0.055);
        const color = index % 3 === 0 ? 0x65efff : index % 2 ? 0xff55ce : 0xb35cff;
        bats.fillStyle(color, 0.68);
        bats.fillTriangle(x, y, x - unit * 1.8, y - unit, x - unit * 0.55, y + unit * 0.7);
        bats.fillTriangle(x, y, x + unit * 1.8, y - unit, x + unit * 0.55, y + unit * 0.7);
        bats.fillStyle(0x090311, 0.9).fillEllipse(x, y, unit * 0.48, unit * 1.5);
      }
      heroLayer.add(bats);
      scene.tweens.add({ targets: heroLayer, alpha: { from: 0.25, to: 1 }, scaleX: { from: 0.45, to: 1.15 }, scaleY: { from: 0.7, to: 1.08 }, angle: { from: -18, to: 22 }, duration: 1_150, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    } else if (item.bombExplosionEffect === 'witch-signal') {
      const witch = scene.add.graphics();
      const faceWidth = size * 0.45;
      const faceHeight = size * 0.48;
      witch.fillStyle(0x75ff73, 0.2).fillEllipse(0, size * 0.08, faceWidth, faceHeight);
      witch.lineStyle(Math.max(2, size * 0.018), 0x75ff73, 0.96).strokeEllipse(0, size * 0.08, faceWidth, faceHeight);
      witch.fillStyle(0xc65cff, 0.42).fillTriangle(-faceWidth * 0.5, -faceHeight * 0.22, faceWidth * 0.42, -faceHeight * 0.22, 0, -size * 0.47);
      witch.lineStyle(Math.max(3, size * 0.024), 0xff5fcf, 0.94).lineBetween(-faceWidth * 0.72, -faceHeight * 0.19, faceWidth * 0.72, -faceHeight * 0.19);
      witch.fillStyle(0x020806, 0.9).fillCircle(-faceWidth * 0.18, size * 0.03, size * 0.027).fillCircle(faceWidth * 0.18, size * 0.03, size * 0.027);
      witch.fillStyle(0xfff47a, 0.9).fillCircle(-faceWidth * 0.18, size * 0.03, size * 0.009).fillCircle(faceWidth * 0.18, size * 0.03, size * 0.009);
      witch.lineStyle(Math.max(1.4, size * 0.012), 0xfff47a, 0.9);
      witch.beginPath(); witch.arc(0, size * 0.08, faceWidth * 0.2, 0.12, Math.PI - 0.12, false); witch.strokePath();
      heroLayer.add(witch);
      scene.tweens.add({ targets: heroLayer, y: { from: size * 0.08, to: -size * 0.08 }, angle: { from: -3, to: 3 }, alpha: { from: 0.42, to: 1 }, duration: 1_250, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
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
      addImage(item.previewIcon ?? operativeAppearance?.textureKey ?? item.textureKey ?? item.id, maxWidth, maxHeight, operativeAppearance ? operativeAppearance.tint : initialColor);
      break;
    case 'playerColor':
      addImage(item.previewIcon ?? operativeAppearance?.textureKey ?? options.operatorTextureKey ?? 'player-circle', maxWidth, maxHeight, operativeAppearance ? operativeAppearance.tint : initialColor);
      break;
    case 'projectileShape':
      addImage(
        item.previewIcon ?? item.textureKey ?? 'projectile-pulse',
        maxWidth,
        maxHeight * 0.72,
        item.preserveNativePalette ? null : initialColor
      );
      break;
    case 'projectileColor':
      addImage(item.previewIcon ?? options.projectileTextureKey ?? 'projectile-pulse', maxWidth, maxHeight * 0.72);
      break;
    case 'dashTrail': {
      const effect = item.dashTrailEffect ?? 'ion';
      const wake = scene.add.graphics();
      container.add(wake);
      const drawWake = (color: number): void => {
        wake.clear();
        const length = maxWidth * 0.72;
        if (effect === 'fire-smoke') {
          wake.fillStyle(0x59636d, 0.2).fillEllipse(-length * 0.35, -maxHeight * 0.16, length * 0.75, maxHeight * 0.32);
          wake.fillStyle(0xff5726, 0.72).fillTriangle(maxWidth * 0.28, 0, -length * 0.34, -maxHeight * 0.22, -length * 0.05, 0);
          wake.fillStyle(0xffe77a, 0.92).fillTriangle(maxWidth * 0.28, 0, -length * 0.08, -maxHeight * 0.09, length * 0.06, 0);
        } else if (effect === 'grass-clippings') {
          for (let index = 0; index < 13; index += 1) {
            const x = -length * 0.48 + index % 7 * length * 0.12;
            const y = (index % 3 - 1) * maxHeight * 0.17;
            wake.lineStyle(Math.max(1.5, maxHeight * 0.025), index % 3 ? color : 0xd9ff65, 0.88);
            wake.lineBetween(x, y, x + maxWidth * 0.055, y + (index % 2 ? -1 : 1) * maxHeight * 0.12);
          }
        } else if (effect === 'bubbles') {
          for (let index = 0; index < 9; index += 1) {
            const radius = maxHeight * (0.045 + index % 3 * 0.018);
            const x = -length * 0.5 + index * length * 0.115;
            const y = (index % 3 - 1) * maxHeight * 0.16;
            wake.lineStyle(Math.max(1, radius * 0.18), index % 2 ? color : 0xff84df, 0.82).strokeCircle(x, y, radius);
          }
        } else if (effect === 'plasma') {
          wake.lineStyle(Math.max(2, maxHeight * 0.045), color, 0.84).beginPath();
          wake.moveTo(-length * 0.55, maxHeight * 0.12);
          wake.lineTo(-length * 0.35, -maxHeight * 0.18);
          wake.lineTo(-length * 0.16, maxHeight * 0.08);
          wake.lineTo(length * 0.02, -maxHeight * 0.11);
          wake.lineTo(length * 0.24, 0);
          wake.strokePath();
          wake.lineStyle(Math.max(1, maxHeight * 0.02), 0x65efff, 0.92).lineBetween(-length * 0.4, maxHeight * 0.22, length * 0.15, -maxHeight * 0.18);
        } else if (effect === 'jet-plume') {
          wake.fillStyle(0x697884, 0.2).fillEllipse(-length * 0.42, 0, length * 0.8, maxHeight * 0.28);
          wake.fillStyle(0xffa94d, 0.64).fillTriangle(maxWidth * 0.28, 0, -length * 0.52, -maxHeight * 0.13, -length * 0.52, maxHeight * 0.13);
          wake.fillStyle(0x78f4ff, 0.9).fillTriangle(maxWidth * 0.28, 0, -length * 0.2, -maxHeight * 0.065, -length * 0.2, maxHeight * 0.065);
          for (let index = 1; index <= 3; index += 1) wake.lineStyle(1.4, index % 2 ? 0xffffff : 0xffb64d, 0.75).strokeRect(maxWidth * 0.13 - index * length * 0.15, -maxHeight * 0.045, maxHeight * 0.09, maxHeight * 0.09);
        } else if (effect === 'stars') {
          for (let index = 0; index < 9; index += 1) {
            const x = -length * 0.5 + index * length * 0.11;
            const y = (index % 3 - 1) * maxHeight * 0.17;
            const radius = maxHeight * (0.035 + index % 2 * 0.025);
            wake.fillStyle(index % 3 ? color : 0xff72d7, 0.9);
            wake.fillTriangle(x, y - radius, x - radius * 0.35, y + radius * 0.4, x + radius * 0.35, y + radius * 0.4);
            wake.fillTriangle(x, y + radius, x - radius * 0.35, y - radius * 0.4, x + radius * 0.35, y - radius * 0.4);
          }
        } else {
          wake.fillStyle(color, 0.22).fillRect(-length * 0.52, -maxHeight * 0.18, length, maxHeight * 0.1);
          wake.fillStyle(color, 0.48).fillRect(-length * 0.42, -maxHeight * 0.03, length * 0.86, maxHeight * 0.12);
          wake.fillStyle(color, 0.78).fillRect(-length * 0.3, maxHeight * 0.16, length * 0.67, maxHeight * 0.09);
        }
      };
      drawWake(initialColor);
      colorSetters.push(drawWake);
      const core = addCircle(maxWidth * 0.3, 0, Math.min(maxHeight * 0.24, maxWidth * 0.11), 0.95, 1);
      core.setFillStyle(0x07131d, 0.92);
      colorSetters[colorSetters.length - 1] = (color) => core.setFillStyle(0x07131d, 0.92).setStrokeStyle(1, color, 1);
      scene.tweens.add({ targets: wake, alpha: { from: 0.58, to: 1 }, scaleX: { from: 0.88, to: 1.04 }, duration: 780, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      container.once('destroy', () => scene.tweens.killTweensOf(wake));
      break;
    }
    case 'trailColor': {
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
      if (item.turretSkinEffect) {
        const premium = createPremiumTurretVisual(
          scene,
          item.turretSkinEffect,
          initialColor,
          item.accentColor ?? initialColor,
          Math.min(maxWidth / 52, maxHeight / 64)
        );
        container.add(premium.root);
        colorSetters.push(premium.setColor);
        previewUpdater = premium.update;
        break;
      }
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
    case 'mineFrame': {
      const art = addImage(item.textureKey ?? 'mine-frame-default', maxWidth, maxHeight, null);
      const ringRadius = Math.min(maxWidth, maxHeight) * 0.16;
      const armedRing = addCircle(0, 0, ringRadius, 0.06, Math.max(1, ringRadius * 0.1));
      const armedCore = addCircle(0, 0, Math.max(2, ringRadius * 0.28), 0.9, 1);
      scene.tweens.add({
        targets: [armedRing, armedCore],
        alpha: { from: 0.42, to: 1 },
        scaleX: { from: 0.86, to: 1.12 },
        scaleY: { from: 0.86, to: 1.12 },
        duration: 760,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
      scene.tweens.add({ targets: art, angle: { from: -1.2, to: 1.2 }, duration: 1_800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      container.once('destroy', () => {
        scene.tweens.killTweensOf(art);
        scene.tweens.killTweensOf([armedRing, armedCore]);
      });
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
    setColor: (color: number) => colorSetters.forEach((setter) => setter(color)),
    update: previewUpdater
  };
};
