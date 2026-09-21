import type Phaser from 'phaser';
import type { LyraComms } from './LyraComms.ts';
import { LYRA_MESSAGES } from './LyraRegistry.ts';
import { SaveSystem } from '../systems/SaveSystem.ts';
import { requestTutorialReplay } from '../tutorial/TutorialProgress.ts';

/** Dynamically imported only in DEV; no debug controls in the production bundle. */
export function installLyraDevPanel(game: Phaser.Game, comms: LyraComms): void {
  const root = document.createElement('details'); root.className = 'lyra-dev';
  const summary = document.createElement('summary'); summary.textContent = 'LYRA // VOICE LAB (DEV)'; root.append(summary);
  const content = document.createElement('div'); root.append(content);
  const key = 'n3on:lyra:development-voice';
  let preferences: { voiceName?: string; rate?: number; pitch?: number; language?: string } = {};
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? '{}');
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) preferences = saved;
    comms.configureDevelopment(preferences);
  } catch { /* Optional local preferences. */ }
  const save = (): void => { comms.configureDevelopment(preferences); try { localStorage.setItem(key, JSON.stringify(preferences)); } catch { /* Optional storage. */ } };
  const label = (text: string, input: HTMLElement): void => { const row = document.createElement('label'); row.append(text, input); content.append(row); };
  const voices = document.createElement('select'); label('Local voice ', voices);
  const refreshVoices = (): void => {
    voices.replaceChildren(new Option('Automatic local English preference', ''), ...comms.tts.listVoices().map(v => {
      const option = new Option(`${v.name} (${v.lang})${v.localService ? '' : ' — network voice excluded'}`, v.name);
      option.disabled = !v.localService; return option;
    })); voices.value = preferences.voiceName ?? '';
  };
  refreshVoices(); window.speechSynthesis?.addEventListener('voiceschanged', refreshVoices);
  voices.onchange = () => { preferences.voiceName = voices.value; save(); };
  for (const field of ['rate', 'pitch'] as const) {
    const input = document.createElement('input'); input.type = 'range'; input.min = '.7'; input.max = field === 'rate' ? '1.3' : '1.2'; input.step = '.01'; input.value = String(preferences[field] ?? (field === 'rate' ? .96 : 1));
    label(`${field} `, input); input.oninput = () => { preferences[field] = Number(input.value); save(); };
  }
  const line = document.createElement('select');
  line.append(...LYRA_MESSAGES.map(message => new Option(message.id, message.id))); label('Line / recording key ', line);
  const button = (text: string, action: () => void): void => { const b = document.createElement('button'); b.textContent = text; b.onclick = action; content.append(b); };
  button('Preview provider chain', () => {
    const message = LYRA_MESSAGES.find(m => m.id === line.value)!;
    comms.cancel(); comms.queue.resetCooldowns();
    // Keep current scene safety; previews cannot speak over a reveal or paused run.
    comms.queue.submit({ ...message, scenes: undefined, once: undefined, tutorial: false, priority: 100 });
  });
  button('Stop / clear queue', () => comms.cancel());
  button('Clear cooldowns', () => comms.queue.resetCooldowns());
  button('Try ambient (safe scenes)', () => { comms.queue.resetCooldowns(); comms.ambient(); });
  button('Reset contextual seen', () => comms.resetSeen());
  button('Replay initial training', () => SaveSystem.updateTutorialProgress(state => requestTutorialReplay(state, 'onboarding.basic-controls')));
  const diagnostics = document.createElement('pre'); content.append(diagnostics);
  let timer: number | undefined;
  root.ontoggle = () => {
    window.clearInterval(timer);
    if (root.open) {
      const refresh = (): void => { diagnostics.textContent = JSON.stringify(comms.diagnostics(), null, 2); };
      refresh(); timer = window.setInterval(refresh, 750);
    }
  };
  document.querySelector('#game-ui-root')!.append(root);
  const destroy = (): void => { window.clearInterval(timer); window.speechSynthesis?.removeEventListener('voiceschanged', refreshVoices); root.remove(); };
  game.events.once('destroy', destroy);
  if (import.meta.hot) import.meta.hot.dispose(destroy);
}
