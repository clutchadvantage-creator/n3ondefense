import Phaser from 'phaser';
import { COLORS } from '../config/constants';
import { AudioManager } from '../systems/AudioManager';
import type { AudioSfxName } from '../config/audio';
import { readButtonJiggleIntensity } from '../../ui/buttonJiggle';
import { registerUiFocusable } from '../input/UiNavigationController.ts';

export type ButtonJiggleTarget = Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform;

interface ButtonAudioState {
  enabled: boolean;
  jiggleTargets: ButtonJiggleTarget[];
}

const buttonAudioStates = new WeakMap<Phaser.GameObjects.Container, ButtonAudioState>();
const buttonJiggleTweens = new WeakMap<ButtonJiggleTarget, Phaser.Tweens.TweenChain>();

const reducedMotionRequested = (): boolean => (
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches
);

/**
 * Runs a short, decaying squash-and-stretch wobble without changing a
 * control's final transform. This is deliberately opt-in for button visuals;
 * cards and other hoverable UI keep their existing presentation.
 */
export const playButtonJiggle = (
  scene: Phaser.Scene,
  targets: ButtonJiggleTarget | readonly ButtonJiggleTarget[]
): void => {
  if (reducedMotionRequested()) return;
  const jiggleIntensity = readButtonJiggleIntensity();
  if (jiggleIntensity <= 0) return;
  const targetList = Array.isArray(targets) ? targets : [targets];
  for (const target of targetList) {
    const prior = buttonJiggleTweens.get(target);
    prior?.stop();

    const baseScaleX = target.scaleX;
    const baseScaleY = target.scaleY;
    const baseAngle = target.angle;
    target.setScale(baseScaleX, baseScaleY).setAngle(baseAngle);

    let chain: Phaser.Tweens.TweenChain;
    chain = scene.tweens.chain({
      targets: target,
      tweens: [
        { scaleX: baseScaleX * (1 + 0.052 * jiggleIntensity), scaleY: baseScaleY * (1 - 0.056 * jiggleIntensity), angle: baseAngle - 0.7 * jiggleIntensity, duration: 66, ease: 'Sine.easeOut' },
        { scaleX: baseScaleX * (1 - 0.024 * jiggleIntensity), scaleY: baseScaleY * (1 + 0.034 * jiggleIntensity), angle: baseAngle + 0.5 * jiggleIntensity, duration: 72, ease: 'Sine.easeInOut' },
        { scaleX: baseScaleX * (1 + 0.018 * jiggleIntensity), scaleY: baseScaleY * (1 - 0.014 * jiggleIntensity), angle: baseAngle - 0.25 * jiggleIntensity, duration: 72, ease: 'Sine.easeInOut' },
        { scaleX: baseScaleX, scaleY: baseScaleY, angle: baseAngle, duration: 92, ease: 'Back.easeOut' }
      ],
      onComplete: () => {
        if (buttonJiggleTweens.get(target) === chain) buttonJiggleTweens.delete(target);
      },
      onStop: () => target.setScale(baseScaleX, baseScaleY).setAngle(baseAngle)
    });
    buttonJiggleTweens.set(target, chain);
  }
};

/** Allows composite controls to move their housing and overlays together. */
export const setButtonJiggleTargets = (
  button: Phaser.GameObjects.Container,
  targets: readonly ButtonJiggleTarget[]
): void => {
  const state = buttonAudioStates.get(button);
  if (state) state.jiggleTargets = [...targets];
};

export interface ButtonPresentationOptions {
  height?: number;
  fontSize?: number;
  horizontalPadding?: number;
  focusModalDepth?: number;
  focusDefaultPriority?: number;
  focusShortcut?: 'page-left' | 'page-right' | 'tab-left' | 'tab-right';
  focusLabel?: string;
}

export const createButton = (
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  onClick: () => unknown,
  width = 220,
  buttonSound: Extract<AudioSfxName, 'menu' | 'runStart'> = 'menu',
  presentation: ButtonPresentationOptions = {}
): Phaser.GameObjects.Container => {
  const height = presentation.height ?? 40;
  const horizontalPadding = presentation.horizontalPadding ?? 20;
  const labelFontSize = presentation.fontSize ?? (text.length > 28 || (width < 190 && text.length > 20) ? 14 : 16);
  const bg = scene.add.rectangle(0, 0, width, height, 0x121a2b, 0.95).setStrokeStyle(2, COLORS.cyan, 0.9);
  const label = scene.add.text(0, 0, text, {
    color: '#d6f7ff',
    fontSize: `${labelFontSize}px`,
    fontFamily: 'Rajdhani, sans-serif',
    align: 'center',
    lineSpacing: -2,
    wordWrap: { width: Math.max(40, width - horizontalPadding), useAdvancedWrap: true }
  }).setOrigin(0.5).setMaxLines(2).setName('button-label');

  const hit = scene.add.rectangle(0, 0, width, height, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
  hit.setName('button-hit');
  const button = scene.add.container(x, y, [bg, label, hit]);
  const state: ButtonAudioState = { enabled: true, jiggleTargets: [button] };
  buttonAudioStates.set(button, state);
  hit.on('pointerover', () => {
    bg.setStrokeStyle(2, state.enabled ? COLORS.pink : 0xff7f9f, 1);
    AudioManager.get().playSfx('menuHover');
    playButtonJiggle(scene, state.jiggleTargets);
  });
  hit.on('pointerout', () => bg.setStrokeStyle(2, COLORS.cyan, 0.9));
  const activate = (): unknown => {
    if (!state.enabled) {
      AudioManager.get().playSfx('itemLocked');
      return false;
    }
    const accepted = onClick();
    AudioManager.get().playSfx(accepted === false ? 'itemLocked' : buttonSound);
    return accepted;
  };
  hit.on('pointerdown', activate);

  const normalizedLabel = (presentation.focusLabel ?? text).replace(/\s+/g, ' ').trim();
  // Unicode escapes keep this source encoding-independent while still
  // recognizing the authored triangular pagination glyphs.
  const isPrevious = /^(?:<|\u25c0|previous|prev)/i.test(normalizedLabel);
  const isNext = /^(?:>|\u25b6|next)/i.test(normalizedLabel);
  registerUiFocusable(scene, button, {
    label: normalizedLabel,
    activate,
    disabled: () => !state.enabled,
    modalDepth: presentation.focusModalDepth,
    defaultPriority: presentation.focusDefaultPriority ?? (/^(?:deploy|start|continue|resume|ready|engage|next fight)/i.test(normalizedLabel) ? 30 : 0),
    destructive: /delete|quit|restart|reset progress/i.test(normalizedLabel),
    shortcut: presentation.focusShortcut ?? (isPrevious ? 'page-left' : isNext ? 'page-right' : undefined)
  });

  return button;
};

export const disableButton = (button: Phaser.GameObjects.Container): void => {
  const state = buttonAudioStates.get(button);
  if (state) state.enabled = false;
  button.alpha = 0.7;
};

export const enableButton = (button: Phaser.GameObjects.Container): void => {
  const state = buttonAudioStates.get(button);
  if (state) state.enabled = true;
  for (const child of button.list) {
    if (child.name === 'button-hit' && 'setInteractive' in child && typeof child.setInteractive === 'function') {
      child.setInteractive({ useHandCursor: true });
    }
  }
  button.alpha = 1;
};
