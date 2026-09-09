import { readFile, writeFile } from 'node:fs/promises';
const read = async path => JSON.parse(await readFile(path, 'utf8'));
const round = v => Math.round(v * 1000) / 1000;
const report = {};
for (const name of ['normal', 'late']) {
  const raw = await read(`artifacts/polish-mixed-${name}.json`);
  const summary = await read(`artifacts/polish-mixed-${name}.summary.json`);
  if (!summary.passed || raw.running || raw.errors.length) throw new Error(`${name} gameplay validation failed`);
  const costs = {};
  for (const phase of Object.values(summary.phaseCosts)) for (const [key, value] of Object.entries(phase)) {
    if (!key.startsWith('setup.') && !['profile.save', 'storage.write', 'JSON.stringify'].includes(key)) continue;
    const total = costs[key] ??= { calls: 0, totalMs: 0, maxMs: 0 };
    total.calls += value.calls; total.totalMs += value.totalMs; total.maxMs = Math.max(total.maxMs, value.maxMs);
  }
  for (const c of Object.values(costs)) { c.meanMs = round(c.totalMs / c.calls); c.totalMs = round(c.totalMs); }
  report[name] = { options: raw.options, passed: summary.passed, failures: summary.failures, durationSeconds: summary.durationSeconds,
    startedAt: raw.startedAt, finishedAt: raw.finishedAt, gameplayChecks: summary.gameplayChecks,
    coverage: summary.coverage, boundaries: summary.boundaries, quiescent: summary.quiescent,
    earlyPerformance: summary.earlyPerformance, latePerformance: summary.latePerformance, rounds: summary.rounds,
    sustained: summary.sustained, continuousFrames: summary.continuousFrames, inclusiveSetupCosts: costs,
    finale: raw.finale ? { checks: raw.finale.checks, samples: raw.finale.samples.map(({ diagnostic, ...sample }) => sample),
      highestRound: raw.finale.afterProgress.supremeHighestRound, completed: raw.finale.afterProgress.supremeOverdriveCompleted } : undefined };
}
for (const [key, file] of Object.entries({ navigation: 'polish-menu-flows', screens: 'polish-screen-details', lifetime: 'polish-lifetime', debriefSetup: 'polish-debrief-setup' })) {
  const value = await read(`artifacts/${file}.json`);
  if (value.running || value.errors.length) throw new Error(`${key} validation incomplete`);
  report[key] = { ...value, promise: undefined };
}
report.reload = await read('artifacts/polish-save-reload.json');
if (!report.reload.reloaded || !report.reload.completed || report.reload.highest !== 148 || report.reload.screenShake !== false)
  throw new Error('Completion/settings reload failed');
await writeFile('docs/polish-validation-measurements.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ normal: report.normal.gameplayChecks, late: report.late.gameplayChecks,
  finale: report.late.finale.checks.length, navigation: report.navigation.cases.length,
  screens: report.screens.cases.length, lifetime: report.lifetime.cases.length, reload: report.reload }, null, 2));
