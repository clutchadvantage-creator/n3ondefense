import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COSMETICS, getCosmeticPurchaseCosts } from '../src/data/cosmetics.ts';
import { createMineFrameSvgDataUri, createMineFrameSvgMarkup } from '../src/game/cosmetics/MineFrameArt.ts';
import { resolveMineFrameAppearance } from '../src/game/cosmetics/MineFrameAppearance.ts';
import { createDefaultLocalSave, normalizeLocalSave } from '../src/game/save/SaveValidator.ts';
import { calculateGearLockerLayout } from '../src/game/garage/gearLockerLayout.ts';

const mineRuntime = readFileSync(new URL('../src/game/abilities/Mine.ts', import.meta.url), 'utf8');
const arena = readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');
const heist = readFileSync(new URL('../src/game/anomalies/heist/HeistScene.ts', import.meta.url), 'utf8');
const boot = readFileSync(new URL('../src/game/scenes/BootScene.ts', import.meta.url), 'utf8');
const preview = readFileSync(new URL('../src/game/cosmetics/CosmeticPreview.ts', import.meta.url), 'utf8');
const store = readFileSync(new URL('../src/ui/stores/StorefrontUi.ts', import.meta.url), 'utf8');
const locker = readFileSync(new URL('../src/game/garage/GearLockerUi.ts', import.meta.url), 'utf8');
const economy = readFileSync(new URL('../src/game/economy/EconomyAnalytics.ts', import.meta.url), 'utf8');

const EXPECTED = new Map([
  ['mine-road-hazard', 'road-hazard'],
  ['mine-lifeline', 'lifeline'],
  ['mine-hatchling', 'hatchling'],
  ['mine-bed-side-manner', 'bed-side-manner'],
  ['mine-old-reliable', 'old-reliable'],
  ['mine-pond-trap', 'pond-trap'],
  ['mine-breakfast-blast', 'breakfast-blast'],
  ['mine-roll-station', 'roll-station'],
  ['mine-watcher', 'watcher']
]);

test('all nine premium Mine Frames are distinct multi-currency catalog entries', () => {
  const renderedArt = new Set();
  for (const [id, effect] of EXPECTED) {
    const item = COSMETICS.find((candidate) => candidate.id === id);
    assert.ok(item, id);
    assert.equal(item.category, 'mineFrame');
    assert.equal(item.mineFrameEffect, effect);
    assert.equal(item.priceTier, 'prestige');
    assert.ok(item.textureKey?.startsWith('mine-frame-'));
    assert.ok(item.description?.length > 80);
    const costs = getCosmeticPurchaseCosts(item);
    assert.ok(costs.credits >= 10_000, `${id} credit price`);
    assert.ok(costs.coreTokens >= 200, `${id} core token price`);
    assert.ok(costs.plasmaChips <= 100, `${id} plasma chip cap`);
    const svg = createMineFrameSvgMarkup(effect, item.color, item.accentColor ?? item.color);
    assert.match(svg, new RegExp(`data-mine-frame="${effect}"`));
    assert.match(svg, /viewBox="0 0 200 170"/);
    renderedArt.add(svg);
  }
  assert.equal(renderedArt.size, EXPECTED.size, 'each Mine Frame must have authored artwork');
});

test('the original mine is the free default and older profiles migrate safely', () => {
  const fallback = COSMETICS.find((item) => item.id === 'mine-default');
  assert.ok(fallback);
  assert.equal(fallback.category, 'mineFrame');
  assert.equal(fallback.cost, 0);
  assert.equal(resolveMineFrameAppearance(fallback), undefined, 'default keeps the original procedural mine');

  const oldSave = createDefaultLocalSave('mine-old-save', 'Mine Old Save');
  delete oldSave.cosmetics.equipped.mineFrame;
  oldSave.cosmetics.owned = oldSave.cosmetics.owned.filter((id) => id !== 'mine-default');
  const migrated = normalizeLocalSave(oldSave);
  assert.ok(migrated);
  assert.ok(migrated.cosmetics.owned.includes('mine-default'));
  assert.equal(migrated.cosmetics.equipped.mineFrame, 'mine-default');
});

test('owned and equipped premium Mine Frames survive profile normalization', () => {
  const save = createDefaultLocalSave('mine-frame-save', 'Mine Frame Save');
  save.cosmetics.owned.push('mine-watcher');
  save.cosmetics.equipped.mineFrame = 'mine-watcher';
  const restored = normalizeLocalSave(save);
  assert.ok(restored);
  assert.ok(restored.cosmetics.owned.includes('mine-watcher'));
  assert.equal(restored.cosmetics.equipped.mineFrame, 'mine-watcher');
  assert.equal(resolveMineFrameAppearance(COSMETICS.find((item) => item.id === 'mine-watcher'))?.textureKey, 'mine-frame-watcher');
});

test('Mine Frames use cached art with shared arming overlays and unchanged combat fields', () => {
  assert.match(boot, /category !== 'mineFrame'/);
  assert.match(boot, /createMineFrameSvgDataUri/);
  assert.match(mineRuntime, /scene\.textures\.exists\(frameAppearance\.textureKey\)/);
  assert.match(mineRuntime, /scene\.add\.image\(0, 0, frameAppearance\.textureKey\)/);
  assert.match(mineRuntime, /this\.damage = damage/);
  assert.match(mineRuntime, /this\.radius = radius/);
  assert.match(mineRuntime, /this\.armAt = scene\.time\.now/);
  assert.match(mineRuntime, /this\.armed = true/);
  assert.match(mineRuntime, /this\.core\.setFillStyle/);
  assert.match(arena, /getEquippedCosmeticId\('mineFrame'\)/);
  assert.match(heist, /getEquippedCosmeticId\('mineFrame'\)/);
  assert.match(arena, /STAR_DEATH_MINE_VISUAL_THEME/);
});

test('Mine Frame Phaser textures use valid base64 SVG data URIs', () => {
  const uri = createMineFrameSvgDataUri('road-hazard', 0xffa52e, 0xff445f);
  assert.match(uri, /^data:image\/svg\+xml;base64,/);
  const decoded = Buffer.from(uri.slice(uri.indexOf(',') + 1), 'base64').toString('utf8');
  assert.match(decoded, /data-mine-frame="road-hazard"/);
  assert.match(decoded, /^<svg/);
});

test('Roll Station reads as a deep rolling tray with a restrained weed-leaf detail', () => {
  const svg = createMineFrameSvgMarkup('roll-station', 0x72ff82, 0xb66cff);
  assert.match(svg, /mf-tray-side/);
  assert.match(svg, /mf-tray-front/);
  assert.match(svg, /mf-tray-rim/);
  assert.match(svg, /mf-weed-leaf/);
  assert.match(svg, /mf-weed-stem/);
  assert.match(svg, /mf-core/);
});

test('Store, Gear Locker, Economy Console, and controller-ready category navigation include Mine Frames', () => {
  assert.match(store, /mineFrame: 'Mine Frames'/);
  assert.match(store, /createMineFrameSvg\(item\.mineFrameEffect \?\? 'default'/);
  assert.match(preview, /case 'mineFrame'/);
  assert.match(locker, /mineFrame: 'MINE FRAMES'/);
  assert.match(locker, /case 'mineFrame'/);
  assert.match(economy, /mineFrame: 'Mine Frames'/);
  assert.match(store, /dataset\.controllerTabGroup = 'store-category'/);
  assert.match(store, /dataset\.controllerFocusId = `store-category-\$\{category\}`/);
});

test('the official equipment category names are consistent across Store and Gear Locker', () => {
  for (const name of ['Operative Frames', 'Turret Frames', 'Mine Frames', 'Fence Frames']) {
    assert.match(store, new RegExp(name));
    assert.match(locker, new RegExp(name.toUpperCase()));
  }
});

test('the expanded ten-category Gear Locker remains bounded at common desktop resolutions', () => {
  const categoryCount = new Set(COSMETICS.map((item) => item.category)).size;
  assert.equal(categoryCount, 10);
  for (const [width, height] of [[2560, 1440], [1920, 1080], [1600, 900], [1366, 768]]) {
    const layout = calculateGearLockerLayout(width, height, categoryCount);
    assert.ok(layout.visibleCategoryCount >= 3 && layout.visibleCategoryCount <= categoryCount);
    assert.ok(layout.inventory.x >= layout.safe);
    assert.ok(layout.inventory.x + layout.inventory.width < layout.preview.x);
    assert.ok(layout.preview.x + layout.preview.width <= width - layout.safe);
    assert.ok(layout.inventory.y + layout.inventory.height < layout.footerY - layout.footerHeight / 2);
  }
});
