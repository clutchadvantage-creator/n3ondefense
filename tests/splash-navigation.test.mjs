import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const splash = readFileSync(new URL('../src/game/scenes/SplashScene.ts', import.meta.url), 'utf8');
const options = readFileSync(new URL('../src/game/scenes/OptionsScene.ts', import.meta.url), 'utf8');
const mainMenu = readFileSync(new URL('../src/game/scenes/MainMenuScene.ts', import.meta.url), 'utf8');

test('replaying the splash resets its reused input gate and bypasses the session skip', () => {
  assert.match(splash, /create\(data\?: SplashSceneData\)/);
  assert.match(splash, /this\.skipped = false/);
  assert.match(splash, /this\.cameras\.main\.resetFX\(\)/);
  assert.match(splash, /const replay = data\?\.replay === true/);
  assert.match(splash, /if \(!replay && sessionStorage\.getItem\(SPLASH_SESSION_KEY\) === '1'\)/);
  assert.match(splash, /this\.input\.keyboard\?\.once\('keydown', skip\)/);
});

test('Options supplies an explicit splash replay return route without mutating first-run state', () => {
  assert.match(options, /this\.scene\.launch\(SceneKeys\.Splash, \{[\s\S]*?replay: true,[\s\S]*?returnScene: this\.returnScene,[\s\S]*?resumeGameplay: this\.resumeGameplayOnEsc,[\s\S]*?returnToOptions: this\.returnScene !== SceneKeys\.Arena/);
  assert.match(options, /this\.scene\.bringToTop\(SceneKeys\.Splash\)/);
  assert.match(options, /this\.scene\.stop\(\)/);
  assert.doesNotMatch(options, /sessionStorage\.removeItem\(SPLASH_SESSION_KEY\)/);
});

test('a replayed splash is topmost, resumes a paused Arena, or reopens Options for menu routes', () => {
  assert.match(splash, /if \(replay\) this\.scene\.bringToTop\(\)/);
  assert.match(splash, /if \(!replay\) \{[\s\S]*?this\.scene\.start\(SceneKeys\.LocalProfiles\)/);
  assert.match(splash, /returnScene === SceneKeys\.Arena && this\.scene\.isPaused\(SceneKeys\.Arena\)/);
  assert.match(splash, /this\.scene\.resume\(SceneKeys\.Arena\)/);
  assert.match(splash, /events\.emit\('resume-from-options'\)/);
  assert.match(splash, /if \(data\?\.returnToOptions === true\) \{[\s\S]*?this\.scene\.start\(SceneKeys\.Options/);
  assert.match(splash, /this\.scene\.start\(returnScene\)/);
});

test('Main Menu always opens Options with a fresh non-gameplay return route', () => {
  assert.match(mainMenu, /'OPTIONS', \(\) => this\.scene\.start\(SceneKeys\.Options, \{[\s\S]*?returnScene: SceneKeys\.MainMenu,[\s\S]*?resumeGameplay: false/);
});
