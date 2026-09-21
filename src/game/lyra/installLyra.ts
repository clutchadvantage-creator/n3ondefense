import type Phaser from 'phaser';
import { LyraComms } from './LyraComms.ts';
import { TutorialEventBus } from '../tutorial/TutorialEventBus.ts';
import { HudInformationSystem } from '../ui/HudInformationSystem.ts';
import type { LyraMessage } from './LyraTypes.ts';

/** One application subscription; scene adapters expose only presentation safety. */
export interface LyraSceneState { blocked: boolean; ambientSafe: boolean; lowHealth?: boolean; defusing?: boolean; }
type LyraScene = Phaser.Scene & { getLyraState?: () => LyraSceneState };
export function installLyra(game: Phaser.Game): void {
  const comms = LyraComms.get();
  const root = document.createElement('aside');
  root.className = 'lyra-comms'; root.hidden = true; root.setAttribute('aria-live', 'polite');
  const heading = document.createElement('strong');
  const body = document.createElement('p');
  root.append(heading, body); document.querySelector('#game-ui-root')!.append(root);
  let foreground: LyraScene | undefined;
  let lowHealth = false;
  let defusing = false;
  let modal = false;
  let nextModalCheck = 0;
  const boundaries = new Map<Phaser.Scene, () => void>();
  const present = (message: LyraMessage | null, speaking: boolean): void => {
    if (foreground?.sys.settings.key === 'arena' || foreground?.sys.settings.key === 'anomaly-heist') {
      root.hidden = true;
      if (foreground.sys.isActive()) HudInformationSystem.forScene(foreground).setCommunication(message?.text ?? null, message?.mode, speaking);
    } else {
      root.hidden = !message;
      heading.textContent = `LYRA // ${message?.mode ?? 'GUIDANCE'}${speaking ? ' • TRANSMITTING' : ''}`;
      body.textContent = message?.text ?? '';
    }
  };
  const update = (): void => {
    let next: LyraScene | undefined;
    for (const scene of game.scene.scenes) {
      if (!boundaries.has(scene)) {
        const boundary = (): void => { if (foreground === scene) { comms.cancel(); root.hidden = true; } };
        for (const event of ['shutdown', 'sleep', 'pause']) scene.events.on(event, boundary);
        boundaries.set(scene, boundary);
      }
      if (scene.sys.isActive()) next = scene;
    }
    const key = next?.sys.settings.key ?? '';
    if (next !== foreground) {
      // A tutorial can begin synchronously inside the new scene's create().
      // Retain that new instruction while changing its subtitle destination.
      if (comms.currentScene !== key) comms.cancel();
      comms.setPresenter(null);
      foreground = next; lowHealth = false; defusing = false;
      comms.setPresenter(present);
    }
    const state = next?.getLyraState?.();
    const menuSafe = ['garage', 'upgrades', 'cosmetics', 'mods', 'menu'].includes(key);
    if (performance.now() >= nextModalCheck) {
      nextModalCheck = performance.now() + 250;
      modal = Boolean(document.querySelector('.store-dialog-backdrop, .profile-modal-backdrop, .feedback-modal'));
    }
    const blocked = document.hidden || (state ? state.blocked : !menuSafe) || modal;
    comms.setContext(key, blocked, (state?.ambientSafe ?? menuSafe) && !modal && Number(next?.data?.get('ui-controller-modal-depth') ?? 0) === 0, state?.lowHealth, state?.defusing);
    if (!blocked && state?.lowHealth && !lowHealth) comms.say('warning.health');
    if (!blocked && state?.defusing && !defusing) comms.say('warning.defuse');
    lowHealth = !blocked && Boolean(state?.lowHealth);
    defusing = !blocked && Boolean(state?.defusing);
    comms.tick();
  };
  const mappings: Record<string, string> = {
    'objective.bombArmed': 'tactical.planted', 'pickup.collected': 'context.pickup',
    'arcade.completed': 'event.arcade.complete', 'arcade.failed': 'event.arcade.failed',
    'anomaly.discovered': 'context.anomaly', 'arcade.started': 'context.arcade', 'hazard.firstActive': 'context.hazard',
    'mod.recalibrationOpened': 'context.recalibration', 'mod.infusionOpened': 'context.infusion',
    'progression.supremeAvailable': 'context.supreme'
  };
  const unsubscribe = TutorialEventBus.subscribe(event => {
    const id = mappings[event.type]; if (id) { update(); comms.say(id); }
  });
  const visibility = (): void => { if (document.hidden) comms.cancel(); };
  document.addEventListener('visibilitychange', visibility);
  game.events.on('poststep', update);
  const destroy = (): void => {
    game.events.off('poststep', update); unsubscribe();
    document.removeEventListener('visibilitychange', visibility);
    for (const [scene, boundary] of boundaries) for (const event of ['shutdown', 'sleep', 'pause']) scene.events.off(event, boundary);
    comms.destroy(); root.remove();
  };
  game.events.once('destroy', destroy);
  if (import.meta.hot) import.meta.hot.dispose(destroy);
  if (import.meta.env.DEV) void import('./LyraDevPanel.ts').then(module => module.installLyraDevPanel(game, comms));
}
