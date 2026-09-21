import { readFile, writeFile } from 'node:fs/promises';
const read = async path => JSON.parse(await readFile(path, 'utf8'));
const paths = {
  browser: 'artifacts/lyra-browser.json', recordings: 'artifacts/lyra-recordings.json', extras: 'artifacts/lyra-extras.json',
  retry: 'artifacts/lyra-retry.json', compact: 'artifacts/lyra-compact.json',
  settingsReload: 'artifacts/lyra-settings-reload.json', endingReload: 'artifacts/lyra-ending-reload.json',
  normal: 'artifacts/lyra-normal.json', normalAnalysis: 'artifacts/lyra-normal.summary.json',
  late: 'artifacts/lyra-late.json', lateAnalysis: 'artifacts/lyra-late.summary.json',
  build: 'artifacts/lyra-build.txt', itchBuild: 'artifacts/lyra-itch-build.txt', tests: 'artifacts/lyra-tests.txt'
};
const log = async path => { const b = await readFile(path); return b.toString(b[0] === 255 && b[1] === 254 ? 'utf16le' : 'utf8'); };
const testLog = await log(paths.tests), buildLog = await log(paths.build), itchLog = await log(paths.itchBuild);
const testCount = Number(testLog.match(/tests (\d+)/)?.[1]);
if (!testCount || !testLog.includes(`pass ${testCount}`) || !testLog.includes('fail 0')
  || !buildLog.includes('built in') || !itchLog.includes('built in') || /error TS\d+/.test(buildLog + itchLog)) throw Error('Passing builds and tests required');
const compactBrowser = async path => {
  const r = await read(path);
  if (r.running || r.errors.length || r.cases.some(c => !c.ok)) throw Error('Incomplete browser evidence: ' + path);
  const { screenshots, running, ...rest } = r;
  return { ...rest, screenshotLabels: screenshots.map(s => typeof s === 'string' ? s : s.label) };
};
const compactRun = async (path, analysisPath) => {
  const run = await read(path), analysis = await read(analysisPath);
  if (run.running || run.errors.length || !analysis.passed) throw Error('Incomplete gameplay evidence: ' + path);
  const { phaseCosts, layouts, ...measurements } = analysis;
  return { options: run.options, startedAt: run.startedAt, finishedAt: run.finishedAt, analysis: measurements };
};
const settingsReload = await read(paths.settingsReload), endingReload = await read(paths.endingReload);
if (!settingsReload.passed || !endingReload.passed) throw Error('Passing reload checks required');
const report = {
  generatedAt: new Date().toISOString(), paths,
  browser: await compactBrowser(paths.browser), recordings: await compactBrowser(paths.recordings), extras: await compactBrowser(paths.extras),
  retry: await compactBrowser(paths.retry), compact: await compactBrowser(paths.compact), settingsReload, endingReload,
  normal: await compactRun(paths.normal, paths.normalAnalysis), late: await compactRun(paths.late, paths.lateAnalysis),
  validation: { testCount, testsPassed: true, buildPassed: true, itchBuildPassed: true },
  limits: [
    'Assisted fixtures, not unassisted campaign clears or a consecutive round-68-to-148 soak.',
    'Normal run preceded the isolated replay-after-fail reset correction; that branch is exercised by the separate retry fixture. The late run and builds use the corrected code.',
    'Gameplay runs preceded the final tutorial-only hidden-control CSS correction; the tutorial and compact overlay fixtures were rerun after that change. The gameplay fixtures have tutorial progress completed.',
    'Compact transcript checks use the real overlay and synthetic target positions; integrated ability target projection is checked in the tutorial fixture.',
    'Recorded file decoding, starts, and longest playback were verified; human listening, physical controller hardware, and the pending Supreme video remain manual follow-up.'
  ]
};
await writeFile('docs/lyra-validation-measurements.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ browserChecks: report.browser.cases.length + report.recordings.cases.length + report.extras.cases.length + report.retry.cases.length,
  compactCases: report.compact.cases.length, testCount, normalPassed: report.normal.analysis.passed, latePassed: report.late.analysis.passed }));
