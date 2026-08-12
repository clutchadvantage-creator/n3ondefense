import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { joinAssetBase } from '../src/game/utils/assetUrl.ts';

test('public asset URLs preserve the website root and support an itch-relative base', () => {
  assert.equal(joinAssetBase('/', '/assets/audio/test.mp3'), '/assets/audio/test.mp3');
  assert.equal(joinAssetBase('./', '/assets/audio/test.mp3'), './assets/audio/test.mp3');
  assert.equal(joinAssetBase('/preview', 'assets/image.png'), '/preview/assets/image.png');
});

test('itch build has an isolated relative-base config and packaging command', () => {
  const config = readFileSync(new URL('../vite.itch.config.ts', import.meta.url), 'utf8');
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(config, /base:\s*['"]\.\/['"]/);
  assert.match(config, /outDir:\s*['"]dist-itch['"]/);
  assert.equal(packageJson.scripts.build, 'tsc && vite build');
  assert.match(packageJson.scripts['build:itch'], /--config vite\.itch\.config\.ts --mode production/);
  assert.match(packageJson.scripts['package:itch'], /scripts\/package-itch\.mjs/);
});

test('runtime audio paths use the shared Vite base instead of root-relative assets', () => {
  const audio = readFileSync(new URL('../src/game/systems/AudioManager.ts', import.meta.url), 'utf8');
  const boot = readFileSync(new URL('../src/game/scenes/BootScene.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(audio, /['"]\/assets\//);
  assert.match(audio, /publicAssetUrl/);
  assert.match(boot, /publicAssetUrl\('assets\/audio\/soundeffects\/boostsound\.mp3'\)/);
});
