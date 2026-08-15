import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldShowInitialDeploymentBriefing } from '../src/game/progression/ProgressionMessaging.ts';
import { createDefaultLocalSave, normalizeLocalSave } from '../src/game/save/SaveValidator.ts';

const failedRun = (overrides = {}) => ({
  reason: 'playerDead',
  round: 4,
  highestRound: 4,
  runDurationMs: 120_000,
  runCreditsEarned: 900,
  ...overrides
});

test('the initial deployment briefing is limited to a meaningful early failed run', () => {
  assert.equal(shouldShowInitialDeploymentBriefing(failedRun(), { seen: false, highestRound: 3 }), true);
  assert.equal(shouldShowInitialDeploymentBriefing(failedRun({ reason: 'victory' }), { seen: false, highestRound: 3 }), false);
  assert.equal(shouldShowInitialDeploymentBriefing(failedRun({ round: 6, highestRound: 6 }), { seen: false, highestRound: 5 }), false);
  assert.equal(shouldShowInitialDeploymentBriefing(failedRun({ round: 1, highestRound: 1, runDurationMs: 5_000, runCreditsEarned: 0 }), { seen: false, highestRound: 0 }), false);
  assert.equal(shouldShowInitialDeploymentBriefing(failedRun(), { seen: true, highestRound: 3 }), false);
  assert.equal(shouldShowInitialDeploymentBriefing(failedRun(), { seen: false, highestRound: 20 }), false);
});

test('new and version-six saves safely default the one-time briefing flag', () => {
  assert.equal(createDefaultLocalSave('new-pilot', 'New Pilot').progress.initialDeploymentBriefingSeen, false);

  const current = createDefaultLocalSave('returning-pilot', 'Returning Pilot');
  const migrated = normalizeLocalSave({
    ...current,
    version: 6,
    progress: { ...current.progress, initialDeploymentBriefingSeen: undefined }
  });
  assert.ok(migrated);
  assert.equal(migrated.version, 11);
  assert.equal(migrated.progress.initialDeploymentBriefingSeen, false);

  const persisted = normalizeLocalSave({
    ...migrated,
    progress: { ...migrated.progress, initialDeploymentBriefingSeen: true }
  });
  assert.equal(persisted.progress.initialDeploymentBriefingSeen, true);
});
