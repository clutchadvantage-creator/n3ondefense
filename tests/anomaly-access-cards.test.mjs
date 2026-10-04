import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAccessCards, accessCardUseError, ACCESS_CARD_PRICE, ACCESS_CARD_DAILY_LIMIT } from '../src/game/anomalies/AnomalyAccessCards.ts';
import { createDefaultLocalSave, normalizeLocalSave } from '../src/game/save/SaveValidator.ts';
import { WorldEventRotation } from '../src/game/arcade/WorldEventRotation.ts';
import { skyForwardAim } from '../src/game/anomalies/skybreach/SkyBreachMotion.ts';

const now = Date.parse('2026-10-04T23:59:59Z');
test('card ownership survives UTC daily rollover while both combined counters reset', () => {
  assert.equal(ACCESS_CARD_PRICE, 50000);assert.equal(ACCESS_CARD_DAILY_LIMIT, 3);
  const state={owned:{heist:4,skybreach:2},day:'2026-10-04',purchases:3,uses:3};
  assert.deepEqual(normalizeAccessCards(state,now),state);
  assert.deepEqual(normalizeAccessCards(state,now+1000),{...state,day:'2026-10-05',purchases:0,uses:0});
  assert.deepEqual(normalizeAccessCards(state,now-86400000),state,'clock rollback never grants another quota');
});
test('malformed card state normalizes safely without inventing ownership', () => {
  assert.deepEqual(normalizeAccessCards(null,now),{owned:{heist:0,skybreach:0},day:'2026-10-04',purchases:0,uses:0});
  const state=normalizeAccessCards({owned:{heist:-3,skybreach:2.9},day:'9999-99-99',purchases:Infinity,uses:100},now);
  assert.deepEqual(state,{owned:{heist:0,skybreach:2},day:'2026-10-04',purchases:0,uses:3});
});
test('version 19 migration preserves progression and gives empty cards; version 20 retains inventory', () => {
  const original=createDefaultLocalSave('cards-test','Cards Test');original.version=19;delete original.accessCards;
  original.wallet.credits=123456;original.wallet.fluxCores=93;
  const migrated=normalizeLocalSave(original);
  assert.equal(migrated.version,20);assert.deepEqual(migrated.wallet,original.wallet);
  assert.deepEqual(migrated.progress.campaign,original.progress.campaign);
  assert.deepEqual(migrated.accessCards.owned,{heist:0,skybreach:0});
  migrated.accessCards.owned={heist:2,skybreach:5};migrated.accessCards.purchases=2;migrated.accessCards.uses=1;
  assert.deepEqual(normalizeLocalSave(JSON.parse(JSON.stringify(migrated))).accessCards,migrated.accessCards);
});
test('card options reject the last played anomaly, absent ownership and combined daily cap', () => {
  const state=normalizeAccessCards({owned:{heist:2,skybreach:1}},now);
  assert.equal(accessCardUseError(state,'heist'),null);
  assert.ok(accessCardUseError(state,'heist','anomaly:heist'));
  assert.equal(accessCardUseError(state,'skybreach','anomaly:heist'),null);
  state.owned.skybreach=0;assert.ok(accessCardUseError(state,'skybreach'));
  state.uses=3;assert.ok(accessCardUseError(state,'heist'));
});
test('portal offer and cancellation do not rewrite history; redirected entry becomes the excluded event', () => {
  const pool=[{kind:'anomaly',id:'heist'},{kind:'anomaly',id:'skybreach'},{kind:'arcade',id:'redline'}];
  const rotation=new WorldEventRotation(1,pool,{remainingMs:0,drawIndex:1,pending:'anomaly:heist',lastStarted:'arcade:redline'});
  rotation.update(1,true,false,choice=>{assert.equal(choice.id,'heist');return true;});
  assert.equal(rotation.snapshot.lastStarted,'arcade:redline');
  rotation.recordAnomalyEntry('skybreach');
  const next=new WorldEventRotation(1,pool,{...rotation.snapshot,remainingMs:0});
  next.update(1,true,false,choice=>{assert.notEqual(choice.id,'skybreach');return true;});
});
test('Sky forward fire banks only with bounded lateral movement', () => {
  assert.deepEqual(skyForwardAim(100,500,0),{x:100,y:320});
  assert.deepEqual(skyForwardAim(100,500,10),{x:145,y:320});
  assert.deepEqual(skyForwardAim(100,500,-10),{x:55,y:320});
});
