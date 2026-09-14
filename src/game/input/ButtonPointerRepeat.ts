import Phaser from 'phaser';
import { UiInputRepeater } from './UiFocusManager.ts';

export const BUTTON_REPEAT = { initialDelayMs: 360, intervalMs: 80 } as const;

/** Opt-in pointer hold. No timers survive release or the owning control. */
export const bindButtonPointerRepeat = (
  scene: Phaser.Scene, button: Phaser.GameObjects.Container, hit: Phaser.GameObjects.Rectangle,
  enabled: () => boolean, repeat: () => unknown, pressed: (held: boolean) => void
): void => {
  let pointer: Phaser.Input.Pointer | null = null;
  const repeater = new UiInputRepeater<'hold'>();
  const stop = (): void => { pointer = null; repeater.reset(); pressed(false); };
  const down = (value: Phaser.Input.Pointer): void => {
    if (!enabled() || !value?.isDown) return;
    pointer = value; repeater.update('hold', scene.time.now, BUTTON_REPEAT); pressed(true);
  };
  const update = (): void => {
    if (!pointer) return;
    if (!pointer.isDown || !enabled() || !scene.sys.isActive()) { stop(); return; }
    if (repeater.update('hold', scene.time.now, BUTTON_REPEAT)) repeat();
  };
  const up = (value: Phaser.Input.Pointer): void => { if (!value || value === pointer) stop(); };
  const destroy = (): void => {
    stop();
    hit.off('pointerdown', down); hit.off('pointerout', stop);
    scene.input.off('pointerup', up); scene.input.off('pointerupoutside', up);
    scene.events.off(Phaser.Scenes.Events.UPDATE, update);
    scene.events.off(Phaser.Scenes.Events.PAUSE, stop); scene.events.off(Phaser.Scenes.Events.SLEEP, stop);
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, destroy);
    scene.game.events.off(Phaser.Core.Events.BLUR, stop);
    button.off(Phaser.GameObjects.Events.DESTROY, destroy);
  };
  hit.on('pointerdown', down); hit.on('pointerout', stop);
  scene.input.on('pointerup', up); scene.input.on('pointerupoutside', up);
  scene.events.on(Phaser.Scenes.Events.UPDATE, update);
  scene.events.on(Phaser.Scenes.Events.PAUSE, stop); scene.events.on(Phaser.Scenes.Events.SLEEP, stop);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, destroy);
  scene.game.events.on(Phaser.Core.Events.BLUR, stop);
  button.once(Phaser.GameObjects.Events.DESTROY, destroy);
};
