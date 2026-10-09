import type Phaser from 'phaser';
import { GARAGE_PRESET_NAME_LIMIT } from '../game/garage/GarageState.ts';
import { getGameUiRoot } from './getGameUiRoot.ts';
import './terminal.css';

/** Native text entry uses the existing DOM controller layer and never interprets a name as HTML. */
export const showPresetNameDialog = (scene: Phaser.Scene, options: {
  name: string; overwrite: boolean; rename: boolean;
  submit(name: string): { ok: boolean; message?: string };
  complete(): void;
}): { destroy(): void } => {
  const overlay = document.createElement('div'); overlay.className = 'terminal-dialog-overlay';
  const form = document.createElement('form'); form.className = 'terminal-dialog';
  form.setAttribute('role', 'dialog'); form.setAttribute('aria-modal', 'true'); form.setAttribute('aria-labelledby', 'preset-dialog-title');
  const title = document.createElement('h2'); title.id = 'preset-dialog-title';
  title.textContent = options.rename ? 'RENAME CONFIGURATION' : options.overwrite ? 'REPLACE SAVED CONFIGURATION?' : 'SAVE OPERATOR CONFIGURATION';
  const description = document.createElement('p');
  description.textContent = options.rename ? 'Your equipment and saved selections stay the same.' : options.overwrite
    ? `Replace ${options.name} with your current Mods, cosmetics and deployment selections?`
    : 'Save your current Mods, cosmetics and deployment selections in this slot.';
  const label = document.createElement('label'); label.textContent = `CONFIGURATION NAME // ${GARAGE_PRESET_NAME_LIMIT} CHARACTERS MAX`;
  const input = document.createElement('input'); input.type = 'text'; input.value = options.name;
  input.maxLength = GARAGE_PRESET_NAME_LIMIT; input.autocomplete = 'off'; input.name = 'preset-name';
  label.append(input);
  const message = document.createElement('p'); message.setAttribute('role', 'status');
  const actions = document.createElement('div'); actions.className = 'terminal-dialog-actions';
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'CANCEL';
  const submit = document.createElement('button'); submit.type = 'submit';
  submit.textContent = options.rename ? 'RENAME' : options.overwrite ? 'OVERWRITE CONFIG' : 'SAVE CONFIG';
  actions.append(cancel, submit); form.append(title, description, label, message, actions); overlay.append(form);
  const previousFocus = document.activeElement;
  const wasInputEnabled = scene.input.enabled;
  scene.input.enabled = false;
  let destroyed = false;
  const destroy = (): void => {
    if (destroyed) return;
    destroyed = true; overlay.remove(); scene.input.enabled = wasInputEnabled;
    if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
  };
  cancel.addEventListener('click', destroy);
  form.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); destroy(); }
    if (event.key === 'Tab') {
      const controls = [input, cancel, submit]; const index = controls.indexOf(document.activeElement as typeof input);
      event.preventDefault(); controls[(index + (event.shiftKey ? 2 : 1)) % controls.length].focus();
    }
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    const result = options.submit(input.value);
    if (!result.ok) { message.textContent = result.message ?? 'Unable to save configuration.'; return; }
    destroy(); options.complete();
  });
  getGameUiRoot().append(overlay); input.focus(); input.select();
  return { destroy };
};

/** Keep every validation reason readable, including on short screens. */
export const showPresetIssuesDialog = (scene: Phaser.Scene, issues: readonly string[]): { destroy(): void } => {
  const overlay = document.createElement('div'); overlay.className = 'terminal-dialog-overlay';
  const panel = document.createElement('section'); panel.className = 'terminal-dialog';
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-labelledby', 'preset-issues-title');
  const title = document.createElement('h2'); title.id = 'preset-issues-title'; title.textContent = 'CONFIGURATION UNAVAILABLE';
  const description = document.createElement('p'); description.textContent = 'Correct these items, then save the configuration again.';
  const list = document.createElement('ul'); list.className = 'terminal-dialog-issues'; list.tabIndex = 0;
  list.setAttribute('data-controller-scroll', 'true');
  for (const issue of issues) { const item = document.createElement('li'); item.textContent = issue; list.append(item); }
  const actions = document.createElement('div'); actions.className = 'terminal-dialog-actions';
  const close = document.createElement('button'); close.textContent = 'CLOSE'; actions.append(close);
  panel.append(title, description, list, actions); overlay.append(panel);
  const wasInputEnabled = scene.input.enabled; scene.input.enabled = false;
  let destroyed = false;
  const destroy = (): void => { if (destroyed) return; destroyed = true; overlay.remove(); scene.input.enabled = wasInputEnabled; };
  close.addEventListener('click', destroy);
  panel.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); destroy(); }
    if (event.key === 'Tab') { event.preventDefault(); (document.activeElement === close ? list : close).focus(); }
  });
  getGameUiRoot().append(overlay); close.focus();
  return { destroy };
};
