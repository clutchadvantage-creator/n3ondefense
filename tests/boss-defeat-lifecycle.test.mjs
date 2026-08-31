import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const arenaSource = readFileSync(new URL('../src/game/scenes/ArenaScene.ts', import.meta.url), 'utf8');
const bossSource = readFileSync(new URL('../src/game/bosses/Boss.ts', import.meta.url), 'utf8');
const encounterSource = readFileSync(new URL('../src/game/bosses/BossEncounter.ts', import.meta.url), 'utf8');

const methodBody = (source, start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `Expected ${start} before ${end}`);
  return source.slice(from, to);
};

test('boss defeat claims one authoritative combat-to-destruction transition before rewards', () => {
  const complete = methodBody(arenaSource, 'private completeBossFight()', 'private handleSupremeBossDefeated');
  assert.match(complete, /transitionBossFlow\('combat', 'destruction'\)/);
  assert.match(complete, /this\.bossVictoryHandled = true/);
  assert.match(bossSource, /this\.defeated = true;[\s\S]*?this\.onDefeated\(\)/);
  assert.match(arenaSource, /transitionBossFlow\('destruction', 'loot-collection'\)/);
  assert.match(arenaSource, /transitionBossFlow\('loot-collection', 'transitioning'\)/);
});

test('fatal-hit callbacks defer destructive cleanup until active combat iterators unwind', () => {
  const complete = methodBody(arenaSource, 'private completeBossFight()', 'private handleSupremeBossDefeated');
  const destruction = methodBody(arenaSource, 'private beginBossDestruction', 'private retireActiveBossProjectiles');
  assert.match(complete, /this\.scheduleRoundDelayedCall\(0, \(\) => this\.beginBossDestruction\(snapshot\)\)/);
  assert.doesNotMatch(complete, /laserSecurity\?\.destroy|bombletHazard\?\.destroy|retireActiveBossProjectiles/);
  assert.match(destruction, /this\.bossEncounter !== snapshot\.encounter/);
  assert.match(destruction, /retireActiveBossProjectiles\(\)/);
  assert.match(arenaSource, /Preserve all unprocessed pooled projectiles for the deferred boss/);
});

test('all boss attack families become inert and release delayed effects on defeat', () => {
  for (const activeAttack of ['pendingStrikes', 'mageChargeEndsAt', 'mageSuperVolleyAt', 'pounceStartsAt', 'pounceEndsAt']) {
    assert.match(encounterSource, new RegExp(`this\\.${activeAttack}`));
  }
  assert.match(encounterSource, /private combatActive = true/);
  assert.match(encounterSource, /if \(!this\.combatActive\) return;[\s\S]*?this\.combatActive = false/);
  assert.match(encounterSource, /for \(const effect of this\.effects\)[\s\S]*?killTweensOf\(effect\)[\s\S]*?effect\.destroy\(\)/);
  assert.match(encounterSource, /private fire[\s\S]*?if \(!this\.combatActive \|\| this\.boss\.isDefeated\) return/);
  assert.match(encounterSource, /private scheduleStrike[\s\S]*?if \(!this\.combatActive \|\| this\.boss\.isDefeated\) return/);
});

test('repeated Mage, Brawler, and Sentry lifecycle claims cannot double-trigger', () => {
  for (const archetype of ['storm-mage', 'void-brawler', 'artillery']) {
    for (let repetition = 0; repetition < 100; repetition += 1) {
      let phase = 'combat';
      let rewardRolls = 0;
      const transition = (expected, next) => {
        if (phase !== expected) return false;
        phase = next;
        return true;
      };
      assert.equal(transition('combat', 'destruction'), true, archetype);
      for (let duplicate = 0; duplicate < 8; duplicate += 1) assert.equal(transition('combat', 'destruction'), false, archetype);
      assert.equal(transition('destruction', 'loot-collection'), true, archetype);
      rewardRolls += 1;
      assert.equal(transition('destruction', 'loot-collection'), false, archetype);
      assert.equal(transition('loot-collection', 'transitioning'), true, archetype);
      assert.equal(rewardRolls, 1, archetype);
    }
  }
});
