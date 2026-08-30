import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const scene = readFileSync(new URL('../src/game/scenes/LocalProfileScene.ts', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../src/ui/local-profiles/LocalProfilesUi.ts', import.meta.url), 'utf8');
const card = readFileSync(new URL('../src/ui/local-profiles/ProfileCard.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/ui/local-profiles/local-profiles.css', import.meta.url), 'utf8');
const backdrop = readFileSync(new URL('../src/game/rendering/ProfileArchiveBackdrop.ts', import.meta.url), 'utf8');

test('Local Profiles uses the shared neon command-console visual language', () => {
  assert.match(ui, /local-profiles-shell-chrome/);
  assert.match(ui, /N3ON IDENTITY \/\/ LOCAL VAULT/);
  assert.match(ui, /PROFILE LINK \/\/ SYNCED/);
  assert.match(ui, /OPERATIVE ARCHIVE \/\/ LOCAL IDENTITY CONTROL/);
  assert.match(ui, /PROFILE ARCHIVE \/\/ YOUR PROFILES/);
  assert.match(ui, /SELECTED OPERATIVE \/\/ PROFILE LINK/);
  assert.match(css, /repeating-linear-gradient/);
  assert.match(css, /clip-path: polygon/);
  assert.match(css, /--profile-cyan/);
  assert.match(css, /--profile-pink/);
  assert.match(css, /profile-link-pulse/);
  assert.match(card, /dataset\.profileStatus/);
});

test('Local Profiles visual refactor preserves all profile management routes', () => {
  for (const callback of [
    'onSelect',
    'onContinue',
    'onCreate',
    'onRename',
    'onExport',
    'onImport',
    'onDelete',
    'onLocalSaveInfo',
    'onRestoreBackup'
  ]) {
    assert.match(ui, new RegExp(`this\\.callbacks\\.${callback}`));
  }
  assert.match(scene, /SaveSystem\.selectProfile/);
  assert.match(scene, /SaveSystem\.createProfile/);
  assert.match(scene, /SaveSystem\.renameProfile/);
  assert.match(scene, /SaveSystem\.exportProfile/);
  assert.match(scene, /SaveSystem\.importProfile/);
  assert.match(scene, /SaveSystem\.deleteProfile/);
  assert.match(scene, /SaveSystem\.restoreBackup/);
});

test('Local Profiles keeps responsive and reduced-motion safeguards', () => {
  assert.match(css, /@media \(max-width: 900px\)/);
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /@media \(max-height: 760px\) and \(min-width: 901px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /overflow: auto/);
});

test('Local Profiles uses one static archive backdrop built from existing N3ONDefense art', () => {
  assert.match(scene, /new ProfileArchiveBackdrop\(this\)/);
  assert.match(scene, /archiveBackdrop\?\.resize\(gameSize\.width, gameSize\.height\)/);
  assert.match(scene, /archiveBackdrop\?\.destroy\(\)/);
  assert.match(backdrop, /ENEMY_ROBOT_FRAMES/);
  assert.match(backdrop, /createEnvironmentDecalPlan/);
  assert.match(backdrop, /createEnvironmentGraffitiArt/);
  assert.match(backdrop, /drawBeveledTechPlate/);
  assert.match(backdrop, /drawHazardStripes/);
  assert.match(backdrop, /drawPanelBolts/);
  assert.match(backdrop, /drawVentSlats/);
  assert.match(backdrop, /scene\.add\.renderTexture/);
  assert.match(backdrop, /maximumCompositePixels: MAX_COMPOSITE_WIDTH \* MAX_COMPOSITE_HEIGHT/);
});

test('profile archive art has no gameplay simulation or interactive background surface', () => {
  assert.match(backdrop, /gameplayEntities: 0/);
  assert.match(backdrop, /physicsBodies: 0/);
  assert.match(backdrop, /animationLoops: 0/);
  assert.doesNotMatch(backdrop, /ArenaScene|new Enemy|physics\.add|scene\.physics|\.tweens|particles|update\(/);
  assert.match(css, /\.local-profiles-screen::before,[\s\S]*?pointer-events: none/);
  assert.doesNotMatch(ui, /archiveBackdrop|background.*addEventListener/);
});
