import { SaveSystem } from '../game/systems/SaveSystem';

export const readButtonJiggleIntensity = (): number => {
  try {
    return Math.max(0, Math.min(1, SaveSystem.get().settings.buttonJiggle));
  } catch {
    return 1;
  }
};

/** Supplies broadly supported CSS variables instead of relying on calc multiplication. */
export const applyButtonJiggleVariables = (button: HTMLElement, strength: number): void => {
  const value = Math.max(0, Math.min(1, strength));
  button.style.setProperty('--jiggle-x1', `${1 + 0.052 * value}`);
  button.style.setProperty('--jiggle-y1', `${1 - 0.056 * value}`);
  button.style.setProperty('--jiggle-r1', `${-0.7 * value}deg`);
  button.style.setProperty('--jiggle-x2', `${1 - 0.024 * value}`);
  button.style.setProperty('--jiggle-y2', `${1 + 0.034 * value}`);
  button.style.setProperty('--jiggle-r2', `${0.5 * value}deg`);
  button.style.setProperty('--jiggle-x3', `${1 + 0.018 * value}`);
  button.style.setProperty('--jiggle-y3', `${1 - 0.014 * value}`);
  button.style.setProperty('--jiggle-r3', `${-0.25 * value}deg`);
  button.style.setProperty('--jiggle-x4', `${1 - 0.006 * value}`);
  button.style.setProperty('--jiggle-y4', `${1 + 0.008 * value}`);
  button.style.setProperty('--jiggle-r4', `${0.1 * value}deg`);
};
