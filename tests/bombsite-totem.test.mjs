import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const totem = readFileSync(new URL('../src/game/vfx/BombsiteTotemVfx.ts', import.meta.url), 'utf8');
const system = readFileSync(new URL('../src/game/mods/BombsiteModSystem.ts', import.meta.url), 'utf8');
const arena = readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');
const audio = readFileSync(new URL('../src/game/systems/AudioManager.ts', import.meta.url), 'utf8');

test('an applicable Bombsite Mod deploys one shared Totem exactly at the armed site center', () => {
  assert.match(system, /const TOTEM_VISUAL_MODS = \[/);
  assert.match(system, /'arc-surge', 'defuse-feedback', 'pressure-field'/);
  assert.match(system, /visual: this\.shouldShowField\(\) \? this\.createFieldVisual\(site\) : null/);
  assert.match(system, /if \(state\.visual\) this\.totems\.deploy\(site\.id, site\.x, site\.y, now\)/);
  assert.equal((system.match(/this\.totems\.deploy\(/g) ?? []).length, 1);
  assert.match(totem, /slot\.root\.setPosition\(x, y\)/);
});

test('Totem uses a bounded drop, impact, fissure, power-up, and idle lifecycle without timers or tweens', () => {
  assert.match(totem, /const MAX_ACTIVE_TOTEMS = 5/);
  assert.match(totem, /const TARGETING_MS = 160/);
  assert.match(totem, /const DROP_MS = 500/);
  assert.match(totem, /const TOTEM_RENDER_DEPTH = 11/);
  assert.match(totem, /const TOTEM_VISUAL_SCALE = 1\.16/);
  assert.match(totem, /setPosition\(0, -DROP_HEIGHT \* \(1 - eased\)\)/);
  assert.match(totem, /this\.beginImpact\(slot, now\)/);
  assert.match(totem, /this\.drawFissures\(slot\)/);
  assert.match(totem, /const FISSURE_HOLD_MS = 760/);
  assert.match(totem, /const FISSURE_FADE_MS = 1_900/);
  assert.match(totem, /const powered = easeOutCubic/);
  assert.doesNotMatch(totem, /tweens\.add|delayedCall|\.on\(/);
});

test('Totem slam fractures a wide irregular floor area with independently fading neon branches', () => {
  assert.match(totem, /const primaryRayCount = 11/);
  assert.match(totem, /const targetLength = 112 \+ seededUnit\(ray, 20\) \* 66/);
  assert.match(totem, /segment <= 6/);
  assert.match(totem, /this\.drawCrackSegment\(primary/);
  assert.match(totem, /this\.drawCrackSegment\(branches/);
  assert.match(totem, /const offshootLength = 12 \+ seededUnit/);
  assert.match(totem, /slot\.fissureBranches\.setAlpha/);
  assert.match(totem, /const FISSURE_BRANCH_FADE_MS = 1_850/);
});

test('Totem entrance debris is bounded, ballistic, glitchy, pooled, and fully retired', () => {
  assert.match(totem, /const DEBRIS_COUNT = 38/);
  assert.match(totem, /const LARGE_DEBRIS_COUNT = 8/);
  assert.match(totem, /const MEDIUM_DEBRIS_COUNT = 22/);
  assert.match(totem, /const DEBRIS_DRAW_INTERVAL_MS = 1000 \/ 30/);
  assert.match(totem, /const DEBRIS_MAX_LIFETIME_MS = 2_950/);
  assert.match(totem, /const DEBRIS_LIFETIME = new Float32Array/);
  assert.match(totem, /Math\.sin\(progress \* Math\.PI\) \* DEBRIS_HEIGHT\[index\]/);
  assert.match(totem, /const glitchFrame = Math\.floor/);
  assert.match(totem, /slot\.debris\.clear\(\)\.setVisible\(false\)/);
  assert.match(totem, /slot\.debris\.clear\(\)/);
  assert.doesNotMatch(totem, /physics\.add|add\.sprite|add\.particles|tweens\.add|delayedCall/);
});

test('Totem chassis is a semi-solid pseudo-3D pole with a neon tiki face and visible powered accents', () => {
  assert.match(totem, /const frontFace = \[/);
  assert.match(totem, /const sideFace = \[/);
  assert.match(totem, /const topFace = \[/);
  assert.match(totem, /fillPoints\(frontFace, true, true\)/);
  assert.match(totem, /strokePoints\(sideFace, true, true\)/);
  assert.match(totem, /private drawTikiFace/);
  assert.match(totem, /slot\.face\.setAlpha/);
  assert.match(totem, /slot\.channels\.setAlpha\(0\.62\)/);
  assert.match(totem, /slot\.innerRing[\s\S]*?setAlpha\(0\.62\)/);
  assert.match(totem, /setDepth\(TOTEM_RENDER_DEPTH\)/);
});

test('Totem effects consume authoritative Bombsite Mod radii and preserve cyan push and orange damage language', () => {
  assert.match(system, /MOD_BALANCE\.bombsite\.countermeasureArray\.radius/);
  assert.match(system, /modId === 'ground-zero' \? 0xff8a32 : 0x69efff/);
  assert.match(system, /modId === 'ground-zero' \? 'damage' : 'push'/);
  assert.match(system, /this\.totems\.trigger\(site\.id, color, radius, this\.scene\.time\.now, duration, kind\)/);
  assert.match(system, /0xc36cff, config\.outerRadius, 650, 'control'/);
  assert.match(system, /0xff542f : 0xffa238, config\.radius\[stage\].*'damage'/s);
  assert.match(system, /this\.totems\.flash\(site\.id, 0x7dfff2, now, 'electric'\)/);
});

test('Totem is removed for detonation, successful defuse, defeat, round cleanup, and scene shutdown', () => {
  assert.match(arena, /this\.bombsiteMods\.onBombDetonationStarted\(site, this\.time\.now\)/);
  assert.match(arena, /recordDefuseCompleted\(site\.id\);\s+this\.bombsiteMods\.onBombDestroyed\(site\)/);
  assert.match(arena, /this\.bombsiteMods\?\.destroy\(\);\s+this\.physics\.pause\(\)/);
  assert.ok((arena.match(/this\.bombsiteMods\?\.destroy\(\)/g) ?? []).length >= 3);
  assert.match(system, /this\.totems\.remove\(site\.id\)/);
  assert.match(system, /this\.totems\.destroy\(\)/);
  assert.match(totem, /slot\.fissures\.clear\(\)/);
  assert.match(totem, /slot\.fissureBranches\.clear\(\)/);
  assert.match(totem, /slot\.debris\.clear\(\)/);
  assert.match(totem, /slot\.dynamic\.clear\(\)/);
});

test('five Totems reuse bounded slots and redraw only active impact, charge, and pulse state', () => {
  assert.match(totem, /if \(this\.slots\.length >= MAX_ACTIVE_TOTEMS\) return null/);
  assert.match(totem, /for \(const slot of this\.slots\) if \(!slot\.active\) return slot/);
  assert.match(totem, /for \(const slot of this\.slots\) \{\s+if \(!slot\.active\) continue;/);
  assert.match(totem, /const RAY_COS = new Float32Array/);
  assert.match(totem, /const RAY_SIN = new Float32Array/);
  assert.match(totem, /if \(frame === slot\.lastDebrisFrame\) return/);
  assert.match(totem, /graphics\.clear\(\)/);
});

test('bombsite detonation reuses the mine explosion renderer at a larger scale and shared explosion recording', () => {
  assert.match(arena, /const BOMBSITE_EXPLOSION_VISUAL_RADIUS = 520/);
  assert.match(arena, /this\.audio\.playSfx\('bomb'\)/);
  assert.match(arena, /this\.mineExplosionVfx\.emitColors\([\s\S]*?BOMBSITE_EXPLOSION_VISUAL_RADIUS/);
  assert.doesNotMatch(arena, /for \(let i = 0; i < 70; i \+= 1\)/);
  assert.match(audio, /case 'bomblet':[\s\S]*?case 'mine':[\s\S]*?case 'bomb':[\s\S]*?this\.playBombletSfx\(name\)/);
});
