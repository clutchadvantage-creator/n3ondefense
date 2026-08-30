import Phaser from 'phaser';
import { MOD_BY_ID } from './definitions.ts';
import type { ModCardInstance, ModRank } from './types.ts';
import { MOD_INFUSION_BY_ID } from './infusions.ts';
import { AudioManager } from '../systems/AudioManager.ts';
import type { HudAnimationLevel } from '../config/interfaceSettings.ts';
import { registerUiFocusable } from '../input/UiNavigationController.ts';
import { PlayerProfileStore } from '../state/PlayerProfileStore.ts';
import {
  SupremeModCardEffects,
  type SupremeCardPresentationState
} from './SupremeModCardEffects.ts';

export const MOD_RARITY_COLORS = {
  common: 0xffffff,
  uncommon: 0x55ff88,
  rare: 0x38b6ff,
  epic: 0xc05cff,
  legendary: 0xff8a00,
  supreme: 0xe8ffff
} as const;

export interface ModCardViewOptions {
  width?: number;
  height?: number;
  selected?: boolean;
  compact?: boolean;
  interactive?: boolean;
  equipped?: boolean;
  duplicateCount?: number;
  rankLabel?: string;
  motion?: HudAnimationLevel;
  presentationState?: SupremeCardPresentationState;
  focusId?: string;
  focusModalDepth?: number;
  focusDefaultPriority?: number;
  focusLocked?: boolean;
  focusGroup?: string;
}

const resolveCardMotion = (requested?: HudAnimationLevel): HudAnimationLevel => {
  if (requested) return requested;
  try {
    return PlayerProfileStore.getActiveSave().settings.hud.animation;
  } catch {
    return 'full';
  }
};

export const createModCardView = (
  scene: Phaser.Scene,
  x: number,
  y: number,
  card: ModCardInstance,
  rank: ModRank,
  options: ModCardViewOptions = {}
): Phaser.GameObjects.Container => {
  const definition = MOD_BY_ID.get(card.modId);
  if (!definition) return scene.add.container(x, y);
  const width = options.width ?? 150;
  const height = options.height ?? 210;
  const corrupted = definition.variant === 'corrupted';
  const supreme = definition.rarity === 'supreme';
  const rarityColor = MOD_RARITY_COLORS[definition.rarity];
  const iconColor = definition.iconColor;
  const iconCssColor = Phaser.Display.Color.IntegerToColor(iconColor).rgba;
  const container = scene.add.container(x, y);
  const compact = options.compact === true;
  const rarityFontSize = Math.round(compact
    ? Phaser.Math.Clamp(width * 0.07, 9, 13)
    : Phaser.Math.Clamp(width * 0.067, 12, 14));
  const nameFontSize = Math.round(compact
    ? Phaser.Math.Clamp(width * 0.086, 11, 16)
    : Phaser.Math.Clamp(width * 0.081, 15, 18));
  const statFontSize = Math.round(compact
    ? Phaser.Math.Clamp(width * 0.076, 10, 14)
    : Phaser.Math.Clamp(width * 0.072, 14, 16));
  const infusionFontSize = Math.round(compact
    ? Phaser.Math.Clamp(width * 0.066, 9, 12)
    : Phaser.Math.Clamp(width * 0.06, 11, 13));
  const shadow = scene.add.rectangle(4, 6, width, height, 0x000000, 0.45).setOrigin(0.5);
  const body = scene.add.rectangle(0, 0, width, height, corrupted ? 0x190817 : supreme ? 0x030c14 : 0x091521, 0.97)
    .setStrokeStyle(options.selected ? 4 : supreme ? 3 : 2, options.selected ? 0xffffff : rarityColor, 1);
  const inner = scene.add.rectangle(0, 0, width - 12, height - 12, corrupted ? 0x4d0d42 : rarityColor, 0.05)
    .setStrokeStyle(1, corrupted ? 0xff3ed7 : rarityColor, 0.38);
  const sheen = scene.add.graphics();
  container.add([shadow, body, inner]);

  let supremeEffects: SupremeModCardEffects | null = null;
  let supremeMotion: HudAnimationLevel = 'full';
  let supremeBadgeTween: Phaser.Tweens.Tween | null = null;
  if (supreme) {
    supremeMotion = resolveCardMotion(options.motion);
    supremeEffects = new SupremeModCardEffects(scene, {
      modId: definition.id,
      width,
      height,
      iconY: -height * 0.12,
      iconColor,
      equipped: options.equipped === true,
      detail: supremeMotion === 'off' ? 'static' : compact || width < 160 ? 'reduced' : 'full',
      motion: supremeMotion,
      presentationState: options.presentationState ?? 'idle'
    });
    container.add(supremeEffects.root);
    container.once('destroy', () => supremeEffects?.dispose());
  }

  const corruptionTweens: Phaser.Tweens.Tween[] = [];
  if (corrupted) {
    let seed = Array.from(definition.id).reduce((value, character) => Math.imul(value ^ character.charCodeAt(0), 16777619), 2166136261) >>> 0;
    const random = (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
    for (let index = 0; index < 7; index += 1) {
      const blotch = scene.add.graphics();
      const centerX = (random() - 0.5) * width * 0.78;
      const centerY = (random() - 0.5) * height * 0.78;
      const radius = width * (0.045 + random() * 0.06);
      const points: Phaser.Geom.Point[] = [];
      for (let point = 0; point < 8; point += 1) {
        const angle = Phaser.Math.PI2 * point / 8;
        const reach = radius * (0.55 + random() * 0.7);
        points.push(new Phaser.Geom.Point(centerX + Math.cos(angle) * reach, centerY + Math.sin(angle) * reach));
      }
      blotch.fillStyle(index % 3 === 0 ? 0x050107 : 0xff22c8, index % 3 === 0 ? 0.48 : 0.12);
      blotch.fillPoints(points, true);
      blotch.lineStyle(1, index % 2 === 0 ? 0xff36d1 : 0x71235f, 0.25).strokePoints(points, true);
      container.add(blotch);
      corruptionTweens.push(scene.tweens.add({
        targets: blotch,
        alpha: { from: 0.3 + random() * 0.25, to: 0.75 + random() * 0.2 },
        scaleX: { from: 0.86, to: 1.14 },
        scaleY: { from: 1.12, to: 0.88 },
        angle: { from: -4 - random() * 4, to: 4 + random() * 4 },
        duration: 760 + Math.round(random() * 900),
        delay: Math.round(random() * 500),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      }));
    }
  }

  const illuminatedDots = rank;
  const rankDotRadius = compact ? 4 : Phaser.Math.Clamp(width * 0.028, 4, 6);
  const rankDotGap = compact ? 12 : rankDotRadius * 3;
  for (let dot = 0; dot < 3; dot += 1) {
    container.add(scene.add.circle(-width / 2 + 15 + dot * rankDotGap, -height / 2 + 15, rankDotRadius, dot < illuminatedDots ? rarityColor : 0x172331, dot < illuminatedDots ? 1 : 0.7)
      .setStrokeStyle(1, rarityColor, 0.9));
  }
  const rankLabel = scene.add.text(-width / 2 + 15 + rankDotGap * 2 + rankDotRadius + 5, -height / 2 + 15, options.rankLabel ?? (compact ? `R${rank}` : `R${rank}/${definition.maxRank}`), {
    fontFamily: 'Rajdhani, sans-serif', fontSize: `${compact ? Phaser.Math.Clamp(width * 0.062, 9, 12) : Phaser.Math.Clamp(width * 0.055, 11, 13)}px`,
    fontStyle: 'bold', color: '#b9dce5'
  }).setOrigin(0, 0.5).setVisible(!compact || width >= 112);
  const rarity = scene.add.text(width / 2 - 8, -height / 2 + 9, corrupted ? 'CORRUPTED' : definition.rarity.toUpperCase(), {
    fontFamily: supreme ? 'Orbitron, sans-serif' : 'Rajdhani, sans-serif', fontSize: `${rarityFontSize}px`, fontStyle: 'bold', color: corrupted ? '#ff5bd9' : Phaser.Display.Color.IntegerToColor(rarityColor).rgba,
    letterSpacing: supreme ? 1 : 0
  }).setOrigin(1, 0);
  if (supreme) rarity.setShadow(0, 0, '#80f8ff', 7, true, true);
  const iconRing = scene.add.circle(0, -height * 0.12, width * 0.25, iconColor, corrupted ? 0.13 : 0.09)
    .setStrokeStyle(supreme ? 3 : 2, corrupted ? 0xff4ddd : supreme ? 0xf1ffff : iconColor, supreme ? 0.92 : 0.82);
  const icon = scene.add.text(0, -height * 0.12, definition.icon, {
    fontFamily: 'Orbitron, sans-serif', fontSize: `${Math.max(24, width * 0.25)}px`, color: iconCssColor
  }).setOrigin(0.5).setShadow(0, 0, supreme ? '#9ffcff' : iconCssColor, supreme ? 10 : 0, true, true);
  const name = scene.add.text(0, height * 0.075, definition.name.toUpperCase(), {
    fontFamily: 'Orbitron, sans-serif', fontSize: `${nameFontSize}px`, color: '#f4fdff', align: 'center', lineSpacing: compact ? -1 : 1
  }).setOrigin(0.5, 0).setWordWrapWidth(width - 18, true).setMaxLines(2).setShadow(0, 1, '#02050a', 4, true, false);
  const stat = scene.add.text(0, height * 0.25, definition.rankDescriptions[rank], {
    fontFamily: 'Rajdhani, sans-serif', fontSize: `${statFontSize}px`, color: '#d8f2f8', align: 'center', lineSpacing: compact ? 0 : 2
  }).setOrigin(0.5, 0).setWordWrapWidth(width - 18, true).setMaxLines(compact && card.infusionId ? 2 : 3);
  const infusion = scene.add.text(0, height / 2 - 10, card.infusionId ? `◆ ${MOD_INFUSION_BY_ID.get(card.infusionId)?.name.toUpperCase() ?? 'INFUSED'}` : '', {
    fontFamily: 'Rajdhani, sans-serif', fontSize: `${infusionFontSize}px`, fontStyle: 'bold', color: '#a5fff0', align: 'center'
  }).setOrigin(0.5, 1);
  const supremeRule = supreme
    ? scene.add.text(0, height / 2 - (card.infusionId ? 27 : 8), 'SUPREME OD ONLY\nANY SLOT // 2 MAX', {
      fontFamily: 'Rajdhani, sans-serif',
      fontSize: `${compact ? Phaser.Math.Clamp(width * 0.052, 8, 10) : Phaser.Math.Clamp(width * 0.05, 10, 12)}px`,
      fontStyle: 'bold', color: '#dfffff', align: 'center', letterSpacing: 1, lineSpacing: -2
    }).setOrigin(0.5, 1).setShadow(0, 0, '#7cf8ff', 5, true, true)
    : null;
  if (supreme) {
    const badgeWidth = Math.max(compact ? 54 : 68, rarity.displayWidth + (compact ? 18 : 24));
    const badgeHeight = Math.max(compact ? 15 : 19, rarity.displayHeight + 6);
    const badgeX = width / 2 - 8 - badgeWidth / 2;
    const badgeY = -height / 2 + 9 + badgeHeight / 2;
    const badge = scene.add.rectangle(badgeX, badgeY, badgeWidth, badgeHeight, 0x071825, 0.92)
      .setStrokeStyle(1, 0xeaffff, 0.82);
    const badgeSpectral = scene.add.rectangle(badgeX, badgeY + badgeHeight / 2 - 2, badgeWidth - 6, 2, 0xff62d9, 0.72)
      .setBlendMode(Phaser.BlendModes.ADD);
    const badgeEmblem = scene.add.star(badgeX - badgeWidth / 2 + (compact ? 7 : 9), badgeY, 4, compact ? 1.5 : 2, compact ? 4 : 5, 0xdfffff, 0.96)
      .setStrokeStyle(1, 0xff6fe3, 0.8);
    container.add([badge, badgeSpectral, badgeEmblem]);
    if (supremeMotion !== 'off') {
      supremeBadgeTween = scene.tweens.add({
        targets: badgeSpectral,
        x: { from: badgeX - badgeWidth * 0.22, to: badgeX + badgeWidth * 0.22 },
        alpha: { from: 0.22, to: 0.92 },
        duration: compact ? 2800 : 1900,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
      container.once('destroy', () => supremeBadgeTween?.remove());
    }
    const textPlate = scene.add.rectangle(0, height * 0.285, width - 16, height * 0.3, 0x01050a, 0.58)
      .setStrokeStyle(1, 0x73f7ff, 0.12);
    container.add(textPlate);
  }
  if (supreme) {
    const ghostCyan = scene.add.text(-2, -height * 0.12, definition.icon, {
      fontFamily: 'Orbitron, sans-serif', fontSize: `${Math.max(24, width * 0.25)}px`, color: '#55f7ff'
    }).setOrigin(0.5).setAlpha(supremeMotion === 'off' ? 0.1 : 0.04);
    const ghostMagenta = scene.add.text(2, -height * 0.12, definition.icon, {
      fontFamily: 'Orbitron, sans-serif', fontSize: `${Math.max(24, width * 0.25)}px`, color: '#ff62dc'
    }).setOrigin(0.5).setAlpha(supremeMotion === 'off' ? 0.08 : 0.03);
    container.add([ghostCyan, ghostMagenta]);
    if (supremeMotion === 'full') {
      const iconGlitchTween = scene.tweens.add({
        targets: [ghostCyan, ghostMagenta],
        x: { from: -3, to: 3 },
        alpha: { from: 0.02, to: 0.26 },
        duration: 72,
        yoyo: true,
        repeat: -1,
        repeatDelay: 3100 + definition.id.length * 47
      });
      container.once('destroy', () => iconGlitchTween.remove());
    }
  }
  container.add([rankLabel, rarity, iconRing, icon, name, stat, infusion]);
  if (supremeRule) container.add(supremeRule);

  if (options.equipped) {
    const markerX = -width / 2 + 15;
    const markerY = height / 2 - 15;
    const equippedMarker = scene.add.container(markerX, markerY);
    const equippedGlow = scene.add.circle(0, 0, 10, 0x55ffe1, 0.14)
      .setStrokeStyle(1, 0x55ffe1, 0.55);
    const equippedSpinner = scene.add.graphics();
    equippedSpinner.lineStyle(2, 0x72ffe8, 1);
    equippedSpinner.arc(0, 0, 8, 0, Phaser.Math.PI2, false);
    equippedSpinner.strokePath();
    const equippedCore = scene.add.text(0, 0, 'E', {
      fontFamily: 'Orbitron, sans-serif', fontSize: compact ? '9px' : '10px', color: '#ffffff'
    }).setOrigin(0.5);
    equippedMarker.add([equippedGlow, equippedSpinner, equippedCore]);
    container.add(equippedMarker);
    scene.tweens.add({ targets: equippedMarker, scaleX: { from: 1, to: -1 }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    scene.tweens.add({ targets: equippedGlow, alpha: { from: 0.3, to: 0.8 }, scale: { from: 0.85, to: 1.15 }, duration: 800, yoyo: true, repeat: -1 });
  }

  if ((options.duplicateCount ?? 0) > 0) {
    const markerX = width / 2 - (compact ? 14 : 18);
    const markerY = height / 2 - (compact ? 15 : 19);
    const duplicateMarker = scene.add.container(markerX, markerY);
    const markerColor = 0xffd66e;
    const backCard = scene.add.rectangle(-4, -3, compact ? 11 : 14, compact ? 14 : 18, 0x0b1723, 0.96)
      .setStrokeStyle(1, markerColor, 0.65);
    const frontCard = scene.add.rectangle(0, 0, compact ? 11 : 14, compact ? 14 : 18, 0x152235, 1)
      .setStrokeStyle(1, markerColor, 1);
    const count = scene.add.text(0, 0, `+${options.duplicateCount}`, {
      fontFamily: 'Rajdhani, sans-serif', fontSize: compact ? '9px' : '11px', fontStyle: 'bold', color: '#fff3bd'
    }).setOrigin(0.5);
    duplicateMarker.add([backCard, frontCard, count]);
    container.add(duplicateMarker);
  }

  if (corrupted) {
    const ghostLeft = scene.add.text(-2, -height * 0.12, definition.icon, {
      fontFamily: 'Orbitron, sans-serif', fontSize: `${Math.max(24, width * 0.25)}px`, color: '#ff1dbd'
    }).setOrigin(0.5).setAlpha(0.22);
    const ghostRight = scene.add.text(2, -height * 0.12, definition.icon, {
      fontFamily: 'Orbitron, sans-serif', fontSize: `${Math.max(24, width * 0.25)}px`, color: '#4ffff3'
    }).setOrigin(0.5).setAlpha(0.16);
    container.addAt(ghostLeft, Math.max(0, container.getIndex(icon)));
    container.addAt(ghostRight, Math.max(0, container.getIndex(icon)));
    for (let stripIndex = 0; stripIndex < 3; stripIndex += 1) {
      const strip = scene.add.rectangle(
        -width * 0.22 + stripIndex * width * 0.19,
        -height * 0.31 + stripIndex * height * 0.27,
        width * (0.28 + stripIndex * 0.08),
        1 + stripIndex,
        stripIndex === 1 ? 0x54fff0 : 0xff28cc,
        0.48
      );
      container.add(strip);
      corruptionTweens.push(scene.tweens.add({
        targets: strip,
        x: { from: strip.x - width * 0.12, to: strip.x + width * 0.12 },
        alpha: { from: 0.08, to: 0.72 },
        duration: 280 + stripIndex * 170,
        delay: stripIndex * 130,
        yoyo: true,
        repeat: -1,
        ease: 'Quad.easeInOut'
      }));
    }
    corruptionTweens.push(scene.tweens.add({
      targets: [ghostLeft, ghostRight],
      x: { from: -3, to: 3 },
      alpha: { from: 0.08, to: 0.32 },
      duration: 190,
      yoyo: true,
      repeat: -1
    }));
    container.once('destroy', () => corruptionTweens.forEach((tween) => tween.remove()));
  }
  container.add(sheen);
  if (options.interactive !== false) {
    const restingY = y;
    const sheenState = { progress: 0 };
    let sheenTween: Phaser.Tweens.Tween | null = null;
    const redrawSheen = (): void => {
      const halfWidth = width / 2;
      const halfHeight = height / 2;
      const scanX = -width * 0.78 + width * 1.56 * sheenState.progress;
      const slant = width * 0.18;
      const softHalfWidth = width * 0.16;
      const coreHalfWidth = Math.max(2, width * 0.025);
      const clampX = (value: number): number => Phaser.Math.Clamp(value, -halfWidth, halfWidth);
      const drawBand = (bandHalfWidth: number, alpha: number): void => {
        const points = [
          new Phaser.Geom.Point(clampX(scanX - bandHalfWidth - slant), -halfHeight),
          new Phaser.Geom.Point(clampX(scanX + bandHalfWidth - slant), -halfHeight),
          new Phaser.Geom.Point(clampX(scanX + bandHalfWidth + slant), halfHeight),
          new Phaser.Geom.Point(clampX(scanX - bandHalfWidth + slant), halfHeight)
        ];
        sheen.fillStyle(0xffffff, alpha);
        sheen.fillPoints(points, true);
      };
      sheen.clear();
      drawBand(softHalfWidth, 0.065);
      drawBand(coreHalfWidth, 0.13);
    };
    container.setSize(width, height).setInteractive({ useHandCursor: true });
    registerUiFocusable(scene, container, {
      id: options.focusId,
      label: definition.name,
      activate: () => container.emit('pointerdown'),
      modalDepth: options.focusModalDepth,
      defaultPriority: options.focusDefaultPriority ?? (options.selected ? 12 : 0),
      locked: () => options.focusLocked === true,
      group: options.focusGroup
    });
    container.on('pointerover', () => {
      AudioManager.get().playSfx('menuHover');
      supremeEffects?.setHovered(true);
      scene.tweens.killTweensOf(container);
      scene.tweens.killTweensOf(shadow);
      sheenTween?.stop();
      sheenState.progress = 0;
      redrawSheen();
      sheenTween = scene.tweens.add({
        targets: sheenState,
        progress: 1,
        duration: 450,
        ease: 'Cubic.Out',
        onUpdate: redrawSheen,
        onComplete: () => sheen.clear()
      });
      scene.tweens.add({ targets: container, y: restingY - 2, scale: 1.025, duration: 150, ease: 'Quad.Out' });
      scene.tweens.add({ targets: shadow, alpha: 0.72, duration: 150 });
      body.setStrokeStyle(options.selected ? 4 : supreme ? 4 : 3, options.selected ? 0xffffff : rarityColor, 1);
    });
    container.on('pointerout', () => {
      supremeEffects?.setHovered(false);
      scene.tweens.killTweensOf(container);
      scene.tweens.killTweensOf(shadow);
      sheenTween?.stop();
      sheenTween = null;
      sheen.clear();
      scene.tweens.add({ targets: container, y: restingY, scale: 1, duration: 150, ease: 'Quad.Out' });
      scene.tweens.add({ targets: shadow, alpha: 0.45, duration: 150 });
      body.setStrokeStyle(options.selected ? 4 : supreme ? 3 : 2, options.selected ? 0xffffff : rarityColor, 1);
    });
  }
  return container;
};
