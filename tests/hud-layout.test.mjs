import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculateHudLayout, formatHudCountdown } from '../src/game/systems/hudLayout.ts';

const overlaps = (a, b) => !(
  a.x + a.width <= b.x
  || b.x + b.width <= a.x
  || a.y + a.height <= b.y
  || b.y + b.height <= a.y
);

test('HUD perimeter clusters stay in bounds and the top row does not overlap', () => {
  for (const [width, height] of [[640, 480], [800, 600], [1024, 768], [1366, 768], [1920, 1080], [2560, 1080]]) {
    const layout = calculateHudLayout(width, height);
    for (const rect of [layout.vitals, layout.objective, layout.stats, layout.abilities]) {
      assert.ok(rect.x >= 0 && rect.y >= 0, `${width}x${height} starts outside the viewport`);
      assert.ok(rect.x + rect.width <= width, `${width}x${height} exceeds horizontal bounds`);
      assert.ok(rect.y + rect.height <= height, `${width}x${height} exceeds vertical bounds`);
    }
    assert.equal(overlaps(layout.vitals, layout.objective), false, `${width}x${height} vitals overlap objective`);
    assert.equal(overlaps(layout.objective, layout.stats), false, `${width}x${height} objective overlaps stats`);
    assert.equal(layout.vitals.height, layout.objective.height);
    assert.equal(layout.objective.height, layout.stats.height);
    assert.ok(layout.radar.diameter >= 120 && layout.radar.diameter <= 150);
    assert.ok(layout.radar.centerX - layout.radar.diameter / 2 >= 0);
    assert.ok(layout.radar.centerY + layout.radar.diameter / 2 <= height);
    assert.ok(layout.radar.centerX + layout.radar.diameter / 2 < layout.abilities.x);
  }
});

test('combat HUD uses one icon-led cyber deck with truthful resource and deployable state', () => {
  const hud = readFileSync(new URL('../src/game/systems/Hud.ts', import.meta.url), 'utf8');
  const arena = readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');
  for (const title of ['OPERATIVE // VITALS', 'TACTICAL OBJECTIVE', 'RUN CACHE // TELEMETRY', 'COMBAT COMMAND DECK']) {
    assert.match(hud, new RegExp(title.replaceAll('/', '\\/')));
  }
  for (const resource of ['credits', 'coreTokens', 'plasmaChips', 'fluxCores']) {
    assert.match(hud, new RegExp(`updateResource\\('${resource}'`));
  }
  assert.match(hud, /\['fence', 'turret', 'mine', 'shield'\] as const/);
  for (const ability of ['fence', 'turret', 'mine']) assert.match(hud, new RegExp(`id === '${ability}'`));
  assert.match(hud, /Layered energy bubble with orbit segments and crackling core/);
  assert.match(hud, /strokeCircle\(0, 0, 14\)/);
  assert.match(hud, /drawAbilitySegments/);
  assert.match(hud, /slot\.selected \? MAGENTA/);
  assert.match(arena, /fenceSlot\.count = this\.fences\.length/);
  assert.match(arena, /turretSlot\.capacity = turretCfg\.maxActive/);
  assert.match(arena, /const rack = this\.mineChargeRack\.snapshot/);
  assert.match(arena, /slot\.count = rack\.currentCharges/);
  assert.match(arena, /slot\.capacity = rack\.maxCharges/);
  assert.match(arena, /shieldSlot\.active \? 1 : 0/);
});

test('objective countdown is compact and rounds up partial seconds', () => {
  assert.equal(formatHudCountdown(null), '');
  assert.equal(formatHudCountdown(0), '00:00');
  assert.equal(formatHudCountdown(1), '00:01');
  assert.equal(formatHudCountdown(42_000), '00:42');
  assert.equal(formatHudCountdown(75_000), '01:15');
});

test('HUD customization scales and insets the same five clusters without leaving the viewport', () => {
  const compact = calculateHudLayout(1280, 720, { scale: 0.75, edgeMargin: 0 });
  const expanded = calculateHudLayout(1280, 720, { scale: 1.4, edgeMargin: 36 });
  assert.ok(expanded.safeArea > compact.safeArea);
  assert.ok(expanded.radar.diameter > compact.radar.diameter);
  assert.ok(expanded.abilities.height > compact.abilities.height);
  for (const rect of [expanded.vitals, expanded.objective, expanded.stats, expanded.abilities]) {
    assert.ok(rect.x >= expanded.safeArea);
    assert.ok(rect.x + rect.width <= 1280 - expanded.safeArea);
    assert.ok(rect.y + rect.height <= 720 - expanded.safeArea);
  }
  assert.equal(overlaps(expanded.vitals, expanded.objective), false);
  assert.equal(overlaps(expanded.objective, expanded.stats), false);
});
