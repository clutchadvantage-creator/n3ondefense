import { AudioManager } from '../game/systems/AudioManager';

let installed = false;

export const installMenuAudio = (): void => {
  if (installed) return;
  installed = true;
  document.addEventListener('pointerover', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>('#game-ui-root button');
    if (!button) return;
    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Node && button.contains(relatedTarget)) return;
    AudioManager.get().playSfx('menuHover');
  }, true);
  document.addEventListener('pointerdown', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>('#game-ui-root button');
    if (!button || button.dataset.menuAudio === 'deferred') return;
    const unavailable = button.disabled
      || button.getAttribute('aria-disabled') === 'true'
      || button.dataset.locked === 'true';
    AudioManager.get().playSfx(unavailable ? 'itemLocked' : 'menu');
  }, true);
};
