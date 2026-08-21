import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ARENA_ARCHETYPES } from '../src/game/config/arenaGeneration.ts';
import {
  NEON_CITY_ARCHETYPE_PROFILES,
  NEON_CITY_VISUAL_THEME,
  createArenaDressingPlan
} from '../src/game/arena/ArenaVisualTheme.ts';

const walls = Array.from({ length: 34 }, (_, index) => ({
  x: 180 + (index % 8) * 170,
  y: 170 + Math.floor(index / 8) * 190,
  w: index % 2 ? 140 : 30,
  h: index % 2 ? 30 : 140
}));

test('neon city provides a distinct visual reaction for every arena archetype', () => {
  assert.deepEqual(Object.keys(NEON_CITY_ARCHETYPE_PROFILES).sort(), [...ARENA_ARCHETYPES].sort());
  const motifs = new Set(ARENA_ARCHETYPES.map((template) => NEON_CITY_ARCHETYPE_PROFILES[template].floorMotif));
  assert.equal(motifs.size, ARENA_ARCHETYPES.length);
});

test('arena dressing is deterministic and presentation-only', () => {
  const layout = { seed: 917234, template: 'crossroads', walls };
  const before = structuredClone(layout);
  const first = createArenaDressingPlan(layout);
  const second = createArenaDressingPlan(layout);
  assert.deepEqual(first, second);
  assert.deepEqual(layout, before);
  assert.equal(first.themeId, 'neon-city');
  assert.equal(first.profile, NEON_CITY_ARCHETYPE_PROFILES.crossroads);
});

test('animated neon city dressing remains strictly bounded for late-game rendering', () => {
  for (const template of ARENA_ARCHETYPES) {
    const plan = createArenaDressingPlan({ seed: 44031, template, walls });
    assert.ok(plan.animatedNodeIndices.length <= NEON_CITY_VISUAL_THEME.maximumAnimatedNodes);
    assert.ok(plan.signWallIndices.length <= NEON_CITY_VISUAL_THEME.maximumSigns);
    assert.equal(new Set(plan.animatedNodeIndices).size, plan.animatedNodeIndices.length);
    assert.equal(new Set(plan.signWallIndices).size, plan.signWallIndices.length);
    assert.equal(plan.animatedNodeIndices.some((index) => plan.signWallIndices.includes(index)), false);
    assert.ok(plan.palmTreeCount >= 8 && plan.palmTreeCount <= NEON_CITY_VISUAL_THEME.maximumPalmTrees);
    assert.ok(plan.venueBannerCount >= 10 && plan.venueBannerCount <= NEON_CITY_VISUAL_THEME.maximumVenueBanners);
    assert.ok(plan.venueScreenCount >= 6 && plan.venueScreenCount <= NEON_CITY_VISUAL_THEME.maximumVenueScreens);
    assert.ok(plan.spectatorLightCount <= NEON_CITY_VISUAL_THEME.maximumSpectatorLights);
    assert.ok(plan.animatedVenueLightCount <= NEON_CITY_VISUAL_THEME.maximumAnimatedVenueLights);
  }
});

test('arena exterior uses recognizable four-sided stadium architecture instead of abstract stripe filler', () => {
  const source = readFileSync(new URL('../src/game/arena/ArenaVisualRenderer.ts', import.meta.url), 'utf8');

  assert.match(source, /drawBackdropAndBeachStadium/);
  assert.match(source, /drawCoastalApron/);
  assert.match(source, /drawStadiumStructure/);
  assert.match(source, /drawHorizontalGrandstand/);
  assert.match(source, /drawVerticalGrandstand/);
  assert.match(source, /drawHorizontalEntryGate/);
  assert.match(source, /drawVerticalEntryGate/);
  assert.match(source, /drawStadiumLightTowers/);
  assert.match(source, /drawPalmTrees/);
  assert.match(source, /drawVenueBanners/);
  assert.match(source, /N3ON BEACH CIRCUIT \/\/ LIVE/);
  assert.doesNotMatch(source, /waveStride/);
  assert.doesNotMatch(source, /drawHorizontalStand/);
  assert.doesNotMatch(source, /drawVerticalStand/);
  assert.doesNotMatch(source, /physics\.(?:add|world)/);
});

test('stadium static detail and advertising are baked once instead of replaying live vector work', () => {
  const source = readFileSync(new URL('../src/game/arena/ArenaVisualRenderer.ts', import.meta.url), 'utf8');

  assert.match(source, /scene\.make\.graphics\(\{ x: 0, y: 0 \}, false\)/);
  assert.match(source, /scene\.add\.renderTexture\(0, 0, WORLD_WIDTH, WORLD_HEIGHT\)/);
  assert.match(source, /cachedLayer\.draw\(\[graphics, \.\.\.labels\]\)/);
  assert.match(source, /graphics\.destroy\(\)/);
  assert.match(source, /staticSourceObjectsAfterBake: 0/);
  assert.match(source, /independentAnimationLoops: 1/);
  assert.match(source, /createVenueTextObjects/);
  assert.match(source, /NEON FIZZ/);
  assert.match(source, /BYTE COLA/);
  assert.match(source, /FLUX FUEL/);
  assert.match(source, /PIXEL CHIPS/);
  assert.doesNotMatch(source, /shadowBlur|BlurFilter|GlowFilter|setPostPipeline/);
});

test('different accepted seeds can select distinct city districts without changing topology inputs', () => {
  const districts = new Set();
  for (let seed = 1; seed <= 20; seed += 1) {
    districts.add(createArenaDressingPlan({ seed, template: 'open-field', walls }).district);
  }
  assert.ok(districts.size >= 3);
});

test('scene shutdown does not tear down Phaser-owned visuals or physics twice', () => {
  const source = readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');
  const roundCleanup = source.slice(
    source.indexOf('private cleanupRoundObjects(): void'),
    source.indexOf('private cleanup(): void')
  );
  const sceneCleanup = source.slice(source.indexOf('private cleanup(): void'));

  assert.match(roundCleanup, /this\.arenaVisuals\?\.destroy\(\)/);
  assert.match(roundCleanup, /this\.walls\?\.clear\(true, true\)/);
  assert.doesNotMatch(sceneCleanup, /this\.arenaVisuals\?\.destroy\(\)/);
  assert.doesNotMatch(sceneCleanup, /this\.walls\?\.clear\(true, true\)/);
});

test('a restarted Arena scene skips teardown of the previous disposed round', () => {
  const source = readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');
  const prepareRound = source.slice(
    source.indexOf('private prepareForRoundCreation(): void'),
    source.indexOf('private clearRoundCollections(): void')
  );
  const createRound = source.slice(
    source.indexOf('private createRoundFromDefinition'),
    source.indexOf('private drawProceduralArena')
  );
  const sceneCleanup = source.slice(source.indexOf('private cleanup(): void'));

  assert.match(createRound, /this\.prepareForRoundCreation\(\)/);
  assert.match(prepareRound, /if \(this\.hasLiveRoundObjects\)/);
  assert.match(prepareRound, /this\.cleanupRoundObjects\(\)/);
  assert.match(prepareRound, /this\.clearRoundCollections\(\)/);
  assert.match(sceneCleanup, /this\.hasLiveRoundObjects = false/);
  assert.match(sceneCleanup, /this\.clearRoundCollections\(\)/);
});
