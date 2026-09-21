import { bindingLabel, compactBindingLabel, type AbilityBindings, type InputBinding } from '../config/controls.ts';
import { resolveActionPrompt, type InputDevice, type GamepadFamily } from '../input/ActionInput.ts';
import type { TutorialStepDefinition } from './TutorialTypes.ts';

const spokenBinding = (binding: InputBinding): string => {
  if (binding === 'Keyboard:Space') return 'SPACE BAR';
  if (binding === 'Mouse:1') return 'MIDDLE MOUSE BUTTON';
  if (binding === 'Mouse:2') return 'RIGHT MOUSE BUTTON';
  return bindingLabel(binding);
};
export function resolveTutorialCopy(step: TutorialStepDefinition, device: InputDevice, family: GamepadFamily, bindings: AbilityBindings): { body: string; inputDemo?: string[] } {
  const prompt = (action: Parameters<typeof resolveActionPrompt>[0], keyboard: string): string => resolveActionPrompt(action, device, family, keyboard);
  const chips: Record<string, string> = {
    '{MOVE}': device === 'gamepad' ? 'LEFT STICK' : 'W / A / S / D',
    '{AIM}': device === 'gamepad' ? 'RIGHT STICK' : 'MOUSE',
    '{FIRE}': prompt('fire', 'LMB'), '{INTERACT}': prompt('interact', 'E')
  };
  const prose: Record<string, string> = { ...chips,
    '{MOVE}': device === 'gamepad' ? 'LEFT STICK' : 'W, A, S, and D',
    '{FIRE}': prompt('fire', 'LEFT MOUSE BUTTON')
  };
  for (const action of ['fence', 'turret', 'mine', 'dash', 'shield'] as const) {
    const token = `{${action.toUpperCase()}}`;
    chips[token] = prompt(action, compactBindingLabel(bindings[action]));
    prose[token] = prompt(action, spokenBinding(bindings[action]));
  }
  const replace = (value: string, replacements: Record<string, string>): string => Object.entries(replacements)
    .reduce((copy, [token, label]) => copy.replaceAll(token, label), value);
  return { body: replace(step.body, prose), inputDemo: step.inputDemo?.map(value => replace(value, chips)) };
}
