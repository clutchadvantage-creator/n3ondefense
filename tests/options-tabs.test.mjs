import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SFX_DEFINITIONS } from '../src/game/config/audio.ts';

const options = readFileSync(new URL('../src/game/scenes/OptionsScene.ts', import.meta.url), 'utf8');
const feedback = readFileSync(new URL('../src/ui/feedback/FeedbackReportUi.ts', import.meta.url), 'utf8');

const methodSource = (name, nextName) => {
  const expression = new RegExp(`private ${name}\\([\\s\\S]*?\\n  private ${nextName}\\(`);
  return options.match(expression)?.[0] ?? '';
};

test('Options uses five data-driven tabs and defaults every scene opening to Audio', () => {
  assert.match(options, /type OptionsTabId = 'audio' \| 'gameplay' \| 'interface' \| 'profile' \| 'system'/);
  assert.deepEqual(
    [...options.matchAll(/\{ id: '(audio|gameplay|interface|profile|system)', label: '([A-Z]+)' \}/g)].map((match) => match[2]),
    ['AUDIO', 'GAMEPLAY', 'INTERFACE', 'PROFILE', 'SYSTEM']
  );
  assert.match(options, /private activeTab: OptionsTabId = 'audio'/);
  assert.match(options, /this\.resetTransientUiState\(\)[\s\S]*?this\.selectTab\('audio'\)/);
  assert.doesNotMatch(options, /setSettings\(\{[^}]*activeTab/);
});

test('tab contents are created once and hidden tabs have all nested pointer input disabled', () => {
  assert.equal((options.match(/this\.createAudioTab\(/g) ?? []).length, 1);
  assert.equal((options.match(/this\.createGameplayTab\(/g) ?? []).length, 1);
  assert.equal((options.match(/this\.createInterfaceTab\(/g) ?? []).length, 1);
  assert.equal((options.match(/this\.createProfileTab\(/g) ?? []).length, 1);
  assert.equal((options.match(/this\.createSystemTab\(/g) ?? []).length, 1);
  assert.match(options, /container\.setVisible\(selected\)\.setActive\(selected\)/);
  assert.match(options, /this\.setContainerInputEnabled\(container, selected\)/);
  assert.match(options, /if \(object\.input\) object\.input\.enabled = enabled/);
  assert.match(options, /object instanceof Phaser\.GameObjects\.Container[\s\S]*?for \(const child of object\.list\) visit\(child\)/);
});

test('Audio tab keeps the existing mixer keys and tab content scrolls only inside its masked viewport', () => {
  const audioTab = methodSource('createAudioTab', 'createGameplayTab');
  assert.match(audioTab, /MASTER VOLUME/);
  assert.match(audioTab, /MUSIC VOLUME/);
  assert.match(audioTab, /SFX VOLUME/);
  assert.match(audioTab, /SFX_DEFINITIONS\.forEach/);
  assert.match(audioTab, /save\.settings\.soundVolumes\[definition\.key\]/);
  assert.match(options, /setSettings\(\{ soundVolumes: \{ \.\.\.current, \[key\]: value \} \}\)/);
  assert.match(options, /container\.setMask\(this\.contentMask\)/);
  assert.match(options, /if \(pointer\.y < this\.viewport\.top \|\| pointer\.y > this\.viewport\.bottom\) return/);
  assert.match(options, /const enabled = this\.activeTab === tab[\s\S]*?this\.viewport\.bottom/);
  assert.ok(SFX_DEFINITIONS.length > 20);
});

test('existing Options controls are retained and routed to their logical tabs', () => {
  const gameplayTab = methodSource('createGameplayTab', 'createInterfaceTab');
  const interfaceTab = methodSource('createInterfaceTab', 'createProfileTab');
  const profileTab = methodSource('createProfileTab', 'createSystemTab');
  const systemTab = methodSource('createSystemTab', 'addSectionHeader');
  assert.match(gameplayTab, /createKeybindPanel/);
  for (const label of ['HUD SCALE', 'PANEL OPACITY', 'BACKGROUND OPACITY', 'HUD TEXT SCALE', 'HUD EDGE POSITION', 'HUD GLOW', 'HUD ANIMATION', 'BUTTON JIGGLE']) {
    assert.ok(interfaceTab.includes(`'${label}'`), `missing Interface control: ${label}`);
  }
  assert.match(interfaceTab, /'HUD EDGE POSITION'[\s\S]*?hud\.edgePosition, 0, 1/);
  for (const label of ['MOUSE SENSITIVITY', 'RETICLE SIZE', 'RETICLE OPACITY', 'RETICLE STYLE', 'RETICLE GLOW']) {
    assert.ok(gameplayTab.includes(`'${label}'`), `missing Gameplay control: ${label}`);
  }
  assert.match(options, /'RETICLE COLOR'/);
  for (const label of ['Local Save Info', 'Switch Profile', 'Export Save', 'Import Save', 'Restore Backup', 'Reset Progress']) {
    assert.ok(profileTab.includes(`'${label}'`), `missing Profile action: ${label}`);
  }
  assert.match(profileTab, /SaveSystem\.getActiveProfileSummary\(\)/);
  assert.match(systemTab, /Replay Splash Screen/);
  assert.match(systemTab, /Suggestions \/ Bug Reports/);
  assert.match(systemTab, /Back to Main Menu/);
  assert.match(systemTab, /this\.feedbackReportUi\?\.open\(\)/);
});

test('button jiggle is profile-backed and the keybind reset occupies the empty final grid cell', () => {
  const keybindPanel = methodSource('createKeybindPanel', 'beginBindingCapture');
  assert.match(options, /SaveSystem\.setSettings\(\{ buttonJiggle \}\)/);
  assert.match(options, /'BUTTON JIGGLE'[\s\S]*?buttonJiggle, 0, 1/);
  assert.match(keybindPanel, /const panelHeight = 260/);
  assert.match(keybindPanel, /const resetY = topY \+ 206/);
  assert.doesNotMatch(keybindPanel, /this\.viewport\.bottom - topY/);
});

test('feedback dialog can be launched from System without mounting its old floating button', () => {
  assert.match(options, /mountFeedbackReportUi\(getGameUiRoot\(\), \{ showLaunchButton: false \}\)/);
  assert.match(feedback, /export interface FeedbackReportHandle \{[\s\S]*?open\(\): void/);
  assert.match(feedback, /if \(options\.showLaunchButton !== false\) root\.append\(launchButton\)/);
  assert.match(feedback, /return \{[\s\S]*?open,[\s\S]*?destroy:/);
});

test('Options shutdown removes input handlers, temporary UI, masks, and persists pending settings', () => {
  const shutdown = options.match(/private shutdownOptions\(\): void \{[\s\S]*?\n  \}/)?.[0] ?? '';
  assert.match(shutdown, /settingsPersistTimer\?\.remove\(\)/);
  assert.match(shutdown, /feedbackReportUi\?\.destroy\(\)/);
  assert.match(shutdown, /cancelBindingCapture\?\.\(\)/);
  assert.match(shutdown, /SaveSystem\.persist\(\)/);
  assert.match(shutdown, /this\.input\.off\('wheel', this\.handleOptionsWheel\)/);
  assert.match(shutdown, /contentMask\?\.destroy\(\)/);
  assert.match(shutdown, /contentMaskShape\?\.destroy\(\)/);
});
