import Phaser from 'phaser';
import { registerUiFocusable, UiNavigationController } from '../input/UiNavigationController.ts';

/** Keep the operative greeting fixed while the mission deck unfolds below it. */
export const attachWeeklyOperationsTray = (
  scene: Phaser.Scene,
  root: Phaser.GameObjects.Container,
  body: Phaser.GameObjects.Container,
  welcome: Phaser.GameObjects.Text,
  width: number,
  height: number,
  reducedMotion: boolean
): void => {
  const barHeight = welcome.y + welcome.height + 4;
  const reveal = { amount: 0 };
  let expanded = false;
  let keyboardOpen = false;
  const navigation = UiNavigationController.get().phaserLayer(scene).manager;
  const isTrayFocus = (): boolean => navigation.currentId?.startsWith('weekly-') ?? false;

  const bar = scene.add.rectangle(0, 0, width, barHeight, 0x0b2130, 0.99)
    .setOrigin(0.5, 0).setStrokeStyle(2, 0x59eaff, 0.8).setName('weekly-tray-toggle')
    .setInteractive({ useHandCursor: true });
  const rail = scene.add.rectangle(0, 5, width - 24, 3, 0xff5bcf, 0.5);
  const chevron = scene.add.text(width / 2 - 14, barHeight / 2, '\u2304', {
    fontFamily: 'sans-serif', fontSize: '18px', color: '#86f8ff'
  }).setOrigin(0.5);
  body.remove(welcome);
  welcome.setY((barHeight - welcome.height) / 2);
  root.add([bar, rail, welcome, chevron]);
  body.setVisible(false);

  // A world-space mask reveals height without squeezing the enlarged text.
  const clip = scene.add.graphics().setVisible(false);
  const mask = clip.createGeometryMask();
  body.setMask(mask);
  let lastX = NaN, lastY = NaN, lastAmount = NaN;
  const draw = (): void => {
    if (lastX === root.x && lastY === root.y && lastAmount === reveal.amount) return;
    lastX = root.x; lastY = root.y; lastAmount = reveal.amount;
    clip.clear().fillStyle(0xffffff).fillRect(root.x - width / 2 - 12, root.y + barHeight,
      width + 24, (height + 12 - barHeight) * reveal.amount);
    body.y = -18 * (1 - reveal.amount);
  };
  const setExpanded = (next: boolean): void => {
    if (expanded === next) return;
    expanded = next;
    root.setData('weeklyTrayExpanded', expanded);
    chevron.setText(expanded ? '\u2303' : '\u2304');
    scene.tweens.killTweensOf(reveal);
    if (expanded) body.setVisible(true);
    if (!expanded && isTrayFocus()) navigation.focus('weekly-tray-toggle');
    if (reducedMotion) {
      reveal.amount = expanded ? 1 : 0;
      body.setVisible(expanded);
      draw();
      return;
    }
    scene.tweens.add({
      targets: reveal, amount: expanded ? 1 : 0, duration: expanded ? 220 : 170, ease: 'Sine.easeOut',
      onComplete: () => { if (!expanded) body.setVisible(false); }
    });
  };
  root.setData('weeklyTrayExpanded', false);
  registerUiFocusable(scene, bar, {
    id: 'weekly-tray-toggle', label: 'Weekly operations tray',
    activate: () => { keyboardOpen = !expanded; setExpanded(!expanded); }
  });

  const contains = (pointer: Phaser.Input.Pointer): boolean => pointer.x >= root.x - width / 2 - 12
    && pointer.x <= root.x + width / 2 + 12 && pointer.y >= root.y
    && pointer.y <= root.y + (expanded ? height + 12 : barHeight);
  // Scene-level bounds keep card gaps and child controls from closing the tray.
  const onPointerMove = (pointer: Phaser.Input.Pointer): void => {
    keyboardOpen = false;
    setExpanded(contains(pointer));
  };
  const onPointerDown = (pointer: Phaser.Input.Pointer): void => {
    if (!contains(pointer)) { keyboardOpen = false; setExpanded(false); }
  };
  bar.on('pointerover', (pointer: Phaser.Input.Pointer) => { if (!pointer.wasTouch) onPointerMove(pointer); });
  bar.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
    if (!pointer.wasTouch) { keyboardOpen = false; setExpanded(true); }
    else { navigation.focus('weekly-tray-toggle'); keyboardOpen = !expanded; setExpanded(!expanded); }
  });
  const onGameOut = (): void => { if (!keyboardOpen) setExpanded(false); };
  scene.input.on('pointermove', onPointerMove);
  scene.input.on('pointerdown', onPointerDown);
  scene.input.on('gameout', onGameOut);

  // Phaser masks only affect rendering. Gate pointer hit tests as well, including
  // reward controls in lazily created pages, so clipped controls cannot activate.
  const guarded = new WeakSet<Phaser.GameObjects.GameObject>();
  const guardInputs = (object: Phaser.GameObjects.GameObject): void => {
    if (guarded.has(object)) return;
    guarded.add(object);
    if (object.input) {
      const hitTest = object.input.hitAreaCallback;
      object.input.hitAreaCallback = (...args) => expanded && reveal.amount === 1 && hitTest(...args);
    }
    if (object instanceof Phaser.GameObjects.Container) for (const child of object.list) guardInputs(child);
  };
  const update = (): void => {
    for (const child of body.list) guardInputs(child);
    if (keyboardOpen && !isTrayFocus()) { keyboardOpen = false; setExpanded(false); }
    draw();
  };
  scene.events.on(Phaser.Scenes.Events.UPDATE, update);
  update();
  root.once(Phaser.GameObjects.Events.DESTROY, () => {
    scene.input.off('pointermove', onPointerMove);
    scene.input.off('pointerdown', onPointerDown);
    scene.input.off('gameout', onGameOut);
    scene.events.off(Phaser.Scenes.Events.UPDATE, update);
    scene.tweens.killTweensOf(reveal);
    body.clearMask();
    mask.destroy();
    clip.destroy();
  });
};
