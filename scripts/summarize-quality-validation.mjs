import { readFile, writeFile } from 'node:fs/promises';
const read = async path => JSON.parse(await readFile(path, 'utf8'));
const round = v => Math.round(v * 1000) / 1000;
const report = {};
for (const name of ['normal', 'late']) {
  const raw = await read(`artifacts/quality-mixed-${name}.json`);
  const summary = await read(`artifacts/quality-mixed-${name}.summary.json`);
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
for (const [key, file] of Object.entries({ navigation: 'quality-menu-flows', screens: 'quality-screen-details', resize: 'quality-options-resize', behavior: 'quality-behavior', movementBefore: 'quality-movement-before', movement: 'quality-movement-after', setupBaseline: 'quality-setup-baseline', setup: 'quality-setup-detail', cpu4: 'quality-setup-cpu4' })) {
  const value = await read(`artifacts/${file}.json`);
  if (value.running || value.errors.length) throw new Error(`${key} validation incomplete`);
  report[key] = { ...value, promise: undefined, cases: value.cases.map(({png,...c})=>key === 'movementBefore'
    ? { ...c, blockedCorners: c.blockedCorners.length, blockedCorridors: c.blockedCorridors.length, examples: c.blockedCorners.slice(0,3) }
    : c) };
}
report.reload = await read('artifacts/quality-save-reload.json');
if (!report.reload.reloaded || !report.reload.completed || report.reload.highest !== 148 || report.reload.screenShake !== false)
  throw new Error('Completion/settings reload failed');
report.geometry = await read('artifacts/quality-heist-geometry.json');
if (!report.geometry.passed || report.movement.cases.some(c=>c.blockedCorners.length || c.blockedCorridors.length)) throw new Error('HEIST geometry/movement failed');
const trace = await read('artifacts/quality-debrief-trace.summary.json');
report.debriefTrace = { ...trace, gcSlices: undefined, gcSliceCount: trace.gcSlices.length, maxGcSliceMs: Math.max(0,...trace.gcSlices.map(c=>c.durationMs)), raw: 'artifacts/quality-debrief-trace.json' };
const readLog = async path => { const bytes = await readFile(path); return bytes.toString(bytes[0]===255 && bytes[1]===254 ? 'utf16le' : 'utf8'); };
const tests = await readLog('artifacts/quality-tests.txt'), build = await readLog('artifacts/quality-build.txt');
if (!/fail 0/.test(tests) || !/built in/.test(build) || /error TS\d+/.test(build)) throw new Error('Build/tests did not pass');
report.testCount = Number(tests.match(/tests (\d+)/)?.[1]);
report.art = { captures: ['artifacts/quality-art-before.json','artifacts/quality-art-after.json','artifacts/quality-behavior.json'], review: 'Manual WebGL screenshot review; intentional art changes, no pixel-parity claim.' };
await writeFile('docs/quality-validation-measurements.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ normal: report.normal.gameplayChecks, late: report.late.gameplayChecks,
  finale: report.late.finale.checks.length, navigation: report.navigation.cases.length,
  screens: report.screens.cases.length, behavior: report.behavior.cases.filter(c=>c.ok!==undefined).length, resize: report.resize.cases.filter(c=>c.ok!==undefined).length, reload: report.reload }, null, 2));
