import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const totem = readFileSync(new URL('../src/game/vfx/BombsiteTotemVfx.ts', import.meta.url), 'utf8');
const system = readFileSync(new URL('../src/game/mods/BombsiteModSystem.ts', import.meta.url), 'utf8');
const arena = readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');

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
  assert.match(totem, /setPosition\(0, -DROP_HEIGHT \* \(1 - eased\)\)/);
  assert.match(totem, /this\.beginImpact\(slot, now\)/);
  assert.match(totem, /this\.drawFissures\(slot\)/);
  assert.match(totem, /const FISSURE_FADE_MS = 1_250/);
  assert.match(totem, /const powered = easeOutCubic/);
  assert.doesNotMatch(totem, /tweens\.add|delayedCall|\.on\(/);
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
  assert.match(totem, /slot\.dynamic\.clear\(\)/);
});

test('five Totems reuse bounded slots and redraw only active impact, charge, and pulse state', () => {
  assert.match(totem, /if \(this\.slots\.length >= MAX_ACTIVE_TOTEMS\) return null/);
  assert.match(totem, /for \(const slot of this\.slots\) if \(!slot\.active\) return slot/);
  assert.match(totem, /for \(const slot of this\.slots\) \{\s+if \(!slot\.active\) continue;/);
  assert.match(totem, /const RAY_COS = new Float32Array/);
  assert.match(totem, /const RAY_SIN = new Float32Array/);
  assert.match(totem, /graphics\.clear\(\)/);
});
