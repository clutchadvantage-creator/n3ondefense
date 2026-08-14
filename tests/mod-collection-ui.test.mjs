import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const scene = readFileSync(new URL('../src/game/scenes/ModCollectionScene.ts', import.meta.url), 'utf8');
const presentation = readFileSync(new URL('../src/game/ui/ModCollectionUi.ts', import.meta.url), 'utf8');

test('Mod Collection uses the shared cyber-console visual language without replacing its card renderer', () => {
  assert.match(scene, /createModCollectionShell\(this, width, height/);
  assert.match(scene, /createModCollectionFrame\(this/);
  assert.match(scene, /createModCollectionButton\(this/);
  assert.match(scene, /createModCardView\(this/);
  assert.match(presentation, /chamferedPoints/);
  assert.match(presentation, /MOD CARD COLLECTION/);
  assert.match(presentation, /OPERATIVE ARCHIVE \/\/ MODULAR INVENTORY CONTROL/);
  assert.match(presentation, /leftRail/);
  assert.match(presentation, /rightRail/);
  assert.match(presentation, /COLLECTION LINK \/\/ SYNCED/);
});

test('collection presentation delegates to existing buttons and preserves disabled and locked feedback', () => {
  assert.match(presentation, /const button = createButton\(/);
  assert.match(scene, /disableButton\(recycleAll\)/);
  assert.match(scene, /disableButton\(upgradeButton\)/);
  assert.match(scene, /disableButton\(install\)/);
  assert.match(scene, /private apply\([\s\S]*?return result\.ok/);
});

test('filters, pagination, inventory actions, infusions, and return routing remain connected', () => {
  assert.match(scene, /const CATEGORIES:[\s\S]*?'bombSite'[\s\S]*?'utility'/);
  assert.match(scene, /const SORTS: SortMode\[\] = \['acquired', 'type', 'rank', 'rarity'\]/);
  assert.match(scene, /const FILTERS: FilterMode\[\] = \['all', 'duplicates'\]/);
  assert.match(scene, /SaveSystem\.equipMod/);
  assert.match(scene, /SaveSystem\.rankUpMod/);
  assert.match(scene, /SaveSystem\.sellDuplicateMod/);
  assert.match(scene, /SaveSystem\.recycleDuplicateMod/);
  assert.match(scene, /SaveSystem\.deleteModCard/);
  assert.match(scene, /SaveSystem\.infuseModCard/);
  assert.match(scene, /resolveModCollectionReturnRoute/);
  assert.match(scene, /return-from-mod-collection/);
});

test('infusion overlay remains input-blocking and uses the same framed command treatment', () => {
  assert.match(scene, /const blocker = .*\.setInteractive\(\)/);
  assert.match(scene, /INFUSION TERMINAL \/\/ COSMETIC CHANNEL/);
  assert.match(scene, /panelChassis/);
  assert.match(scene, /panelGlass/);
  assert.match(scene, /createModCollectionButton\(this, installX/);
});
