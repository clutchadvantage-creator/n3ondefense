import { SaveSystem } from '../game/systems/SaveSystem';

const slider = (id: string, label: string, value: number): string => {
  return `<label class="slider-row" for="${id}"><span>${label}</span><input id="${id}" type="range" min="0" max="1" step="0.01" value="${value.toFixed(2)}" /></label>`;
};

export const createSettingsPanel = (container: HTMLElement): void => {
  const save = SaveSystem.get();
  const panel = document.createElement('aside');
  panel.className = 'settings-panel';
  panel.innerHTML = `
    <h3>Audio</h3>
    ${slider('master-volume', 'Master', save.settings.masterVolume)}
    ${slider('music-volume', 'Music', save.settings.musicVolume)}
    ${slider('sfx-volume', 'SFX', save.settings.sfxVolume)}
  `;

  const update = (key: 'masterVolume' | 'musicVolume' | 'sfxVolume', id: string): void => {
    const el = panel.querySelector<HTMLInputElement>(`#${id}`);
    if (!el) return;
    el.addEventListener('input', () => {
      const v = Number(el.value);
      save.settings[key] = Number.isFinite(v) ? v : save.settings[key];
      SaveSystem.persist();
    });
  };

  update('masterVolume', 'master-volume');
  update('musicVolume', 'music-volume');
  update('sfxVolume', 'sfx-volume');

  container.appendChild(panel);
};
