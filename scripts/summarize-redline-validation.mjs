import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const read = async path => JSON.parse(await readFile(path, 'utf8'));
const readLog = async path => {
  const bytes = await readFile(path);
  return bytes.toString(bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf16le' : 'utf8');
};
const evidence = async path => ({ path, sha256: createHash('sha256').update(await readFile(path)).digest('hex') });
const report = { generatedAt: new Date().toISOString(), environment: await read('artifacts/redline-browser-environment.json') };

for (const name of ['normal', 'late']) {
  const path = `artifacts/redline-mixed-${name}.json`;
  const raw = await read(path), summary = await read(path.replace('.json', '.summary.json'));
  if (!summary.passed || raw.running || raw.errors.length) throw new Error(`${name} gameplay validation failed`);
  report[name] = {
    evidence: await evidence(path), options: raw.options, passed: summary.passed, failures: summary.failures,
    startedAt: raw.startedAt, finishedAt: raw.finishedAt, durationSeconds: summary.durationSeconds,
    gameplayChecks: summary.gameplayChecks, coverage: summary.coverage, boundaries: summary.boundaries,
    quiescent: summary.quiescent, earlyPerformance: summary.earlyPerformance, latePerformance: summary.latePerformance,
    rounds: summary.rounds, sustained: summary.sustained, continuousFrames: summary.continuousFrames,
    finale: raw.finale ? {
      checks: raw.finale.checks, samples: raw.finale.samples.map(({ diagnostic, ...sample }) => sample),
      highestRound: raw.finale.afterProgress.supremeHighestRound,
      completed: raw.finale.afterProgress.supremeOverdriveCompleted
    } : undefined
  };
}

for (const [key, file] of Object.entries({
  pricing: 'anomaly-pricing-browser', exchange: 'redline-exchange-input',
  gameplay: 'redline-drone-final', artAndLifetime: 'drone-art-lifetime-final', checkpoints: 'drone-real-checkpoints'
})) {
  const path = `artifacts/${file}.json`, raw = await read(path);
  const checks = raw.cases.filter(c => typeof c.ok === 'boolean');
  if (raw.running || raw.errors.length || !checks.length || checks.some(c => !c.ok)) throw new Error(`${key} validation failed`);
  report[key] = {
    evidence: await evidence(path), passed: true, checkCount: checks.length, checks,
    options: raw.options, frames: raw.frames, result: raw.result, cpuThrottleRate: raw.cpuThrottleRate,
    screenshots: [...(raw.screenshots ?? []), ...raw.cases.filter(c => c.png)].map(c => c.label)
  };
}
const legacyGameplaySampler = !report.gameplay.options;
report.gameplay.options ??= {
  seed: 550055,
  matrix: [['normal', 1], ['normal', 30], ['normal', 148], ['overdrive', 1], ['overdrive', 15], ['overdrive', 30], ['supreme-leo', 1], ['supreme-delphinus', 148]],
  note: 'Recorded full fixture includes synthetic low-round advanced cases. Real entry checkpoints are validated separately. Current default fixture uses the real checkpoint matrix.',
  sustained: { protocol: 'overdrive', round: 30, durationMs: 56000, invulnerable: true, assistedKillIntervalMs: 1400, gamepadCircularMovement: true }
};
report.gameplay.frameTimingNote = legacyGameplaySampler
  ? 'This recorded full fixture includes one partial initial interval in each focused frame sample. Means have a small downward bias. The real-checkpoint fixture skips the first STEP and records complete intervals. Neither is a before/after comparison.'
  : 'The sampler skips the first STEP and records complete intervals. This is not a before/after comparison.';
report.reload = await read('artifacts/redline-save-reload.json');
if (!report.reload.reloaded || !report.reload.completed || report.reload.highest !== 148) throw new Error('Ending reload verification failed');
const testLog = await readLog('artifacts/redline-tests-final.txt');
const testCount = Number(testLog.match(/^# tests (\d+)/m)?.[1]);
if (testCount !== 670 || !/^# pass 670$/m.test(testLog) || !/^# fail 0$/m.test(testLog)) throw new Error('Missing successful final test output');
const buildLog = await readLog('artifacts/redline-build.txt');
if (!buildLog.includes('built in')) throw new Error('Missing successful build output');
report.automated = { tests: testCount, passed: testCount, failed: 0, build: 'passed',
  testEvidence: await evidence('artifacts/redline-tests-final.txt'), buildEvidence: await evidence('artifacts/redline-build.txt') };
report.totals = {
  focusedBrowserChecks: ['pricing', 'exchange', 'gameplay', 'artAndLifetime', 'checkpoints'].reduce((n, key) => n + report[key].checkCount, 0),
  ordinaryRounds: report.normal.coverage.ordinaryRound + report.late.coverage.ordinaryRound,
  gameplayChecks: report.normal.gameplayChecks + report.late.gameplayChecks,
  finaleChecks: report.late.finale.checks.length,
  encounterRetirements: report.normal.boundaries + report.late.boundaries,
  diskSaveComparisons: report.normal.coverage.diskProgressionVerified + report.late.coverage.diskProgressionVerified
};
await writeFile('docs/redline-validation-measurements.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report.totals, null, 2));
