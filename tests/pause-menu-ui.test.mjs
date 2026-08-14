import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PAUSE_MENU_BASE_HEIGHT,
  PAUSE_MENU_BASE_WIDTH,
  calculatePauseMenuLayout
} from '../src/game/ui/PauseMenuLayout.ts';

test('pause command console remains inside supported viewport safe areas', () => {
  for (const [width, height] of [[2560, 1440], [1920, 1080], [1366, 768], [1024, 720], [800, 600], [640, 480]]) {
    const layout = calculatePauseMenuLayout(width, height);
    assert.ok(layout.scale > 0);
    assert.ok(layout.renderedWidth <= width - 24 + 0.001);
    assert.ok(layout.renderedHeight <= height - 20 + 0.001);
    assert.equal(layout.renderedWidth, PAUSE_MENU_BASE_WIDTH * layout.scale);
    assert.equal(layout.renderedHeight, PAUSE_MENU_BASE_HEIGHT * layout.scale);
    assert.ok(layout.centerX - layout.renderedWidth * 0.5 >= 0);
    assert.ok(layout.centerY - layout.renderedHeight * 0.5 >= 0);
  }
});

test('pause menu uses the shared cyber-console presentation and keeps every existing action route', () => {
  const arena = readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');
  const ui = readFileSync(new URL('../src/game/ui/PauseMenuUi.ts', import.meta.url), 'utf8');

  assert.match(arena, /createPauseMenuView\(this/);
  for (const label of ['Resume', 'Equipped Mod Cards', 'Mod Collection (Next Run)', 'Restart From Round 1', 'Options', 'Store', 'Quit To Main Menu']) {
    assert.ok(arena.includes(`label: '${label}'`), `missing pause route: ${label}`);
  }
  assert.match(arena, /resumePausedScene: true/);
  assert.match(arena, /resumeGameplay: true/);
  assert.match(ui, /OPERATION PAUSED/);
  assert.match(ui, /COMMAND ROUTES/);
  assert.match(ui, /SESSION SAFEGUARDS/);
  assert.match(ui, /chamferedPoints/);
  assert.match(ui, /killTweensOf\(animatedTargets\)/);
});
