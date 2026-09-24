import { readFile, writeFile } from 'node:fs/promises';
const read = async path => {
  const bytes = await readFile(path);
  return JSON.parse(bytes.toString(bytes[0] === 255 && bytes[1] === 254 ? 'utf16le' : 'utf8').replace(/^\uFEFF/, ''));
};
const report = { recordedAt: new Date().toISOString(), tests: 736, builds: ['production', 'itch'] };
for (const name of ['normal', 'late']) {
  const raw = await read(`artifacts/echo-${name}.json`), summary = await read(`artifacts/echo-${name}.summary.json`);
  if (raw.running || raw.errors.length) throw Error(`${name} did not finish cleanly`);
  report[name] = { options: raw.options, passed: summary.passed, failures: summary.failures,
    startedAt: raw.startedAt, finishedAt: raw.finishedAt, durationSeconds: summary.durationSeconds,
    gameplayChecks: summary.gameplayChecks, coverage: summary.coverage, boundaries: summary.boundaries,
    quiescent: summary.quiescent, earlyPerformance: summary.earlyPerformance, latePerformance: summary.latePerformance,
    rounds: summary.rounds, sustained: summary.sustained, continuousFrames: summary.continuousFrames,
    echoActivations: raw.echoActivations,
    finale: raw.finale ? { checks: raw.finale.checks, samples: raw.finale.samples.map(({ diagnostic, ...sample }) => sample),
      highestRound: raw.finale.afterProgress.supremeHighestRound, completed: raw.finale.afterProgress.supremeOverdriveCompleted } : undefined };
}
for (const [key, file] of Object.entries({ ability: 'echo-browser', controls: 'echo-controls', compact: 'echo-compact',
  spawnSafety: 'enemy-spawn-browser', trainingAndSplash: 'training-graduation' })) {
  const value = await read(`artifacts/${file}.json`);
  if (value.running || value.errors.length || value.cases.some(c => !c.ok)) throw Error(`${key} failed`);
  report[key] = { cases: value.cases, errors: value.errors, screenshots: (value.screenshots ?? []).map(s => typeof s === 'string' ? s : s.label),
    layouts: value.layouts, spawns: value.spawns };
}
report.bindingReload = (await read('artifacts/echo-binding-reload.json')).result.result.value;
if (report.bindingReload.binding !== 'Keyboard:KeyZ' || report.bindingReload.diskBinding !== 'Keyboard:KeyZ') throw Error('Binding reload failed');
report.endingReload = await read('artifacts/echo-ending-reload.json');
if (!report.endingReload.completed || report.endingReload.highest !== 148) throw Error('Ending reload failed');
const earlier = await read('artifacts/echo-before-circle-late.summary.json');
report.priorPerformanceFailure = { file: 'artifacts/echo-before-circle-late.summary.json', passed: earlier.passed,
  failures: earlier.failures, earlyPerformance: earlier.earlyPerformance, latePerformance: earlier.latePerformance,
  continuousPhases: earlier.continuousFrames.phases,
  note: 'Retained earlier run after bombsite repair but before the measured explosion circle rendering correction. Defusing exceeded the sustained mean budget.' };
const off = await read('artifacts/echo-disabled-late.json');
report.echoDisabledDiagnostic = { options: off.options, rounds: off.encounters.map(e => ({ round: e.round, frameMs: e.frames.mean, updateMs: e.update.mean })),
  note: 'Three-round diagnostic prefix, not a complete campaign validation. Live combat randomness and separate runs prevent interpreting the difference as an exact isolated ability cost.' };
const circles = await read('artifacts/explosion-circle-final.json');
if (circles.errors.length || circles.running || circles.artStages.length !== 24) throw Error('Circle validation failed');
report.circleRendering = { cases: circles.cases, art: circles.art, artStages: circles.artStages, lifetime: circles.lifetime };
await writeFile('docs/echo-validation-measurements.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ normal: report.normal.passed, late: report.late.passed, replays: ['normal', 'late'].map(k => report[k].echoActivations.length),
  checks: Object.fromEntries(['ability', 'controls', 'compact', 'spawnSafety', 'trainingAndSplash'].map(k => [k, report[k].cases.length])) }));
if (!report.normal.passed || !report.late.passed) process.exitCode = 1;
