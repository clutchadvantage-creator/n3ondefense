import test from 'node:test';
import assert from 'node:assert/strict';
import { HudNotificationQueue } from '../src/game/ui/HudNotificationQueue.ts';
import { WeeklyCompletionTracker } from '../src/game/progression/WeeklyCompletionTracker.ts';
import { normalizeHudSettings } from '../src/game/config/interfaceSettings.ts';
import { createDefaultLocalSave, normalizeLocalSave } from '../src/game/save/SaveValidator.ts';
import { resolveWeeklyOperationDecks } from '../src/game/progression/WeeklyOperations.ts';

const notice = (heading, priority = 0) => ({ category: 'system', heading, priority });
const finish = q => { q.update(320); q.update(6000); q.update(300); };
test('notifications keep equal-priority order and promote critical queued notices', () => {
  const q = new HudNotificationQueue();
  q.submit(notice('first')); q.update(0);
  q.submit(notice('second')); q.submit(notice('third')); q.submit(notice('critical', 4));
  assert.equal(q.active.heading, 'first');
  finish(q); assert.equal(q.active.heading, 'critical');
  finish(q); assert.equal(q.active.heading, 'second');
  finish(q); assert.equal(q.active.heading, 'third');
  finish(q); assert.equal(q.active, null); assert.equal(q.phase, 'HIDDEN');
});
test('repeated bursts coalesce while distinct outcomes are retained and prioritized', () => {
  const q = new HudNotificationQueue();
  for (let i = 0; i < 100; i++) q.submit(notice('repeat'));
  assert.equal(q.pending.length, 1);
  q.update(0); assert.equal(q.submit(notice('repeat')), false);
  finish(q); assert.equal(q.submit(notice('repeat')), false);
  q.update(5001); assert.equal(q.submit(notice('repeat')), true);
  q.clear();
  for (let i = 0; i < 12; i++) q.submit(notice('weekly'+i, 2));
  assert.equal(q.submit(notice('noise')), true);
  assert.equal(q.submit(notice('urgent', 4)), true);
  assert.equal(q.pending.length, 14); assert.equal(q.pending[0].heading, 'urgent');
});
test('invalid durations expire, encounter clear and event cancellation remove stale work', () => {
  const q = new HudNotificationQueue();
  q.submit({ ...notice('bad'), durationMs: NaN }); q.update(0); finish(q);
  assert.equal(q.active, null);
  q.submit({ ...notice('stage'), key: 'redline:stage' }); q.update(0);
  q.submit({ ...notice('target'), key: 'redline:target' }); q.submit(notice('weekly'));
  q.cancelPrefix('redline:'); assert.equal(q.phase, 'RETRACTING'); assert.equal(q.pending.length, 1);
  q.clear(); q.update(5000); assert.equal(q.active, null); assert.equal(q.pending.length, 0);
});
test('mechanical deployment and retraction do not consume readable active time', () => {
  const q = new HudNotificationQueue(); q.submit(notice('read me')); q.update(0);
  assert.equal(q.phase, 'DEPLOYING'); assert.equal(q.deployment, 0);
  q.update(160); assert.equal(q.deployment, .5); assert.equal(q.elapsedMs, 0);
  q.update(160); assert.equal(q.phase, 'ACTIVE');
  q.update(3499); assert.equal(q.phase, 'ACTIVE');
  q.update(1); assert.equal(q.phase, 'RETRACTING');
  q.update(150); assert.equal(q.deployment, .5);
  q.update(150); assert.equal(q.phase, 'HIDDEN');
});
test('real warnings preempt, update in place, retire, and resume interrupted outcomes', () => {
  const q = new HudNotificationQueue(); q.submit(notice('weekly')); q.update(0); q.update(320); q.update(1000);
  q.setLive('disarm', { ...notice('disarming', 100), progress: .2 }); q.update(0);
  assert.equal(q.phase, 'RETRACTING'); assert.equal(q.pending.length, 1);
  q.update(300); q.update(320); assert.equal(q.active.heading, 'disarming');
  const active = q.active; q.setLive('disarm', { ...notice('disarming', 100), progress: .8 });
  assert.equal(q.active, active); assert.equal(q.active.progress, .8);
  q.update(100000); assert.equal(q.phase, 'ACTIVE');
  q.removeLive('disarm'); q.update(0); q.update(300); q.update(320);
  assert.equal(q.active.heading, 'weekly'); q.update(2499); assert.equal(q.phase, 'ACTIVE');
  q.update(1); assert.equal(q.phase, 'RETRACTING'); q.update(300); assert.equal(q.phase, 'HIDDEN');
  q.setLive('disarm', notice('again', 100)); q.update(0); assert.equal(q.active.heading, 'again');
  q.clear(); assert.equal(q.live.size, 0); assert.equal(q.phase, 'HIDDEN');
});
test('live status rotates, gives queued outcomes a turn, and never duplicates panels', () => {
  const q = new HudNotificationQueue();
  q.setLive('arcade', notice('arcade', 10)); q.setLive('anomaly', notice('anomaly', 10));
  q.update(0); q.update(320); q.update(5000); q.update(300);
  assert.equal(q.active.heading, 'anomaly');
  q.submit(notice('reward')); q.update(320); q.update(1); q.update(300);
  assert.equal(q.active.heading, 'reward');
  finish(q); assert.equal(q.active.heading, 'arcade');
});
test('tactical settings migrate safely and survive normalized save reload', () => {
  assert.equal(normalizeHudSettings({}).tacticalInformation, true);
  assert.equal(normalizeHudSettings({ tacticalTextSize: 'giant', tacticalInformation: 'off' }).tacticalTextSize, 'medium');
  for (const size of ['small', 'medium', 'large']) {
    const save = createDefaultLocalSave('hud', 'HUD');
    save.settings.hud = normalizeHudSettings({ tacticalInformation: false, tacticalTextSize: size });
    const loaded = normalizeLocalSave(JSON.parse(JSON.stringify(save)));
    assert.equal(loaded.settings.hud.tacticalInformation, false);
    assert.equal(loaded.settings.hud.tacticalTextSize, size);
  }
});
test('weekly completion observes each objective once and never invents per-objective or Mod rewards', () => {
  const save = createDefaultLocalSave('weekly', 'Weekly');
  const at = Date.UTC(2026, 8, 14);
  const baseline = resolveWeeklyOperationDecks(save.progress, save.progress.overdriveWeeklyProgress, save.progress.weeklyOperations, at);
  const tracker = new WeeklyCompletionTracker(baseline.snapshot), notices = [];
  const before = JSON.stringify(save);
  const progress = { ...save.progress };
  for (const objective of baseline.snapshot.regular.objectives) progress[objective.statKey] += objective.target;
  const completed = resolveWeeklyOperationDecks(progress, save.progress.overdriveWeeklyProgress, baseline.state, at);
  tracker.update(completed.snapshot, n => notices.push(n));
  tracker.update(completed.snapshot, n => notices.push(n));
  assert.equal(notices.length, 4);
  assert.equal(notices.filter(n => n.heading === 'WEEKLY CHALLENGE COMPLETE').length, 3);
  assert.ok(notices.every(n => n.category === 'weekly' && !/mod|\+\d/i.test(n.secondary)));
  assert.equal(JSON.stringify(save), before);
  const restart = new WeeklyCompletionTracker(completed.snapshot);
  restart.update(completed.snapshot, () => assert.fail('must not replay completed objectives'));
});
