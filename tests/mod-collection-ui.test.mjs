import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  calculateModArchiveTerminalLayout,
  getModArchivePageCount
} from '../src/game/ui/ModArchiveTerminalLayout.ts';

const scene = readFileSync(new URL('../src/game/scenes/ModCollectionScene.ts', import.meta.url), 'utf8');
const presentation = readFileSync(new URL('../src/game/ui/ModCollectionUi.ts', import.meta.url), 'utf8');
const terminalLayout = readFileSync(new URL('../src/game/ui/ModArchiveTerminalLayout.ts', import.meta.url), 'utf8');

test('Mod Collection uses the shared cyber-console visual language without replacing its card renderer', () => {
  assert.match(scene, /createModCollectionShell\(this, width, height/);
  assert.match(scene, /createModCollectionFrame\(this/);
  assert.match(scene, /createModCollectionButton\(this/);
  assert.match(scene, /getModCollectionChromeLayout\(width, height\)/);
  assert.match(scene, /createModCardView\(this/);
  assert.match(presentation, /chamferedPoints/);
  assert.match(presentation, /MOD CARD COLLECTION/);
  assert.match(presentation, /OPERATIVE ARCHIVE \/\/ MODULAR INVENTORY CONTROL/);
  assert.match(presentation, /leftRail/);
  assert.match(presentation, /rightRail/);
  assert.match(presentation, /COLLECTION LINK \/\/ SYNCED/);
  assert.match(presentation, /MOD_COLLECTION_SPACING/);
  assert.match(presentation, /statusSideInset/);
  assert.match(presentation, /headerDivider/);
});

test('Mod Archive Terminal fills the archive workstation while preserving exactly two readable card rows', () => {
  for (const [width, height, contentTop, detailWidth] of [
    [1920, 1080, 218, 390],
    [1600, 900, 212, 390],
    [1366, 768, 208, 390],
    [1024, 768, 228, 307]
  ]) {
    const layout = calculateModArchiveTerminalLayout(width, height, contentTop, detailWidth);
    assert.equal(layout.rows, 2);
    assert.equal(layout.perPage, layout.columns * 2);
    assert.ok(layout.cardWidth >= 112 && layout.cardWidth <= 148);
    if (width >= 1366) assert.equal(layout.cardWidth, 148, `${width}x${height} keeps the current full card size`);
    assert.equal(layout.frame.y + layout.frame.height, height - 16, `${width}x${height} terminal reaches the lower workspace boundary`);
    assert.ok(layout.pagination.y > layout.cardGridTop + layout.cardHeight * 2);
    assert.equal(layout.frame.width, width - detailWidth - 70, 'terminal spans all available space beside the selected-module panel');
    assert.equal(layout.pagination.y, layout.bay.y + layout.bay.height + 5, 'pagination stays directly below the two card rows');
    assert.ok(layout.pageButtonWidth >= 92 && layout.pageButtonHeight >= 38, 'pagination controls remain physical and comfortably sized');
  }
  const fullHd = calculateModArchiveTerminalLayout(1920, 1080, 218, 390);
  assert.ok(fullHd.diagnostics?.width >= 100, 'unused horizontal room becomes a diagnostic hardware bay');
  assert.ok(fullHd.lowerConsole.height >= 200, 'large desktop space becomes a substantial lower console assembly');
  const laptop = calculateModArchiveTerminalLayout(1366, 768, 208, 390);
  assert.equal(laptop.cardWidth, 148, 'short viewports collapse decoration before shrinking cards');
  assert.equal(getModArchivePageCount(63, 16), 4);
  assert.equal(getModArchivePageCount(0, 16), 1);
  assert.match(terminalLayout, /rows: 2/);
});

test('archive pagination is an in-terminal controller-aware physical console', () => {
  assert.match(scene, /createModArchiveTerminal\(this, archiveLayout, analytics\)/);
  assert.match(scene, /createModArchivePageButton/);
  assert.match(scene, /onPageLeft: \(\) => turnArchivePage\(-1\)/);
  assert.match(scene, /onPageRight: \(\) => turnArchivePage\(1\)/);
  assert.match(presentation, /focusShortcut: direction === 'previous' \? 'page-left' : 'page-right'/);
  assert.match(presentation, /MOD ARCHIVE/);
  assert.match(presentation, /ARCHIVE CORE/);
  assert.match(presentation, /INDEX BUFFER/);
  assert.match(presentation, /DATA BUS/);
  assert.match(presentation, /SYSTEM READY/);
  assert.match(presentation, /pageInner/);
  assert.match(presentation, /pageCount <= 10/);
  assert.match(presentation, /duration: 150/);
});

test('archive support panels use live analytics and selection-linked inspection data', () => {
  assert.match(scene, /buildModArchiveAnalytics\(/);
  assert.match(scene, /createModArchiveCommandTelemetry\(this, toolbarRect, analytics\)/);
  assert.match(scene, /createModSelectedInspector\(this, detailRect/);
  assert.match(scene, /createModSelectedTracePanel\(this/);
  assert.match(presentation, /DISCOVERED/);
  assert.match(presentation, /SALVAGE BUFFER/);
  assert.match(presentation, /ARCHIVE CORE/);
  assert.match(presentation, /INDEX BUFFER/);
  assert.match(presentation, /DATA BUS/);
  assert.match(presentation, /SIGNAL TRACE \/\/ MODULE INSPECTION/);
  assert.match(presentation, /analytics\.rarityCounts/);
  assert.match(presentation, /analytics\.categoryCounts/);
});

test('archive polish keeps telemetry bright, avoids microtext, and safely frames the selected card', () => {
  const cards = readFileSync(new URL('../src/game/mods/ModCardView.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(presentation, /fontSize: ['`]7px/);
  assert.doesNotMatch(presentation, /fontSize: ['`]8px/);
  assert.match(terminalLayout, />= 88 \? \{/);
  assert.match(presentation, /lowerPanel[\s\S]*?0x50c9d9, 0\.68/);
  assert.match(presentation, /lowerInner[\s\S]*?0x55eaff, 0\.3/);
  assert.match(presentation, /lowerTech\.lineStyle\(2, 0xff5bcf, 0\.95\)/);
  assert.match(scene, /const detailCardTop = y \+ \(compactDetails \? 52 : 58\)/);
  assert.match(scene, /detailCardTop \+ detailCardHeight \+ 18/);
  assert.match(presentation, /localCard\.x - 14/);
  assert.match(presentation, /localCard\.height \+ 28/);
  assert.match(cards, /Phaser\.Math\.Clamp\(width \* 0\.076, 10, 14\)/);
});

test('collection presentation delegates to existing buttons and preserves disabled and locked feedback', () => {
  assert.match(presentation, /const button = createButton\(/);
  assert.match(scene, /disableButton\(recycleAll\)/);
  assert.match(scene, /disableButton\(install\)/);
  assert.match(scene, /already at maximum level/);
  assert.match(scene, /private apply\([\s\S]*?return result\.ok/);
});

test('selected-module operations use one readable toolbar status console instead of footer microtext', () => {
  assert.match(scene, /createModOperationStatusConsole\(\s*this/);
  assert.match(scene, /calculateModOperationStatusRect\(statusLeft, statusRight, toolbarTop, toolbarHeight, compact\)/);
  assert.match(scene, /MOD_OPERATION_STATUS_DURATION_MS/);
  assert.match(scene, /AWAITING MODULE COMMAND/);
  assert.match(scene, /const buttonStackBottomInset = compactDetails \? 28 : 34/);
  assert.doesNotMatch(scene, /const statusText = this\.add\.text\(x, y \+ height - 4/);
  assert.match(presentation, /MODULE STATUS/);
  assert.match(presentation, /setMaxLines\(2\)/);
  assert.match(presentation, /fontSize: `\$\{compact \? 15/);
  assert.doesNotMatch(presentation, /registerUiFocusable[\s\S]*createModOperationStatusConsole/);
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

test('duplicate filtering exposes only rank-zero excess copies and Garage category routing can initialize the group', () => {
  assert.match(scene, /const recyclableDuplicates = getRecyclableUnupgradedDuplicates\(mods\)/);
  assert.match(scene, /const recyclableDuplicateIds = new Set\(recyclableDuplicates\.map\(\(card\) => card\.instanceId\)\)/);
  assert.match(scene, /filter === 'all' \|\| recyclableDuplicateIds\.has\(card\.instanceId\)/);
  assert.doesNotMatch(scene, /filter === 'all' \|\| \(copyCounts\.get\(card\.modId\) \?\? 0\) > 1/);
  assert.match(scene, /initialCategory\?: CollectionCategory/);
  assert.match(scene, /const CATEGORIES: CollectionCategory\[\] = \['all', 'supreme'/);
  assert.match(scene, /this\.categoryIndex = CATEGORIES\.indexOf\(data\.initialCategory\)/);
  assert.match(scene, /this\.filterIndex = 0/);
});

test('infusion overlay remains input-blocking and uses the same framed command treatment', () => {
  assert.match(scene, /const blocker = .*\.setInteractive\(\)/);
  assert.match(scene, /INFUSION TERMINAL \/\/ COSMETIC CHANNEL/);
  assert.match(scene, /panelChassis/);
  assert.match(scene, /panelGlass/);
  assert.match(scene, /createModCollectionButton\(this, installX/);
});
