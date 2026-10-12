import test from 'node:test';
import assert from 'node:assert/strict';
import { COSMETICS, getCosmeticById, resolveOperativeFrameAppearance } from '../src/data/cosmetics.ts';
import { HOLIDAY_WINDOWS, isHolidayActive, isCosmeticInSeason, getSeasonalStoreInventory, getStoreCalendarKey } from '../src/game/cosmetics/SeasonalStore.ts';
import { createHalloweenSvg, halloweenSvgDataUri, HALLOWEEN_PARTS } from '../src/game/cosmetics/HalloweenCosmeticArt.ts';
import { HALLOWEEN_TIMING, halloweenCelebrationEnvelope, halloweenRevealScale } from '../src/game/cosmetics/HalloweenCelebrationTiming.ts';
import { createDefaultLocalSave, normalizeLocalSave } from '../src/game/save/SaveValidator.ts';
import { resolveProjectileCosmeticPresentation } from '../src/game/cosmetics/ProjectileCosmeticPresentation.ts';
import { resolveMineFrameAppearance } from '../src/game/cosmetics/MineFrameAppearance.ts';

const local = (year, month, day, hour = 12) => new Date(year, month - 1, day, hour, 0, 0);

for (const year of [2026, 2027, 2028]) {
  test(`annual holiday boundaries use inclusive local calendar days in ${year}`, () => {
    for (const [id, month, day, active] of [
      ['halloween', 9, 30, false], ['halloween', 10, 1, true], ['halloween', 10, 11, true], ['halloween', 11, 1, true], ['halloween', 11, 2, false],
      ['christmas', 12, 4, false], ['christmas', 12, 5, true], ['christmas', 12, 31, true], ['christmas', 1, 1, true], ['christmas', 1, 3, true], ['christmas', 1, 4, false],
      ['independence-day', 6, 23, false], ['independence-day', 6, 24, true], ['independence-day', 7, 4, true], ['independence-day', 7, 5, true], ['independence-day', 7, 6, false]
    ]) for (const hour of [0, 23]) assert.equal(isHolidayActive(id, local(year, month, day, hour)), active, `${id} ${month}/${day} ${hour}:00`);
  });
}

test('off-season discovery hides holiday goods without removing catalog identities', () => {
  const seasonal = COSMETICS.filter(item => item.holiday);
  assert.equal(seasonal.length, 15);
  const ordinary = COSMETICS.filter(item => !item.holiday);
  const summer = getSeasonalStoreInventory(COSMETICS, local(2026, 8, 1));
  assert.deepEqual(new Set(summer.map(item => item.id)), new Set(ordinary.map(item => item.id)));
  const halloween = getSeasonalStoreInventory(COSMETICS, local(2026, 10, 11));
  assert.equal(halloween.length, COSMETICS.length);
  assert.ok(halloween.slice(0, 15).every(item => item.holiday === 'halloween'));
  assert.ok(getCosmeticById('bomb-witch-signal'));
  assert.ok(getCosmeticById('bomb-neon-bats'));
  assert.equal(new Set(COSMETICS.map(item => item.id)).size, COSMETICS.length);
});

test('calendar supports tagged Christmas and July items without a separate rotation implementation', () => {
  for (const window of HOLIDAY_WINDOWS) {
    const item = { ...getCosmeticById('player-circle'), id: `future-${window.id}`, holiday: window.id };
    assert.equal(isCosmeticInSeason(item, local(2026, ...window.start)), true);
    assert.equal(isCosmeticInSeason(item, local(2026, ...window.end)), true);
    assert.equal(isCosmeticInSeason(item, local(2026, 3, 15)), false);
  }
  assert.equal(isHolidayActive('halloween', new Date(NaN)), false);
  assert.equal(getStoreCalendarKey(local(2026, 11, 1, 23)), getStoreCalendarKey(local(2026, 11, 1, 0)));
  assert.notEqual(getStoreCalendarKey(local(2026, 11, 1)), getStoreCalendarKey(local(2026, 11, 2)));
});

for (const set of ['witch', 'bats', 'pumpkin']) {
  test(`${set} has a complete five-piece set, durable ownership, and native combat art`, () => {
    const items = COSMETICS.filter(item => item.halloweenSet === set);
    assert.deepEqual(new Set(items.map(item => item.category)), new Set(['playerShape', 'turretSkin', 'mineFrame', 'projectileShape', 'bombColor']));
    assert.equal(items.length, 5);
    const save = createDefaultLocalSave(`halloween-${set}`, 'Halloween Audit');
    for (const item of items) {
      assert.equal(item.priceTier, 'prestige');
      save.cosmetics.owned.push(item.id);
      save.cosmetics.equipped[item.category] = item.id;
    }
    const restored = normalizeLocalSave(save);
    for (const item of items) {
      assert.ok(restored.cosmetics.owned.includes(item.id));
      assert.equal(restored.cosmetics.equipped[item.category], item.id);
    }
    const frame = items.find(item => item.category === 'playerShape');
    assert.equal(resolveOperativeFrameAppearance(frame.id, 'player-native').textureKey, frame.nativeTextureKey);
    assert.equal(resolveOperativeFrameAppearance(frame.id, 'player-native').tint, null);
    assert.equal(resolveOperativeFrameAppearance(frame.id, 'player-pink').textureKey, frame.textureKey);
    assert.equal(resolveMineFrameAppearance(items.find(item => item.category === 'mineFrame')).textureKey, `mine-halloween-${set}`);
    const projectile = resolveProjectileCosmeticPresentation(items.find(item => item.category === 'projectileShape'));
    assert.equal(projectile.preserveNativePalette, true);
    assert.ok(projectile.displayWidth >= 20);
  });

  test(`${set} art variants and animated parts serialize with isolated gradients`, () => {
    const ids = new Set();
    for (const kind of ['operative', 'turret', 'mine', 'projectile', 'bomb', ...HALLOWEEN_PARTS]) {
      const source = createHalloweenSvg(set, kind, { part: HALLOWEEN_PARTS.includes(kind), animate: true });
      const id = source.match(/id="([^"]+)"/)[1];
      assert.ok(!ids.has(id)); ids.add(id);
      assert.match(source, /viewBox="0 0 256 256"/);
      assert.ok(source.includes(`#${id} .hw-shell`), 'styles scoped to this SVG');
      assert.ok(source.includes(`url(#${id}-shell)`));
      assert.ok(!source.includes('undefined'));
      const decoded = Buffer.from(halloweenSvgDataUri(source).split(',')[1], 'base64').toString('utf8');
      assert.equal(decoded, source);
    }
  });
}

test('celebrations reveal with an overshoot and fade to zero with no runaway scale', () => {
  assert.equal(halloweenCelebrationEnvelope(0), 0);
  assert.equal(halloweenCelebrationEnvelope(1000), 1);
  assert.equal(halloweenCelebrationEnvelope(HALLOWEEN_TIMING.end), 0);
  assert.equal(halloweenCelebrationEnvelope(HALLOWEEN_TIMING.end + 1000), 0);
  assert.ok(halloweenRevealScale(400) > 1);
  assert.equal(halloweenRevealScale(1000), 1);
  for (let time = -100; time <= 5000; time += 17) {
    assert.ok(halloweenCelebrationEnvelope(time) >= 0 && halloweenCelebrationEnvelope(time) <= 1);
    assert.ok(halloweenRevealScale(time) > .1 && halloweenRevealScale(time) < 1.2);
  }
});
