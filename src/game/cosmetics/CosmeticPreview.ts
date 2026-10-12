import { LegacyBombVisual } from './LegacyBombVisual.ts';
import { isLegacyBomb } from './LegacyBombArt.ts';
import Phaser from 'phaser';
import { HalloweenBombsiteVisual } from './HalloweenBombsiteVisual.ts';
import { halloweenSetFromEffect } from './HalloweenCosmeticArt.ts';
import { HALLOWEEN_TIMING } from './HalloweenCelebrationTiming.ts';
import { SaveSystem } from '../systems/SaveSystem';
import { TugLifeWhistleVisual } from './TugLifeWhistleVisual.ts';
import { TUG_WHISTLE_LIFETIME_MS } from './TugLifeWhistleArt.ts';
import { getCosmeticById, getCosmeticDisplayColor, getProjectileDisplayColor, resolveOperativeFrameAppearance } from '../../data/cosmetics.ts';
import type { CosmeticOption } from '../types.ts';
import { createPremiumTurretVisual } from './PremiumTurretVisual.ts';
import { Fence } from '../abilities/Fence.ts';
import { resolveFenceAppearance } from './FenceCosmetics.ts';

export interface CosmeticPreviewOptions {
  /** Small configuration thumbnails are static. */
  animate?: boolean;
  maxWidth: number;
  maxHeight: number;
  operatorTextureKey?: string;
  operatorFrameId?: string | null;
  operativeColorId?: string | null;
  projectileTextureKey?: string;
  projectileShapeId?: string | null;
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
  const animatePreview = (config: Phaser.Types.Tweens.TweenBuilderConfig): void => {
    if (options.animate !== false && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) scene.tweens.add(config);
  };
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
    const halloween = halloweenSetFromEffect(item.bombExplosionEffect);
    if (halloween) {
      const visual = new HalloweenBombsiteVisual(scene);
      container.add(visual.root);
      const reduced = !SaveSystem.get().settings.particles || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      previewUpdater = time => visual.update(halloween, 0, size * .18, size * .38,
        options.animate === false || window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1_400 : time % HALLOWEEN_TIMING.end, reduced);
      previewUpdater(scene.time.now);
      return true;
    }
    if (item.bombExplosionEffect === 'tug-life') {
      const visual = new TugLifeWhistleVisual(scene);
      container.add(visual.root);
      previewUpdater = time => visual.update(0, size * .4, size * .5, time % TUG_WHISTLE_LIFETIME_MS, false);
      previewUpdater(scene.time.now);
      return true;
    }
    if(isLegacyBomb(item.bombExplosionEffect)) {
      const effect=item.bombExplosionEffect, visual=new LegacyBombVisual(scene);
      container.add(visual.root);
      previewUpdater=time=>visual.update(effect,0,size*.15,size*.38,options.animate===false?1000:time%2700,!SaveSystem.get().settings.particles);
      previewUpdater(scene.time.now);
      return true;
    }
    return false;
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
    case 'projectileColor': {
      const native = item.colorMode === 'native';
      const shape = getCosmeticById(options.projectileShapeId);
      addImage(item.previewIcon ?? options.projectileTextureKey ?? 'projectile-pulse', maxWidth, maxHeight * 0.72,
        native && shape?.preserveNativePalette ? null
          : native ? getProjectileDisplayColor(options.projectileShapeId, item.id, scene.time.now) : initialColor);
      break;
    }
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
      animatePreview({ targets: wake, alpha: { from: 0.58, to: 1 }, scaleX: { from: 0.88, to: 1.04 }, duration: 780, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
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
      animatePreview({
        targets: [armedRing, armedCore],
        alpha: { from: 0.42, to: 1 },
        scaleX: { from: 0.86, to: 1.12 },
        scaleY: { from: 0.86, to: 1.12 },
        duration: 760,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
      animatePreview({ targets: art, angle: { from: -1.2, to: 1.2 }, duration: 1_800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      container.once('destroy', () => {
        scene.tweens.killTweensOf(art);
        scene.tweens.killTweensOf([armedRing, armedCore]);
      });
      break;
    }
    case 'fenceStyle': {
      const fence = new Fence(scene,0,20,0,initialColor,120,Number.MAX_SAFE_INTEGER,100,0,1,resolveFenceAppearance(item));
      container.add(fence.sprite);
      fence.sprite.setScale(Math.min(maxWidth/150,maxHeight/46));
      colorSetters.push(color=>fence.setColor(color));
      const started=scene.time.now;
      previewUpdater=time=>fence.updateCosmetic(options.animate===false?started+1000:time+1000);
      previewUpdater(started);
      break;
    }
  }

  return {
    container,
    setColor: (color: number) => colorSetters.forEach((setter) => setter(color)),
    update: previewUpdater
  };
};
