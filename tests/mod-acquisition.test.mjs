import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  LEGENDARY_MOD_REVEAL_HOLD_MS,
  NORMAL_MOD_REVEAL_HOLD_MS,
  calculateModRevealCardWidth,
  enqueueModAcquisition
} from '../src/game/mods/ModAcquisition.ts';
import { DEFAULT_AUDIO_VOLUME, SFX_DEFINITIONS, createDefaultSoundVolumes } from '../src/game/config/audio.ts';
import { SceneKeys, SceneStatusOrder } from '../src/game/flow/SceneKeys.ts';

const request = (id, rarity) => ({
  card: { instanceId: id, modId: id, acquiredAt: '2026-01-01T00:00:00.000Z', upgradeLevel: 0 },
  rarity,
  duplicate: false,
  sourceScreenX: 100,
  sourceScreenY: 100
});

test('Legendary presentations move ahead of waiting standard cards without dropping FIFO requests', () => {
  const queue = [];
  enqueueModAcquisition(queue, request('common-a', 'common'));
  enqueueModAcquisition(queue, request('rare-a', 'rare'));
  enqueueModAcquisition(queue, request('legendary-a', 'legendary'));
  enqueueModAcquisition(queue, request('legendary-b', 'legendary'));
  enqueueModAcquisition(queue, request('epic-a', 'epic'));
  assert.deepEqual(queue.map((entry) => entry.card.instanceId), [
    'legendary-a',
    'legendary-b',
    'common-a',
    'rare-a',
    'epic-a'
  ]);
});

test('Mod reveal cards retain their full aspect ratio inside supported and compact viewports', () => {
  for (const [width, height] of [[320, 300], [640, 480], [1024, 768], [1920, 1080]]) {
    for (const legendary of [false, true]) {
      const cardWidth = calculateModRevealCardWidth(width, height, legendary);
      const reservedHeight = legendary ? 150 : 130;
      assert.ok(cardWidth >= 96);
      assert.ok(cardWidth <= width - 40);
      assert.ok(cardWidth * 1.4 <= height - reservedHeight + 0.001);
    }
  }
  assert.ok(NORMAL_MOD_REVEAL_HOLD_MS >= 2_000);
  assert.ok(LEGENDARY_MOD_REVEAL_HOLD_MS >= 2_000);
});

test('Legendary Mod audio uses the central SFX mixer and reveal scene is registered', () => {
  assert.ok(SFX_DEFINITIONS.some((definition) => definition.key === 'legendaryMod'));
  assert.ok(SFX_DEFINITIONS.some((definition) => definition.key === 'modCollection'));
  assert.equal(createDefaultSoundVolumes().legendaryMod, DEFAULT_AUDIO_VOLUME);
  assert.equal(createDefaultSoundVolumes().modCollection, DEFAULT_AUDIO_VOLUME);
  assert.ok(SceneStatusOrder.includes(SceneKeys.LegendaryModReveal));
});

test('standard and Legendary gameplay reveals use their dedicated recordings', () => {
  assert.ok(existsSync(new URL('../public/assets/audio/soundeffects/modcollectionsound.mp3', import.meta.url)));
  assert.ok(existsSync(new URL('../public/assets/audio/soundeffects/legendarymodsound.mp3', import.meta.url)));
  const audio = readFileSync(new URL('../src/game/systems/AudioManager.ts', import.meta.url), 'utf8');
  const presenter = readFileSync(new URL('../src/game/mods/ModAcquisitionPresenter.ts', import.meta.url), 'utf8');
  const legendary = readFileSync(new URL('../src/game/scenes/LegendaryModRevealScene.ts', import.meta.url), 'utf8');
  assert.match(audio, /audioAssetUrl\('soundeffects\/modcollectionsound\.mp3'\)/);
  assert.match(audio, /audioAssetUrl\('soundeffects\/legendarymodsound\.mp3'\)/);
  assert.doesNotMatch(audio, /playLegendaryModSfx|const notes = \[164\.81/);
  assert.match(presenter, /AudioManager\.get\(\)\.playSfx\('modCollection'\)/);
  assert.match(legendary, /AudioManager\.get\(\)\.playSfx\('legendaryMod'\)/);
});
