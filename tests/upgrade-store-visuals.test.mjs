import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { UPGRADE_DEFINITIONS } from '../src/data/upgrades.ts';
import { getUpgradeVisual } from '../src/ui/stores/upgradePresentation.ts';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('every registered upgrade declares a complete contextual presentation', () => {
  const ids = new Set();
  for (const definition of UPGRADE_DEFINITIONS) {
    assert.equal(ids.has(definition.id), false, `duplicate upgrade id ${definition.id}`);
    ids.add(definition.id);
    const visual = getUpgradeVisual(definition);
    assert.ok(visual.hero, `${definition.id} hero`);
    assert.ok(visual.effect, `${definition.id} effect`);
    assert.ok(['increase', 'decrease', 'add'].includes(visual.direction), `${definition.id} direction`);
    assert.ok(['hero-effect', 'capacity', 'radial', 'directional'].includes(visual.layout), `${definition.id} layout`);
  }
});

test('key upgrade meanings use the requested equipment, effect, and direction language', () => {
  const visual = (id) => getUpgradeVisual(UPGRADE_DEFINITIONS.find((definition) => definition.id === id));
  assert.deepEqual(visual('player.maxHealth'), { hero: 'operative', effect: 'health', direction: 'add', layout: 'capacity', accent: 'green' });
  assert.deepEqual(visual('player.dashCooldown'), { hero: 'operative', effect: 'dash', direction: 'decrease', layout: 'directional', accent: 'cyan' });
  assert.deepEqual(visual('player.energyMax'), { hero: 'operative', effect: 'battery', direction: 'increase', layout: 'capacity', accent: 'green' });
  assert.deepEqual(visual('turret.damage'), { hero: 'turret', effect: 'damage', direction: 'increase', layout: 'hero-effect', accent: 'gold' });
  assert.deepEqual(visual('mine.radius'), { hero: 'mine', effect: 'range', direction: 'increase', layout: 'radial', accent: 'cyan' });
});

test('Upgrade Store uses reusable SVG clusters and the equipped operative appearance', () => {
  const storefront = source('../src/ui/stores/StorefrontUi.ts');
  const registry = source('../src/ui/stores/UpgradeIconRegistry.ts');
  const css = source('../src/ui/stores/storefront.css');
  assert.match(storefront, /renderUpgradeVisual\(item, snapshot, false\)/);
  assert.match(storefront, /snapshot\.equippedCosmetics\.playerShape/);
  assert.match(storefront, /snapshot\.equippedCosmetics\.playerColor/);
  assert.match(storefront, /createUpgradeSvgIcon/);
  assert.doesNotMatch(storefront, /private upgradeIcon/);
  assert.match(registry, /ICON_GEOMETRY/);
  assert.match(registry, /createElementNS/);
  assert.match(css, /\.upgrade-visual-cluster/);
  assert.match(css, /\.tech-ring \.upgrade-visual-cluster\.large/);
});

