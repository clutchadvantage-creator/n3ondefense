import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculateDebriefLayout, splitDebriefPrimary } from '../src/game/ui/DebriefLayout.ts';

test('debrief layout keeps its console, content columns, and sections inside supported desktop viewports', () => {
  for (const [width, height] of [[1920, 1080], [1366, 768], [1024, 720], [800, 600]]) {
    const layout = calculateDebriefLayout(width, height);
    const sections = splitDebriefPrimary(layout.primary, layout.compact);
    assert.ok(layout.panel.x >= 0 && layout.panel.y >= 0);
    assert.ok(layout.panel.x + layout.panel.width <= width);
    assert.ok(layout.panel.y + layout.panel.height <= height);
    assert.ok(layout.primary.width > 0 && layout.actions.width >= 180);
    assert.ok(layout.primary.x + layout.primary.width < layout.actions.x);
    assert.equal(sections.rewards.x, layout.primary.x);
    assert.equal(sections.highlight.y + sections.highlight.height, layout.primary.y + layout.primary.height);
    assert.ok(sections.operation.height >= 170);
  }
});

test('finished and failed screens share the debrief modules instead of rebuilding raw text walls', () => {
  const finished = readFileSync(new URL('../src/game/scenes/RoundFinishedScene.ts', import.meta.url), 'utf8');
  const failed = readFileSync(new URL('../src/game/scenes/ResultScene.ts', import.meta.url), 'utf8');
  for (const source of [finished, failed]) {
    assert.match(source, /createDebriefShell\(/);
    assert.match(source, /createRewardSummary\(/);
    assert.match(source, /createOperationReadout\(/);
    assert.match(source, /createDebriefHighlight\(/);
    assert.match(source, /createDebriefActions\(/);
    assert.doesNotMatch(source, /Credits Gained:|Core Tokens Gained:|Run Credits Earned:/);
    assert.match(source, /this\.scale\.on\('resize', this\.handleResize, this\)/);
    assert.match(source, /this\.scale\.off\('resize', this\.handleResize, this\)/);
  }
});

test('debrief resource glyphs cover every payout currency with the established pickup language', () => {
  const ui = readFileSync(new URL('../src/game/ui/DebriefUi.ts', import.meta.url), 'utf8');
  for (const kind of ['credits', 'coreTokens', 'plasmaChips', 'fluxCores']) assert.match(ui, new RegExp(`${kind}:`));
  assert.match(ui, /'\\u00a2'/);
  assert.match(ui, /kind === 'coreTokens'/);
  assert.match(ui, /kind === 'plasmaChips'/);
  assert.match(ui, /createResourceIcon/);
  assert.match(ui, /chamferedPoints\(outerWidth, outerHeight/);
});

test('debrief action routes preserve completion flow and expose safe post-failure collection access', () => {
  const finished = readFileSync(new URL('../src/game/scenes/RoundFinishedScene.ts', import.meta.url), 'utf8');
  const failed = readFileSync(new URL('../src/game/scenes/ResultScene.ts', import.meta.url), 'utf8');
  for (const label of ['CONTINUE TO NEXT ROUND', 'STORE', 'MOD COLLECTION', 'EXPORT GAMEPLAY METRICS', 'QUIT TO MAIN MENU']) {
    assert.match(finished, new RegExp(label));
  }
  for (const label of ['REPLAY LOCAL', 'STORE', 'MOD COLLECTION', 'EXPORT GAMEPLAY METRICS', 'MAIN MENU']) {
    assert.match(failed, new RegExp(label));
  }
  assert.match(finished, /returnScene: SceneKeys\.RoundFinished/);
  assert.match(failed, /SceneKeys\.Mods, \{ returnScene: SceneKeys\.MainMenu, resumePausedScene: false \}/);
  assert.match(failed, /buildRunEconomySnapshot\(\{ modFocus: null, contract: null \}, 0\)/);
});

test('round-finished readability tier increases only secondary typography', () => {
  const finished = readFileSync(new URL('../src/game/scenes/RoundFinishedScene.ts', import.meta.url), 'utf8');
  const failed = readFileSync(new URL('../src/game/scenes/ResultScene.ts', import.meta.url), 'utf8');
  const ui = readFileSync(new URL('../src/game/ui/DebriefUi.ts', import.meta.url), 'utf8');
  assert.match(finished, /createDebriefShell\([^;]*true\)/);
  assert.match(finished, /layout\.compact, false, true/);
  assert.match(finished, /createOperationReadout\([^;]*layout\.compact, true\)/);
  assert.match(finished, /ENDLESS FLOW \/\/ NEXT ARENA READY', true/);
  assert.doesNotMatch(failed, /enhanceSecondaryTypography|layout\.compact, true, true/);
  assert.doesNotMatch(failed, /createDebriefShell\([^;]*, true\)/);
  for (const pair of [
    '18 : 17', '24 : 22', '10 : 9', '13 : 11',
    '11 : 10', '14 : 12', '12 : 11', '14 : 13',
    '17 : 16', '12 : 11', '16 : 14'
  ]) assert.match(ui, new RegExp(pair.replace(/ /g, '\\s*')));
});
